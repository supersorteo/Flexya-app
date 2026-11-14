import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { ClienteInput } from './core/models';
import { AuthService } from './core/services/auth.service';
import { DataService } from './core/services/data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

async function esperar(condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condicion()).toBe(true);
}

describe('Rutas por rol', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  async function clienteConSesion() {
    const auth = TestBed.inject(AuthService);
    const { usuario } = TestBed.inject(DataService).agregarCliente(cliente);
    const emision = await auth.invitar(usuario.id);
    await auth.activar(emision!.enlace.split('/').pop()!, 'Cliente123');
  }

  it('el cliente llega a Productos desde su navegación', async () => {
    await clienteConSesion();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cliente/productos');
    const el = harness.routeNativeElement as HTMLElement;
    await esperar(() => !!(harness.routeNativeElement as HTMLElement).querySelector('fx-productos'));
    harness.detectChanges();
    expect(el.textContent).toContain('Nuevo producto');
    expect(el.textContent).toContain('Todavía no cargaste ningún producto');
    expect([...el.querySelectorAll('.fx-bottomnav a')].map((a) => a.getAttribute('href'))).toContain('/cliente/productos');
  });

  it('la sección de productos es solo del cliente: otros roles y visitantes no entran', async () => {
    const auth = TestBed.inject(AuthService);
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/cliente/productos');
    expect(TestBed.inject(Router).url).toBe('/configuracion-inicial');

    await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    await harness.navigateByUrl('/cliente/productos');
    expect(TestBed.inject(Router).url).toBe('/admin/inicio');
  });
});
