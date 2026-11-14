import { Injectable, computed, signal } from '@angular/core';
import {
  Actividad, Cliente, ClienteInput, DB, Envio, Mensajero, MensajeroInput, EstadoEnvio, NuevoEnvio, NuevoLote, NuevoRetiro, Usuario, zonaDe, zonaPorId,
} from '../models';
import { createSeed } from './seed';

const KEY = 'flexya-demo-v8';

function generarClave(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => alfabeto[b % alfabeto.length]).join('');
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly db = signal<DB>(this.load());

  readonly usuarios = computed(() => this.db().usuarios);
  readonly clientes = computed(() => this.db().clientes);
  readonly mensajeros = computed(() => this.db().mensajeros);
  readonly envios = computed(() => this.db().envios);
  readonly lotes = computed(() => this.db().lotes);
  readonly retiros = computed(() => this.db().retiros);
  readonly actividades = computed(() => this.db().actividades);

  constructor() {
    this.log('Estado inicial');
  }

  enviosDe(user: Usuario | null): Envio[] {
    const all = this.envios();
    if (user?.rol === 'cliente') return all.filter((e) => e.clienteId === user.clienteId);
    if (user?.rol === 'mensajero') return all.filter((e) => e.mensajeroId === user.mensajeroId);
    return user ? all : [];
  }

  lotesDe(user: Usuario | null) {
    const all = this.lotes();
    return user?.rol === 'cliente' ? all.filter((l) => l.clienteId === user.clienteId) : all;
  }

  retirosDe(user: Usuario | null) {
    const all = this.retiros();
    return user?.rol === 'cliente' ? all.filter((r) => r.clienteId === user.clienteId) : all;
  }

  nombreCliente(id: string): string {
    return this.clientes().find((c) => c.id === id)?.nombre ?? '—';
  }

  nombreMensajero(id: string | null): string {
    return this.mensajeros().find((m) => m.id === id)?.nombre ?? '—';
  }

  crearEnvio(input: NuevoEnvio, clienteId: string): Envio {
    const envio: Envio = {
      ...input,
      id: `LF-${this.nextNumber(this.envios().map((e) => e.id), 10000)}`,
      clienteId,
      zonaId: zonaDe(input.localidad)?.id ?? '',
      estado: 'Pendiente',
      eta: 'A coordinar',
      importe: zonaDe(input.localidad)?.tarifa ?? 2200,
      mensajeroId: null,
      creadoEn: new Date().toISOString(),
    };
    this.mutate(`Nuevo envío ${envio.id}`, (d) => ({
      ...d,
      envios: [envio, ...d.envios],
      actividades: [this.actividad('blue', `Nuevo envío ${envio.id}`, `Creado para ${envio.destinatario}.`), ...d.actividades],
    }));
    return envio;
  }

  recepcionar(id: string) {
    this.cambiarEstado(id, 'En depósito', 'Listo para asignar', 'teal', 'Paquete recepcionado');
  }

  asignar(id: string, mensajeroId: string) {
    this.mutate(`Asignar ${id}`, (d) => ({
      ...d,
      envios: d.envios.map((e) =>
        e.id === id ? { ...e, estado: 'En reparto', mensajeroId, eta: 'Hoy' } : e,
      ),
      actividades: [
        this.actividad('blue', `Envío ${id} asignado`, `${this.nombreMensajero(mensajeroId)} tomó una nueva ruta.`),
        ...d.actividades,
      ],
    }));
  }

  entregar(id: string, recibidoPor = '') {
    this.cambiarEstado(
      id, 'Entregado', 'Hoy · ahora', 'teal', `Envío ${id} entregado`,
      { entregadoEn: new Date().toISOString(), ...(recibidoPor ? { recibidoPor } : {}) },
      recibidoPor ? `Recibió: ${recibidoPor}` : '',
    );
  }

  reportarIncidencia(id: string, motivo = '') {
    this.cambiarEstado(
      id, 'Incidencia', 'Requiere seguimiento', 'amber', `Incidencia en ${id}`,
      motivo ? { nota: motivo } : {},
      motivo ? `Motivo: ${motivo}` : '',
    );
  }

  ingresarLote(input: NuevoLote) {
    const id = `DEP-${String(this.nextNumber(this.lotes().map((l) => l.id), 0)).padStart(4, '0')}`;
    this.mutate(`Nuevo lote ${id}`, (d) => ({
      ...d,
      lotes: [{ ...input, id, recibidoEn: new Date().toISOString() }, ...d.lotes],
      actividades: [
        this.actividad('blue', 'Nuevo lote ingresado a depósito', `${this.nombreCliente(input.clienteId)} dejó ${input.unidades} unidades en ${input.ubicacion}.`),
        ...d.actividades,
      ],
    }));
  }

  solicitarRetiro(input: NuevoRetiro, clienteId: string) {
    const id = `RET-${this.nextNumber(this.retiros().map((r) => r.id), 100)}`;
    this.mutate(`Solicitud de retiro ${id}`, (d) => ({
      ...d,
      retiros: [{ ...input, id, clienteId, estado: 'Pendiente', creadoEn: new Date().toISOString() }, ...d.retiros],
      actividades: [
        this.actividad('amber', 'Retiro solicitado', `${this.nombreCliente(clienteId)} pidió retirar ${input.unidades} unidades.`),
        ...d.actividades,
      ],
    }));
  }

  aprobarRetiro(id: string) {
    const retiro = this.retiros().find((r) => r.id === id);
    if (!retiro) return;
    this.mutate(`Aprobar retiro ${id}`, (d) => ({
      ...d,
      retiros: d.retiros.map((r) => (r.id === id ? { ...r, estado: 'Aprobado' } : r)),
      lotes: d.lotes.map((l) =>
        l.id === retiro.loteId ? { ...l, unidades: Math.max(0, l.unidades - retiro.unidades) } : l,
      ),
    }));
  }

  agregarCliente(input: ClienteInput): { cliente: Cliente; clave: string } {
    const cliente: Cliente = {
      ...input,
      id: `c${this.nextNumber(this.clientes().map((c) => c.id), 0)}`,
      creadoEn: new Date().toISOString(),
    };
    const clave = generarClave();
    const usuario: Usuario = {
      id: `u${this.nextNumber(this.usuarios().map((u) => u.id), 0)}`,
      nombre: cliente.nombre,
      email: cliente.email,
      password: clave,
      rol: 'cliente',
      clienteId: cliente.id,
    };
    this.mutate(`Nuevo cliente ${cliente.id}`, (db) => ({
      ...db,
      clientes: [...db.clientes, cliente],
      usuarios: [...db.usuarios, usuario],
      actividades: [this.actividad('teal', 'Nuevo cliente', `${cliente.nombre} se dio de alta (plan ${cliente.plan}).`), ...db.actividades],
    }));
    return { cliente, clave };
  }

  actualizarCliente(id: string, input: ClienteInput) {
    this.mutate(`Cliente ${id} actualizado`, (db) => ({
      ...db,
      clientes: db.clientes.map((c) => (c.id === id ? { ...c, ...input } : c)),
      usuarios: db.usuarios.map((u) => (u.clienteId === id ? { ...u, nombre: input.nombre, email: input.email } : u)),
    }));
  }

  regenerarClave(clienteId: string): { email: string; clave: string } | null {
    return this.nuevaClave((u) => u.clienteId === clienteId);
  }

  private nuevaClave(coincide: (u: Usuario) => boolean): { email: string; clave: string } | null {
    const usuario = this.usuarios().find(coincide);
    if (!usuario) return null;
    const clave = generarClave();
    this.mutate(`Nueva clave para ${usuario.email}`, (db) => ({
      ...db,
      usuarios: db.usuarios.map((u) => (u.id === usuario.id ? { ...u, password: clave } : u)),
    }));
    return { email: usuario.email, clave };
  }

  motivoNoEliminable(id: string): string | null {
    const activos = this.envios().filter((e) => e.clienteId === id && !['Entregado', 'Cancelado'].includes(e.estado)).length;
    if (activos) return `Tiene ${activos} envío(s) activo(s).`;
    const stock = this.lotes().filter((l) => l.clienteId === id).reduce((s, l) => s + l.unidades, 0);
    if (stock) return `Tiene ${stock} unidades en depósito.`;
    return null;
  }

  eliminarCliente(id: string): boolean {
    if (this.motivoNoEliminable(id)) return false;
    this.mutate(`Cliente ${id} eliminado`, (d) => ({
      ...d,
      clientes: d.clientes.filter((c) => c.id !== id),
      usuarios: d.usuarios.filter((u) => u.clienteId !== id),
      lotes: d.lotes.filter((l) => l.clienteId !== id),
    }));
    return true;
  }

  nombreZona(id: string): string {
    return zonaPorId(id)?.nombre ?? '—';
  }

  agregarMensajero(input: MensajeroInput): { mensajero: Mensajero; clave: string } {
    const mensajero: Mensajero = {
      ...input,
      id: `m${this.nextNumber(this.mensajeros().map((m) => m.id), 0)}`,
      creadoEn: new Date().toISOString(),
    };
    const clave = generarClave();
    const usuario: Usuario = {
      id: `u${this.nextNumber(this.usuarios().map((u) => u.id), 0)}`,
      nombre: mensajero.nombre,
      email: mensajero.email,
      password: clave,
      rol: 'mensajero',
      mensajeroId: mensajero.id,
    };
    this.mutate(`Nuevo mensajero ${mensajero.id}`, (db) => ({
      ...db,
      mensajeros: [...db.mensajeros, mensajero],
      usuarios: [...db.usuarios, usuario],
      actividades: [
        this.actividad('teal', 'Nuevo mensajero', `${mensajero.nombre} se sumó al equipo (${this.nombreZona(mensajero.zonaId)}).`),
        ...db.actividades,
      ],
    }));
    return { mensajero, clave };
  }

  actualizarMensajero(id: string, input: MensajeroInput) {
    this.mutate(`Mensajero ${id} actualizado`, (db) => ({
      ...db,
      mensajeros: db.mensajeros.map((m) => (m.id === id ? { ...m, ...input } : m)),
      usuarios: db.usuarios.map((u) => (u.mensajeroId === id ? { ...u, nombre: input.nombre, email: input.email } : u)),
    }));
  }

  regenerarClaveMensajero(id: string): { email: string; clave: string } | null {
    return this.nuevaClave((u) => u.mensajeroId === id);
  }

  motivoMensajeroNoEliminable(id: string): string | null {
    const enReparto = this.envios().filter((e) => e.mensajeroId === id && e.estado === 'En reparto').length;
    return enReparto ? `Tiene ${enReparto} envío(s) en reparto.` : null;
  }

  eliminarMensajero(id: string): boolean {
    if (this.motivoMensajeroNoEliminable(id)) return false;
    this.mutate(`Mensajero ${id} eliminado`, (db) => ({
      ...db,
      mensajeros: db.mensajeros.filter((m) => m.id !== id),
      usuarios: db.usuarios.filter((u) => u.mensajeroId !== id),
    }));
    return true;
  }

  reset() {
    this.mutate('Demo restablecida', () => createSeed());
  }

  private cambiarEstado(
    id: string,
    estado: EstadoEnvio,
    eta: string,
    tono: Actividad['tono'],
    titulo: string,
    cambios: Partial<Envio> = {},
    detalle = '',
  ) {
    this.mutate(`${titulo} (${id})`, (d) => ({
      ...d,
      envios: d.envios.map((e) => (e.id === id ? { ...e, estado, eta, ...cambios } : e)),
      actividades: [this.actividad(tono, titulo, `Envío ${id} → ${estado}.${detalle ? ' ' + detalle : ''}`), ...d.actividades],
    }));
  }

  private actividad(tono: Actividad['tono'], titulo: string, detalle: string): Actividad {
    return { id: crypto.randomUUID(), tono, titulo, detalle, fecha: new Date().toISOString() };
  }

  private nextNumber(ids: string[], base: number): number {
    const max = ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, '')) || 0), base);
    return max + 1;
  }

  private mutate(motivo: string, fn: (d: DB) => DB) {
    this.db.update(fn);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db()));
    } catch {
      console.warn('[Flexya] No se pudo guardar en localStorage');
    }
    this.log(motivo);
  }

  private load(): DB {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as DB;
    } catch {
      /* datos corruptos: se vuelve a sembrar */
    }
    return createSeed();
  }

  private log(motivo: string) {
    const d = this.db();
    console.groupCollapsed(`[Flexya] ${motivo}`);
    console.log('DB completa:', d);
    (Object.keys(d) as (keyof DB)[]).forEach((k) => {
      console.log(k);
      console.table(d[k]);
    });
    console.groupEnd();
  }
}
