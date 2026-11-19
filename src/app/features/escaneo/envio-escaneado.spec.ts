import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ClienteInput, Envio, MensajeroInput } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero = (nombre: string, email: string, doc: string): MensajeroInput => ({
  nombre, tipoDocumento: 'DNI', numeroDocumento: doc, telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email, zonaId: 'caba-norte',
});
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

async function esperar(condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condicion()).toBe(true);
}

describe('Abrir un paquete escaneando su QR', () => {
  let data: DataService;
  let auth: AuthService;
  let envio: Envio;
  let santiagoId: string;

  beforeEach(async () => {
    harness = null;
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
    data = TestBed.inject(DataService);
    auth = TestBed.inject(AuthService);

    await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    const c = data.agregarCliente(cliente);
    const s = data.agregarMensajero(mensajero('Santiago Pereyra', 'santiago@flexya.com', '28456123'));
    data.agregarMensajero(mensajero('Micaela Roldán', 'micaela@flexya.com', '30211876'));
    santiagoId = s.mensajero.id;
    for (const [usuarioId, clave] of [[c.usuario.id, 'Cliente123'], [s.usuario.id, 'Mensajero123']]) {
      const emision = await auth.invitar(usuarioId);
      await auth.activar(emision!.enlace.split('/').pop()!, clave);
    }
    envio = data.crearEnvio({ ...destino, retiro: 'deposito' }, c.cliente.id);
  });

  async function entrar(email: string, clave: string) {
    auth.logout();
    expect((await auth.login(email, clave)).ok).toBe(true);
  }

  let harness: RouterTestingHarness | null = null;

  async function abrir(codigo: string) {
    harness ??= await RouterTestingHarness.create();
    await harness.navigateByUrl(`/e/${codigo}`);
    await esperar(() => !!(harness!.routeNativeElement as HTMLElement).querySelector('.fx-escaneo-hero, .fx-empty'));
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('el superadmin ve de quién es, los datos y puede recepcionar un paquete que llegó al depósito', async () => {
    await entrar('admin@flexya.com', 'Admin1234');
    const { el } = await abrir(envio.codigo);
    expect(el.querySelector('.fx-escaneo-dueno')!.textContent).toContain('Taller Sur');
    expect(el.textContent).toContain(envio.id);
    expect(el.textContent).toContain('Ana Gómez');
    expect(el.textContent).toContain('Av. Cabildo 1840');
    expect(el.textContent).toContain('Recepcionar en depósito');
  });

  it('el superadmin también encuentra el paquete con el enlace completo del QR o con el número LF-…', async () => {
    await entrar('admin@flexya.com', 'Admin1234');
    expect((await abrir(envio.codigo.toLowerCase())).el.querySelector('.fx-escaneo-dueno')).not.toBeNull();
    expect((await abrir(envio.id)).el.querySelector('.fx-escaneo-dueno')).not.toBeNull();
  });

  it('el mensajero asignado ve el paquete con las acciones de su paso (Entregado / Incidencia)', async () => {
    data.recepcionar(envio.id);
    data.asignar(envio.id, santiagoId);
    await entrar('santiago@flexya.com', 'Mensajero123');
    const { el } = await abrir(envio.codigo);
    expect(el.querySelector('.fx-escaneo-dueno')!.textContent).toContain('Taller Sur');
    const barra = el.querySelector('.fx-barra-acciones')!;
    expect(barra.textContent).toContain('Marcar entregado');
    expect(barra.textContent).toContain('Incidencia');
  });

  it('el mensajero al que no se lo asignaron no ve nada del paquete y se le explica por qué', async () => {
    data.recepcionar(envio.id);
    data.asignar(envio.id, data.mensajeros().find((m) => m.nombre === 'Micaela Roldán')!.id);
    await entrar('santiago@flexya.com', 'Mensajero123');
    const { el } = await abrir(envio.codigo);
    expect(el.querySelector('.fx-escaneo-hero')).toBeNull();
    expect(el.textContent).toContain('No encontramos este paquete');
    expect(el.textContent).toContain('pedile al superadmin que te lo asigne');
    expect(el.textContent).not.toContain('Ana Gómez');
  });

  it('el cliente dueño lo ve solo para consultar, sin acciones', async () => {
    await entrar('hola@tallersur.com', 'Cliente123');
    const { el } = await abrir(envio.codigo);
    expect(el.querySelector('.fx-escaneo-dueno')).not.toBeNull();
    expect(el.querySelector('.fx-barra-acciones')).toBeNull();
    expect(el.textContent).toContain('Solo podés consultar');
  });

  it('un código inventado muestra un mensaje claro y no un error', async () => {
    await entrar('admin@flexya.com', 'Admin1234');
    expect((await abrir('hola')).el.textContent).toContain('Ese código no es de un envío');
    expect((await abrir('ZZZZZZZZ')).el.textContent).toContain('No encontramos este paquete');
  });

  it('cada apertura queda registrada, y también la de quien no tenía acceso', async () => {
    await entrar('admin@flexya.com', 'Admin1234');
    await abrir(envio.codigo);
    expect(data.envios().find((e) => e.id === envio.id)!.escaneos).toHaveLength(1);

    data.recepcionar(envio.id);
    data.asignar(envio.id, data.mensajeros().find((m) => m.nombre === 'Micaela Roldán')!.id);
    await entrar('santiago@flexya.com', 'Mensajero123');
    await abrir(envio.codigo);
    const registros = data.envios().find((e) => e.id === envio.id)!.escaneos!;
    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({ rol: 'admin', resultado: 'ok' });
    expect(registros[1]).toMatchObject({ rol: 'mensajero', resultado: 'rechazado' });
  });

  describe('escanear sin haber iniciado sesión', () => {
    it('lleva a iniciar sesión recordando el paquete, y al ingresar vuelve a él', async () => {
      auth.logout();
      const router = TestBed.inject(Router);
      const h = await RouterTestingHarness.create();
      await h.navigateByUrl(`/e/${envio.codigo}`);
      await esperar(() => router.url.startsWith('/login'));
      expect(decodeURIComponent(router.url)).toContain(`volver=/e/${envio.codigo}`);

      const el = h.routeNativeElement as HTMLElement;
      await esperar(() => !!el.querySelector('#email'));
      const escribir = (selector: string, valor: string) => {
        const campo = el.querySelector<HTMLInputElement>(selector)!;
        campo.value = valor;
        campo.dispatchEvent(new Event('input'));
      };
      escribir('#email', 'admin@flexya.com');
      escribir('#login-clave', 'Admin1234');
      h.detectChanges();
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await esperar(() => router.url === `/e/${envio.codigo}`);
      const pantalla = h.fixture.nativeElement as HTMLElement;
      await esperar(() => !!pantalla.querySelector('.fx-escaneo-dueno'));
      expect(pantalla.querySelector('.fx-escaneo-dueno')!.textContent).toContain('Taller Sur');
    });

    it('si la ruta a la que se quería volver no es de la app, se ignora y se va al inicio', async () => {
      auth.logout();
      const router = TestBed.inject(Router);
      const h = await RouterTestingHarness.create();
      await h.navigateByUrl('/login?volver=https://malo.com');
      const el = h.routeNativeElement as HTMLElement;
      await esperar(() => !!el.querySelector('#email'));
      const escribir = (selector: string, valor: string) => {
        const campo = el.querySelector<HTMLInputElement>(selector)!;
        campo.value = valor;
        campo.dispatchEvent(new Event('input'));
      };
      escribir('#email', 'admin@flexya.com');
      escribir('#login-clave', 'Admin1234');
      h.detectChanges();
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await esperar(() => router.url.startsWith('/admin'));
      expect(router.url).toContain('/admin/inicio');
    });
  });
});
