import { Injectable, computed, inject, signal } from '@angular/core';
import { CONFIG } from '../config';
import { CorreoSimulado, Rol, TipoToken, Usuario } from '../models';
import { generarSal, generarToken, hashClave, hashToken, igualesSeguro } from '../security/crypto';
import { claveValida } from '../../shared/forms/validators';
import { DataService } from './data.service';

const KEY = 'flexya-sesion-v2';
const KEY_PERSISTENTE = 'flexya-sesion';
const MINUTO = 60_000;

interface Sesion {
  id: string;
  version: number;
}

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'credenciales' | 'suspendida' | 'bloqueada'; hasta?: string };

export interface Emision {
  enlace: string;
  correo: CorreoSimulado;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly data = inject(DataService);
  private readonly sesion = signal<Sesion | null>(this.restaurar());

  readonly user = computed<Usuario | null>(() => {
    const s = this.sesion();
    if (!s) return null;
    const u = this.data.usuarios().find((x) => x.id === s.id);
    return u && u.estado === 'ACTIVO' && u.versionSesion === s.version ? u : null;
  });

  async login(email: string, clave: string): Promise<ResultadoLogin> {
    const usuario = this.data.usuarios().find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!usuario) {
      await hashClave(clave, 'sal-de-relleno');
      return { ok: false, motivo: 'credenciales' };
    }
    if (usuario.bloqueadoHasta && new Date(usuario.bloqueadoHasta) > new Date()) {
      return { ok: false, motivo: 'bloqueada', hasta: usuario.bloqueadoHasta };
    }
    if (!usuario.claveHash || !usuario.sal) {
      await hashClave(clave, 'sal-de-relleno');
      return { ok: false, motivo: 'credenciales' };
    }
    if (!(await this.coincideClave(clave, usuario))) return this.registrarFallo(usuario);
    if (usuario.estado === 'SUSPENDIDO') return { ok: false, motivo: 'suspendida' };
    if (usuario.estado !== 'ACTIVO') return { ok: false, motivo: 'credenciales' };

    this.data.actualizarUsuario(usuario.id, { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date().toISOString() });
    this.abrirSesion(usuario.id, usuario.versionSesion);
    return { ok: true, usuario: this.data.usuarios().find((u) => u.id === usuario.id) ?? usuario };
  }

  logout() {
    const actual = this.sesion();
    this.sesion.set(null);
    try {
      sessionStorage.removeItem(KEY);
      const recordada = this.leer(localStorage, KEY_PERSISTENTE);
      if (recordada && recordada.id === actual?.id) localStorage.removeItem(KEY_PERSISTENTE);
    } catch {
      /* noop */
    }
  }

  homeFor(rol: Rol): string {
    return `/${rol}/inicio`;
  }

  verificarSesion(): boolean {
    return this.user() !== null;
  }

  async configurarSuperadmin(datos: { nombre: string; email: string; clave: string }): Promise<Usuario | null> {
    if (!this.data.necesitaConfiguracion() || !claveValida(datos.clave)) return null;
    const sal = generarSal();
    const usuario = this.data.crearSuperadmin(datos.nombre.trim(), datos.email, await hashClave(datos.clave, sal), sal);
    this.abrirSesion(usuario.id, usuario.versionSesion);
    return usuario;
  }

  async invitar(usuarioId: string): Promise<Emision | null> {
    const usuario = this.usuarioPorId(usuarioId);
    if (!usuario || usuario.estado !== 'PENDIENTE') return null;
    return this.emitir(usuario, 'ACTIVACION', CONFIG.vigenciaInvitacionHoras * 60 * MINUTO);
  }

  async recuperacionAdmin(usuarioId: string): Promise<Emision | null> {
    const usuario = this.usuarioPorId(usuarioId);
    if (!usuario || usuario.estado !== 'ACTIVO') return null;
    return this.emitir(usuario, 'RECUPERACION', CONFIG.vigenciaRecuperacionMinutos * MINUTO);
  }

  async solicitarRecuperacion(email: string): Promise<void> {
    const usuario = this.data.usuarios().find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (usuario?.estado === 'ACTIVO') await this.emitir(usuario, 'RECUPERACION', CONFIG.vigenciaRecuperacionMinutos * MINUTO);
  }

  async consultarToken(tipo: TipoToken, token: string): Promise<{ usuario: Usuario; tokenId: string } | null> {
    const hash = await hashToken(token);
    const t = this.data.tokens().find((x) => x.tipo === tipo && igualesSeguro(x.tokenHash, hash));
    if (!t || t.usadoEn || new Date(t.expiraEn) < new Date()) return null;
    const usuario = this.usuarioPorId(t.usuarioId);
    if (!usuario) return null;
    if (tipo === 'ACTIVACION' && usuario.estado !== 'PENDIENTE') return null;
    if (tipo === 'RECUPERACION' && usuario.estado !== 'ACTIVO') return null;
    return { usuario, tokenId: t.id };
  }

  async activar(token: string, clave: string): Promise<'ok' | 'invalido' | 'clave'> {
    if (!claveValida(clave)) return 'clave';
    const valido = await this.consultarToken('ACTIVACION', token);
    if (!valido) return 'invalido';
    const sal = generarSal();
    const version = valido.usuario.versionSesion + 1;
    this.data.actualizarUsuario(valido.usuario.id, {
      claveHash: await hashClave(clave, sal),
      sal,
      estado: 'ACTIVO',
      intentosFallidos: 0,
      bloqueadoHasta: null,
      ultimoAcceso: new Date().toISOString(),
      versionSesion: version,
    });
    this.data.marcarTokenUsado(valido.tokenId);
    this.abrirSesion(valido.usuario.id, version);
    return 'ok';
  }

  async restablecer(token: string, clave: string): Promise<'ok' | 'invalido' | 'clave'> {
    if (!claveValida(clave)) return 'clave';
    const valido = await this.consultarToken('RECUPERACION', token);
    if (!valido) return 'invalido';
    const sal = generarSal();
    this.data.actualizarUsuario(valido.usuario.id, {
      claveHash: await hashClave(clave, sal),
      sal,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      versionSesion: valido.usuario.versionSesion + 1,
    });
    this.data.marcarTokenUsado(valido.tokenId);
    return 'ok';
  }

  async cambiarClave(actual: string, nueva: string): Promise<'ok' | 'actual' | 'clave' | 'igual' | 'sin-sesion'> {
    const usuario = this.user();
    if (!usuario) return 'sin-sesion';
    if (!(await this.coincideClave(actual, usuario))) return 'actual';
    if (!claveValida(nueva)) return 'clave';
    if (actual === nueva) return 'igual';
    const sal = generarSal();
    const version = usuario.versionSesion + 1;
    this.data.actualizarUsuario(usuario.id, { claveHash: await hashClave(nueva, sal), sal, versionSesion: version });
    this.abrirSesion(usuario.id, version);
    return 'ok';
  }

  suspender(usuarioId: string): boolean {
    if (this.data.motivoNoSuspender(usuarioId)) return false;
    this.data.cambiarEstadoCuenta(usuarioId, 'SUSPENDIDO');
    return true;
  }

  reactivar(usuarioId: string) {
    const usuario = this.usuarioPorId(usuarioId);
    if (usuario) this.data.cambiarEstadoCuenta(usuarioId, usuario.claveHash ? 'ACTIVO' : 'PENDIENTE');
  }

  private async emitir(usuario: Usuario, tipo: TipoToken, vigenciaMs: number): Promise<Emision> {
    this.data.invalidarTokens(usuario.id, tipo);
    const token = generarToken();
    this.data.guardarToken({
      id: crypto.randomUUID(),
      usuarioId: usuario.id,
      tipo,
      tokenHash: await hashToken(token),
      expiraEn: new Date(Date.now() + vigenciaMs).toISOString(),
      usadoEn: null,
    });
    const activacion = tipo === 'ACTIVACION';
    const enlace = `${location.origin}/${activacion ? 'activar' : 'restablecer'}/${token}`;
    const correo: CorreoSimulado = {
      id: crypto.randomUUID(),
      para: usuario.email,
      nombre: usuario.nombre,
      asunto: activacion ? 'Activá tu cuenta de Flexya' : 'Restablecé tu contraseña de Flexya',
      texto: activacion
        ? `Hola ${usuario.nombre}, te dimos de alta en Flexya. Para activar tu cuenta y elegir tu contraseña usá el siguiente enlace. Vence en ${CONFIG.vigenciaInvitacionHoras} horas.`
        : `Hola ${usuario.nombre}, recibimos un pedido para cambiar tu contraseña. Usá el siguiente enlace. Vence en ${CONFIG.vigenciaRecuperacionMinutos} minutos. Si no fuiste vos, ignorá este correo.`,
      enlace,
      tipo,
      fecha: new Date().toISOString(),
    };
    this.data.agregarCorreo(correo);
    return { enlace, correo };
  }

  private async registrarFallo(usuario: Usuario): Promise<ResultadoLogin> {
    const intentos = usuario.intentosFallidos + 1;
    if (intentos >= CONFIG.intentosMaximos) {
      const hasta = new Date(Date.now() + CONFIG.bloqueoMinutos * MINUTO).toISOString();
      this.data.actualizarUsuario(usuario.id, { intentosFallidos: 0, bloqueadoHasta: hasta });
      return { ok: false, motivo: 'bloqueada', hasta };
    }
    this.data.actualizarUsuario(usuario.id, { intentosFallidos: intentos });
    return { ok: false, motivo: 'credenciales' };
  }

  private async coincideClave(clave: string, usuario: Usuario): Promise<boolean> {
    if (!usuario.claveHash || !usuario.sal) return false;
    return igualesSeguro(await hashClave(clave, usuario.sal), usuario.claveHash);
  }

  private usuarioPorId(id: string) {
    return this.data.usuarios().find((u) => u.id === id);
  }

  private abrirSesion(id: string, version: number) {
    this.guardarSesion({ id, version });
  }

  private guardarSesion(s: Sesion) {
    this.sesion.set(s);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
      localStorage.setItem(KEY_PERSISTENTE, JSON.stringify(s));
    } catch {
      /* sesión solo en memoria */
    }
  }

  private leer(almacen: Storage, clave: string): Sesion | null {
    try {
      const raw = almacen.getItem(clave);
      const s = raw ? (JSON.parse(raw) as Partial<Sesion>) : null;
      return s && typeof s.id === 'string' && typeof s.version === 'number' ? { id: s.id, version: s.version } : null;
    } catch {
      return null;
    }
  }

  private restaurar(): Sesion | null {
    try {
      return this.leer(sessionStorage, KEY) ?? this.leer(localStorage, KEY_PERSISTENTE);
    } catch {
      return null;
    }
  }
}
