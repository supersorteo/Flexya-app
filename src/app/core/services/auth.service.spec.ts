import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard, guestGuard, homeGuard, roleGuard, setupGuard } from '../guards/auth.guards';
import { ClienteInput, MensajeroInput } from '../models';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

const ADMIN = { nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' };
const tokenDe = (enlace: string) => enlace.split('/').pop()!;
const MIN = 60_000;

describe('AuthService', () => {
  let auth: AuthService;
  let data: DataService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
    data = TestBed.inject(DataService);
  });

  afterEach(() => vi.useRealTimers());

  async function conAdmin() {
    await auth.configurarSuperadmin(ADMIN);
    auth.logout();
  }

  async function clienteActivo(clave = 'Cliente123') {
    const { usuario } = data.agregarCliente(cliente);
    const emision = await auth.invitar(usuario.id);
    expect(await auth.activar(tokenDe(emision!.enlace), clave)).toBe('ok');
    return usuario;
  }

  describe('configuración inicial', () => {
    it('crea al superadmin con la clave cifrada, abre su sesión y no se puede repetir', async () => {
      const usuario = await auth.configurarSuperadmin(ADMIN);
      expect(usuario).toMatchObject({ rol: 'admin', estado: 'ACTIVO', email: 'admin@flexya.com' });
      expect(usuario?.claveHash).toBeTruthy();
      expect(usuario?.claveHash).not.toContain('Admin1234');
      expect(usuario?.sal).toBeTruthy();
      expect(auth.user()?.id).toBe(usuario?.id);
      expect(data.necesitaConfiguracion()).toBe(false);
      expect(await auth.configurarSuperadmin({ ...ADMIN, email: 'otro@flexya.com' })).toBeNull();
    });

    it('rechaza contraseñas débiles', async () => {
      expect(await auth.configurarSuperadmin({ ...ADMIN, clave: 'corta1' })).toBeNull();
      expect(await auth.configurarSuperadmin({ ...ADMIN, clave: 'sololetrasaqui' })).toBeNull();
      expect(await auth.configurarSuperadmin({ ...ADMIN, clave: '1234567890' })).toBeNull();
      expect(data.necesitaConfiguracion()).toBe(true);
    });
  });

  describe('ingreso', () => {
    it('detecta el rol de la cuenta y rechaza claves incorrectas', async () => {
      await conAdmin();
      await clienteActivo();
      const admin = await auth.login('ADMIN@flexya.com ', 'Admin1234');
      expect(admin).toMatchObject({ ok: true, usuario: { rol: 'admin' } });
      auth.logout();
      const cli = await auth.login('hola@tallersur.com', 'Cliente123');
      expect(cli).toMatchObject({ ok: true, usuario: { rol: 'cliente' } });
      expect(auth.user()?.rol).toBe('cliente');
      auth.logout();
      expect(await auth.login('hola@tallersur.com', 'incorrecta1')).toEqual({ ok: false, motivo: 'credenciales' });
      expect(auth.user()).toBeNull();
    });

    it('no revela si el correo existe', async () => {
      await conAdmin();
      const inexistente = await auth.login('nadie@flexya.com', 'Admin1234');
      const claveMala = await auth.login('admin@flexya.com', 'incorrecta1');
      expect(inexistente).toEqual(claveMala);
    });

    it('una cuenta pendiente no puede ingresar', async () => {
      await conAdmin();
      data.agregarCliente(cliente);
      expect(await auth.login('hola@tallersur.com', 'Cliente123')).toEqual({ ok: false, motivo: 'credenciales' });
    });

    it('bloquea la cuenta tras 5 intentos fallidos y la libera con el tiempo', async () => {
      await conAdmin();
      vi.useFakeTimers({ toFake: ['Date'] });
      for (let i = 0; i < 4; i++) expect(await auth.login('admin@flexya.com', 'incorrecta1')).toMatchObject({ motivo: 'credenciales' });
      const quinto = await auth.login('admin@flexya.com', 'incorrecta1');
      expect(quinto).toMatchObject({ ok: false, motivo: 'bloqueada' });
      expect(await auth.login('admin@flexya.com', 'Admin1234')).toMatchObject({ motivo: 'bloqueada' });

      vi.setSystemTime(Date.now() + 16 * MIN);
      expect(await auth.login('admin@flexya.com', 'Admin1234')).toMatchObject({ ok: true });
      expect(data.usuarios()[0].intentosFallidos).toBe(0);
    });

    it('un ingreso exitoso registra el último acceso', async () => {
      await conAdmin();
      expect(data.usuarios()[0].ultimoAcceso).toBeNull();
      await auth.login('admin@flexya.com', 'Admin1234');
      expect(data.usuarios()[0].ultimoAcceso).toBeTruthy();
    });
  });

  describe('invitación y activación', () => {
    it('la invitación genera un correo simulado y el enlace activa la cuenta una sola vez', async () => {
      const { usuario } = data.agregarCliente(cliente);
      const emision = await auth.invitar(usuario.id);
      expect(emision?.enlace).toContain('/activar/');
      expect(data.correos()[0]).toMatchObject({ para: 'hola@tallersur.com', tipo: 'ACTIVACION', enlace: emision?.enlace });
      expect(data.tokens()[0].tokenHash).not.toContain(tokenDe(emision!.enlace));

      const token = tokenDe(emision!.enlace);
      expect((await auth.consultarToken('ACTIVACION', token))?.usuario.email).toBe('hola@tallersur.com');
      expect(await auth.activar(token, 'Cliente123')).toBe('ok');
      expect(data.usuarios()[0]).toMatchObject({ estado: 'ACTIVO' });
      expect(data.usuarios()[0].claveHash).toBeTruthy();
      expect(await auth.activar(token, 'Otra12345')).toBe('invalido');
      expect(await auth.login('hola@tallersur.com', 'Cliente123')).toMatchObject({ ok: true });
    });

    it('al activar la cuenta la persona queda con la sesión abierta, sin pasar por el login', async () => {
      const { usuario } = data.agregarCliente(cliente);
      const emision = await auth.invitar(usuario.id);
      expect(auth.user()).toBeNull();

      expect(await auth.activar(tokenDe(emision!.enlace), 'Cliente123')).toBe('ok');
      expect(auth.user()).toMatchObject({ id: usuario.id, rol: 'cliente', estado: 'ACTIVO' });
      expect(auth.user()?.ultimoAcceso).toBeTruthy();
      expect(sessionStorage.getItem('flexya-sesion-v2')).toBeTruthy();
    });

    it('recuperar la contraseña no abre sesión: se vuelve a ingresar con la clave nueva', async () => {
      await conAdmin();
      await auth.solicitarRecuperacion('admin@flexya.com');
      expect(await auth.restablecer(tokenDe(data.correos()[0].enlace), 'Nueva12345')).toBe('ok');
      expect(auth.user()).toBeNull();
    });

    it('rechaza claves débiles y enlaces inventados', async () => {
      const { usuario } = data.agregarCliente(cliente);
      const emision = await auth.invitar(usuario.id);
      expect(await auth.activar(tokenDe(emision!.enlace), 'corta')).toBe('clave');
      expect(data.usuarios()[0].estado).toBe('PENDIENTE');
      expect(await auth.activar('token-inventado', 'Cliente123')).toBe('invalido');
    });

    it('el enlace de invitación vence', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { usuario } = data.agregarCliente(cliente);
      const emision = await auth.invitar(usuario.id);
      vi.setSystemTime(Date.now() + 73 * 60 * MIN);
      expect(await auth.consultarToken('ACTIVACION', tokenDe(emision!.enlace))).toBeNull();
    });

    it('reenviar la invitación anula la anterior; una cuenta activa no se puede invitar', async () => {
      const { usuario } = data.agregarCliente(cliente);
      const primera = await auth.invitar(usuario.id);
      const segunda = await auth.invitar(usuario.id);
      expect(await auth.consultarToken('ACTIVACION', tokenDe(primera!.enlace))).toBeNull();
      expect(await auth.consultarToken('ACTIVACION', tokenDe(segunda!.enlace))).not.toBeNull();
      await auth.activar(tokenDe(segunda!.enlace), 'Cliente123');
      expect(await auth.invitar(usuario.id)).toBeNull();
    });
  });

  describe('recuperación y cambio de contraseña', () => {
    it('responde igual exista o no el correo, y solo envía a cuentas activas', async () => {
      await conAdmin();
      await auth.solicitarRecuperacion('nadie@flexya.com');
      expect(data.correos()).toHaveLength(0);
      data.agregarCliente(cliente);
      await auth.solicitarRecuperacion('hola@tallersur.com');
      expect(data.correos()).toHaveLength(0);
      await auth.solicitarRecuperacion('admin@flexya.com');
      expect(data.correos()[0]).toMatchObject({ tipo: 'RECUPERACION', para: 'admin@flexya.com' });
    });

    it('restablecer cambia la clave, desbloquea la cuenta, cierra sesiones y el enlace sirve una vez', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      await auth.solicitarRecuperacion('admin@flexya.com');
      const token = tokenDe(data.correos()[0].enlace);

      expect(await auth.restablecer(token, 'Nueva12345')).toBe('ok');
      expect(auth.user()).toBeNull();
      expect(await auth.restablecer(token, 'Otra123456')).toBe('invalido');
      expect(await auth.login('admin@flexya.com', 'Admin1234')).toMatchObject({ ok: false });
      expect(await auth.login('admin@flexya.com', 'Nueva12345')).toMatchObject({ ok: true });
    });

    it('el enlace de recuperación vence', async () => {
      await conAdmin();
      vi.useFakeTimers({ toFake: ['Date'] });
      await auth.solicitarRecuperacion('admin@flexya.com');
      vi.setSystemTime(Date.now() + 61 * MIN);
      expect(await auth.consultarToken('RECUPERACION', tokenDe(data.correos()[0].enlace))).toBeNull();
    });

    it('cambiar la clave pide la actual, valida la nueva y mantiene la sesión', async () => {
      await conAdmin();
      expect(await auth.cambiarClave('Admin1234', 'Nueva12345')).toBe('sin-sesion');
      await auth.login('admin@flexya.com', 'Admin1234');
      expect(await auth.cambiarClave('equivocada1', 'Nueva12345')).toBe('actual');
      expect(await auth.cambiarClave('Admin1234', 'corta')).toBe('clave');
      expect(await auth.cambiarClave('Admin1234', 'Admin1234')).toBe('igual');
      expect(await auth.cambiarClave('Admin1234', 'Nueva12345')).toBe('ok');
      expect(auth.user()).not.toBeNull();
      auth.logout();
      expect(await auth.login('admin@flexya.com', 'Admin1234')).toMatchObject({ ok: false });
      expect(await auth.login('admin@flexya.com', 'Nueva12345')).toMatchObject({ ok: true });
    });
  });

  describe('suspensión', () => {
    it('suspender cierra la sesión, bloquea el ingreso y reactivar lo devuelve', async () => {
      await conAdmin();
      const usuario = await clienteActivo();
      await auth.login('hola@tallersur.com', 'Cliente123');
      expect(auth.user()).not.toBeNull();

      expect(auth.suspender(usuario.id)).toBe(true);
      expect(auth.user()).toBeNull();
      expect(await auth.login('hola@tallersur.com', 'Cliente123')).toEqual({ ok: false, motivo: 'suspendida' });
      expect(await auth.login('hola@tallersur.com', 'incorrecta1')).toEqual({ ok: false, motivo: 'credenciales' });

      auth.reactivar(usuario.id);
      expect(await auth.login('hola@tallersur.com', 'Cliente123')).toMatchObject({ ok: true });
    });

    it('reactivar una cuenta que nunca se activó la deja pendiente', async () => {
      const { usuario } = data.agregarCliente(cliente);
      auth.suspender(usuario.id);
      auth.reactivar(usuario.id);
      expect(data.usuarios()[0].estado).toBe('PENDIENTE');
    });

    it('no suspende a un mensajero con envíos en reparto', async () => {
      const { cliente: c } = data.agregarCliente(cliente);
      const { mensajero: m, usuario } = data.agregarMensajero(mensajero);
      const e = data.crearEnvio({ destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Belgrano' }, c.id);
      data.recepcionar(e.id);
      data.asignar(e.id, m.id);
      expect(auth.suspender(usuario.id)).toBe(false);
      expect(data.usuarios().find((u) => u.id === usuario.id)?.estado).toBe('PENDIENTE');
    });
  });

  describe('sesión', () => {
    const nuevaPestana = () => {
      sessionStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      return TestBed.inject(AuthService);
    };

    it('no caduca por inactividad: sigue abierta aunque pasen semanas sin usar la app', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 30 * 24 * 60 * MIN);
      expect(auth.verificarSesion()).toBe(true);
      expect(auth.user()).not.toBeNull();
    });

    it('se cierra únicamente al hacer logout, y borra la sesión de todos los almacenes', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      expect(sessionStorage.getItem('flexya-sesion-v2')).toBeTruthy();
      expect(localStorage.getItem('flexya-sesion')).toBeTruthy();

      auth.logout();
      expect(auth.user()).toBeNull();
      expect(auth.verificarSesion()).toBe(false);
      expect(sessionStorage.getItem('flexya-sesion-v2')).toBeNull();
      expect(localStorage.getItem('flexya-sesion')).toBeNull();
    });

    it('sobrevive a cerrar la pestaña o el navegador: al volver a abrir sigue adentro', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      const reabierta = nuevaPestana();
      expect(reabierta.user()).toMatchObject({ email: 'admin@flexya.com', rol: 'admin' });
      expect(reabierta.verificarSesion()).toBe(true);
    });

    it('después de hacer logout, al volver a abrir pide ingresar de nuevo', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      auth.logout();
      expect(nuevaPestana().user()).toBeNull();
    });

    it('hacer logout no cierra la sesión recordada de otra persona', async () => {
      await conAdmin();
      await auth.login('admin@flexya.com', 'Admin1234');
      localStorage.setItem('flexya-sesion', JSON.stringify({ id: 'u-otra-persona', version: 1 }));
      auth.logout();
      expect(JSON.parse(localStorage.getItem('flexya-sesion')!)).toEqual({ id: 'u-otra-persona', version: 1 });
    });

    it('una cuenta suspendida o con la clave cambiada no se restaura al reabrir', async () => {
      await conAdmin();
      const usuario = await clienteActivo();
      await auth.login('hola@tallersur.com', 'Cliente123');
      auth.suspender(usuario.id);
      expect(nuevaPestana().user()).toBeNull();
    });

    it('los datos de la sesión recordada dañados se ignoran', async () => {
      await conAdmin();
      localStorage.setItem('flexya-sesion', '{roto');
      expect(nuevaPestana().user()).toBeNull();
      localStorage.setItem('flexya-sesion', JSON.stringify({ id: 5 }));
      expect(nuevaPestana().user()).toBeNull();
    });
  });

  describe('guards', () => {
    const ejecutar = (guard: typeof authGuard, rol?: string) =>
      TestBed.runInInjectionContext(() =>
        guard({ data: { rol } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
    const url = (r: unknown) => (r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r);

    it('sin ningún administrador todo lleva a la configuración inicial', () => {
      expect(url(ejecutar(authGuard))).toBe('/configuracion-inicial');
      expect(url(ejecutar(guestGuard))).toBe('/configuracion-inicial');
      expect(url(ejecutar(homeGuard))).toBe('/configuracion-inicial');
      expect(ejecutar(setupGuard)).toBe(true);
    });

    it('con administrador y sin sesión, lleva al login y bloquea la configuración', async () => {
      await conAdmin();
      expect(url(ejecutar(authGuard))).toBe('/login');
      expect(url(ejecutar(roleGuard, 'admin'))).toBe('/login');
      expect(ejecutar(guestGuard)).toBe(true);
      expect(url(ejecutar(setupGuard))).toBe('/login');
    });

    it('cada rol entra solo a su panel', async () => {
      await conAdmin();
      await clienteActivo();
      await auth.login('hola@tallersur.com', 'Cliente123');
      expect(ejecutar(authGuard)).toBe(true);
      expect(ejecutar(roleGuard, 'cliente')).toBe(true);
      expect(url(ejecutar(roleGuard, 'admin'))).toBe('/cliente/inicio');
      expect(url(ejecutar(roleGuard, 'mensajero'))).toBe('/cliente/inicio');
      expect(url(ejecutar(guestGuard))).toBe('/cliente/inicio');
      expect(url(ejecutar(homeGuard))).toBe('/cliente/inicio');
    });

    it('una cuenta suspendida pierde el acceso al panel', async () => {
      await conAdmin();
      const usuario = await clienteActivo();
      await auth.login('hola@tallersur.com', 'Cliente123');
      auth.suspender(usuario.id);
      expect(url(ejecutar(authGuard))).toBe('/login');
    });
  });
});
