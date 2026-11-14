import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ClienteInput } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';

const cliente: ClienteInput = {
  nombre: 'Casa Nómade S.R.L.', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '',
  email: 'info@casanomade.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '30-71234567-1',
  tipoCliente: 'empresa', nombreComercial: 'Casa Nómade', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

async function esperar(condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condicion()).toBe(true);
}

describe('Enlaces de invitación y recuperación por la URL real', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  it('el enlace de invitación de una empresa abre la pantalla de activación con sus datos', async () => {
    const data = TestBed.inject(DataService);
    const auth = TestBed.inject(AuthService);
    const { usuario } = data.agregarCliente(cliente);
    const emision = await auth.invitar(usuario.id);

    const harness = await RouterTestingHarness.create();
    const ruta = new URL(emision!.enlace);
    await harness.navigateByUrl(ruta.pathname);
    const el = harness.routeNativeElement as HTMLElement;
    await esperar(() => (harness.routeNativeElement as HTMLElement).textContent!.includes('info@casanomade.com'));
    harness.detectChanges();
    expect(el.textContent).toContain('Activá tu cuenta');
    expect(el.textContent).not.toContain('Enlace no válido');
  });

  it('el mismo enlace en un navegador sin esos datos (otra ventana privada u otro navegador) no es válido', async () => {
    const data = TestBed.inject(DataService);
    const { usuario } = data.agregarCliente(cliente);
    const emision = await TestBed.inject(AuthService).invitar(usuario.id);
    const token = emision!.enlace.split('/').pop()!;

    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/activar/${token}`);
    await esperar(() => (harness.routeNativeElement as HTMLElement).textContent!.includes('Enlace no válido'));
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('venció o ya se usó');
  });
});
