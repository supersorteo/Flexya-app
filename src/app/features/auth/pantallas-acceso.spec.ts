import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ClienteInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ClaveEnlace } from './clave-enlace';
import { ConfiguracionInicial } from './configuracion-inicial';
import { Correos } from './correos';
import { Cuenta } from './cuenta';
import { Login } from './login';
import { Olvide } from './olvide';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

const escribir = (el: HTMLElement, selector: string, valor: string) => {
  const input = el.querySelector<HTMLInputElement>(selector)!;
  input.value = valor;
  input.dispatchEvent(new Event('input'));
};
const enviar = (el: HTMLElement) => el.querySelector('form')!.dispatchEvent(new Event('submit'));
const texto = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent ?? '';

async function esperar(f: ComponentFixture<unknown>, condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) {
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();
  }
  f.detectChanges();
  expect(condicion()).toBe(true);
}

describe('Pantallas de acceso', () => {
  let alerta: { exito: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };
  let navegar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    alerta = { exito: vi.fn(), advertencia: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AlertService, useValue: alerta }] });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  async function adminCreado() {
    const auth = TestBed.inject(AuthService);
    await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    auth.logout();
  }

  describe('configuración inicial', () => {
    it('crea al superadmin, mide la fuerza de la contraseña y entra a su panel', async () => {
      const f = TestBed.createComponent(ConfiguracionInicial);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;

      escribir(el, '#cfg-nombre', 'Marina Ríos');
      escribir(el, '#cfg-email', 'admin@flexya.com');
      escribir(el, '#cfg-clave', 'Admin1234');
      f.detectChanges();
      expect(el.querySelectorAll('.fx-requisitos li.ok')).toHaveLength(3);

      escribir(el, '#cfg-confirmar', 'Distinta123');
      enviar(el);
      f.detectChanges();
      expect(texto(f)).toContain('Las contraseñas no coinciden.');
      expect(TestBed.inject(DataService).necesitaConfiguracion()).toBe(true);

      escribir(el, '#cfg-confirmar', 'Admin1234');
      enviar(el);
      await esperar(f, () => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith(['/admin/inicio']);
      expect(TestBed.inject(DataService).necesitaConfiguracion()).toBe(false);
    });

    it('no deja avanzar con datos inválidos', () => {
      const f = TestBed.createComponent(ConfiguracionInicial);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      escribir(el, '#cfg-nombre', 'Marina');
      escribir(el, '#cfg-email', 'no-es-un-correo');
      escribir(el, '#cfg-clave', 'corta');
      enviar(el);
      f.detectChanges();
      expect(texto(f)).toContain('nombre y apellido');
      expect(texto(f)).toContain('correo válido');
      expect(texto(f)).toContain('Mínimo 8 caracteres');
      expect(navegar).not.toHaveBeenCalled();
    });
  });

  describe('ingreso', () => {
    it('muestra un error genérico con datos incorrectos y entra con los correctos', async () => {
      await adminCreado();
      const f = TestBed.createComponent(Login);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;

      escribir(el, '#email', 'admin@flexya.com');
      escribir(el, '#login-clave', 'Equivocada1');
      enviar(el);
      await esperar(f, () => texto(f).includes('Correo o contraseña incorrectos'));
      expect(navegar).not.toHaveBeenCalled();

      escribir(el, '#login-clave', 'Admin1234');
      enviar(el);
      await esperar(f, () => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith(['/admin/inicio']);
    });

    it('ofrece recuperar la contraseña y permite ver la que se escribe', async () => {
      await adminCreado();
      const f = TestBed.createComponent(Login);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('a[href="/olvide"]')).not.toBeNull();

      const campo = el.querySelector<HTMLInputElement>('#login-clave')!;
      expect(campo.type).toBe('password');
      el.querySelector<HTMLButtonElement>('.fx-eye')!.click();
      f.detectChanges();
      expect(campo.type).toBe('text');
    });

    it('un cliente entra a su propio panel', async () => {
      await adminCreado();
      const data = TestBed.inject(DataService);
      const auth = TestBed.inject(AuthService);
      const { usuario } = data.agregarCliente(cliente);
      const emision = await auth.invitar(usuario.id);
      await auth.activar(emision!.enlace.split('/').pop()!, 'Cliente123');

      const f = TestBed.createComponent(Login);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      escribir(el, '#email', 'hola@tallersur.com');
      escribir(el, '#login-clave', 'Cliente123');
      enviar(el);
      await esperar(f, () => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith(['/cliente/inicio']);
    });
  });

  describe('activar cuenta y restablecer contraseña', () => {
    function abrir(tipo: 'ACTIVACION' | 'RECUPERACION', token: string) {
      const f = TestBed.createComponent(ClaveEnlace);
      f.componentRef.setInput('tipo', tipo);
      f.componentRef.setInput('token', token);
      f.detectChanges();
      return f;
    }

    it('un enlace inventado muestra que no es válido', async () => {
      const f = abrir('ACTIVACION', 'token-inventado');
      await esperar(f, () => texto(f).includes('Enlace no válido'));
      expect(texto(f)).toContain('venció o ya se usó');
    });

    it('con la invitación la persona elige su contraseña, queda activa y entra directo a su panel', async () => {
      const data = TestBed.inject(DataService);
      const { usuario } = data.agregarCliente(cliente);
      const emision = await TestBed.inject(AuthService).invitar(usuario.id);

      const f = abrir('ACTIVACION', emision!.enlace.split('/').pop()!);
      await esperar(f, () => texto(f).includes('Activá tu cuenta') && texto(f).includes('hola@tallersur.com'));
      const el = f.nativeElement as HTMLElement;

      escribir(el, '#enlace-clave', 'Cliente123');
      escribir(el, '#enlace-confirmar', 'Cliente123');
      enviar(el);
      await esperar(f, () => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith(['/cliente/inicio']);
      expect(alerta.exito).toHaveBeenCalledWith('Cuenta activada. ¡Te damos la bienvenida a Flexya!');
      expect(data.usuarios()[0].estado).toBe('ACTIVO');
      expect(TestBed.inject(AuthService).user()?.rol).toBe('cliente');
    });

    it('el enlace de recuperación cambia la contraseña', async () => {
      await adminCreado();
      const auth = TestBed.inject(AuthService);
      await auth.solicitarRecuperacion('admin@flexya.com');
      const token = TestBed.inject(DataService).correos()[0].enlace.split('/').pop()!;

      const f = abrir('RECUPERACION', token);
      await esperar(f, () => !!(f.nativeElement as HTMLElement).querySelector('#enlace-clave'));
      const el = f.nativeElement as HTMLElement;
      escribir(el, '#enlace-clave', 'Nueva12345');
      escribir(el, '#enlace-confirmar', 'Nueva12345');
      enviar(el);
      await esperar(f, () => navegar.mock.calls.length > 0);
      expect(navegar).toHaveBeenCalledWith(['/login']);
      expect(auth.user()).toBeNull();
      expect(await auth.login('admin@flexya.com', 'Nueva12345')).toMatchObject({ ok: true });
    });
  });

  describe('recuperar contraseña', () => {
    it('responde lo mismo para cualquier correo y no envía nada si no existe', async () => {
      const f = TestBed.createComponent(Olvide);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      escribir(el, '#olvide-email', 'nadie@flexya.com');
      enviar(el);
      await esperar(f, () => texto(f).includes('Revisá tu correo'));
      expect(texto(f)).toContain('Si el correo está registrado');
      expect(TestBed.inject(DataService).correos()).toHaveLength(0);
    });

    it('envía el enlace cuando la cuenta existe y está activa', async () => {
      await adminCreado();
      const f = TestBed.createComponent(Olvide);
      f.detectChanges();
      escribir(f.nativeElement as HTMLElement, '#olvide-email', 'admin@flexya.com');
      enviar(f.nativeElement as HTMLElement);
      await esperar(f, () => texto(f).includes('Revisá tu correo'));
      expect(TestBed.inject(DataService).correos()[0]).toMatchObject({ tipo: 'RECUPERACION', para: 'admin@flexya.com' });
    });
  });

  describe('mi cuenta', () => {
    it('cambia la contraseña pidiendo la actual', async () => {
      await adminCreado();
      const auth = TestBed.inject(AuthService);
      await auth.login('admin@flexya.com', 'Admin1234');
      const f = TestBed.createComponent(Cuenta);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(texto(f)).toContain('admin@flexya.com');
      expect(texto(f)).toContain('Superadministrador');

      escribir(el, '#cuenta-actual', 'Equivocada1');
      escribir(el, '#cuenta-nueva', 'Nueva12345');
      escribir(el, '#cuenta-confirmar', 'Nueva12345');
      enviar(el);
      await esperar(f, () => texto(f).includes('La contraseña actual no es correcta.'));
      expect(alerta.exito).not.toHaveBeenCalled();

      escribir(el, '#cuenta-actual', 'Admin1234');
      enviar(el);
      await esperar(f, () => alerta.exito.mock.calls.length > 0);
      expect(alerta.exito).toHaveBeenCalledWith('Contraseña actualizada.');
      expect(auth.user()).not.toBeNull();
    });
  });

  describe('bandeja de demostración', () => {
    it('lista los correos enviados con su enlace', async () => {
      const data = TestBed.inject(DataService);
      const { usuario } = data.agregarCliente(cliente);
      const emision = await TestBed.inject(AuthService).invitar(usuario.id);
      const f = TestBed.createComponent(Correos);
      f.detectChanges();
      expect(texto(f)).toContain('Activá tu cuenta de Flexya');
      expect(texto(f)).toContain('hola@tallersur.com');
      expect((f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.btn-primary')!.href).toBe(emision!.enlace);
    });
  });
});
