import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { MensajeroInput } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';

registerLocaleData(localeEsAr);

async function esperar(condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condicion()).toBe(true);
}

const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

describe('Pantalla de escaneo', () => {
  let auth: AuthService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
  });

  afterEach(() => vi.unstubAllGlobals());

  function sinCamara(nombre = 'NotAllowedError') {
    const error = new Error('x');
    error.name = nombre;
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(error) } });
  }

  async function abrir(ruta = '/admin/escanear', listo = '.fx-escaner') {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl(ruta);
    const pantalla = h.fixture.nativeElement as HTMLElement;
    await esperar(() => !!pantalla.querySelector(listo));
    return { h, pantalla };
  }

  function escribir(pantalla: HTMLElement, texto: string) {
    const campo = pantalla.querySelector<HTMLInputElement>('#codigo-manual')!;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    pantalla.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('si no se dio permiso a la cámara lo explica y deja escribir el código', async () => {
    sinCamara('NotAllowedError');
    const { h, pantalla } = await abrir();
    await esperar(() => !!pantalla.querySelector('.fx-escaner-aviso--error'));
    h.fixture.detectChanges();
    expect(pantalla.querySelector('.fx-escaner-aviso--error')!.textContent).toContain('No tenemos permiso para usar la cámara');
    expect(pantalla.textContent).toContain('Probar de nuevo');
    expect(pantalla.querySelector('#codigo-manual')).not.toBeNull();
  });

  it('si el dispositivo no tiene cámara no ofrece reintentar', async () => {
    sinCamara('NotFoundError');
    const { h, pantalla } = await abrir();
    await esperar(() => !!pantalla.querySelector('.fx-escaner-aviso--error'));
    h.fixture.detectChanges();
    expect(pantalla.textContent).toContain('No encontramos una cámara');
    expect(pantalla.textContent).not.toContain('Probar de nuevo');
  });

  it('escribir el número del envío abre su ficha', async () => {
    sinCamara();
    const { pantalla } = await abrir();
    escribir(pantalla, 'lf-10001');
    await esperar(() => router.url === '/e/LF-10001');
  });

  it('escribir el código a mano, con guión y en minúsculas, abre la ficha con el código normalizado', async () => {
    sinCamara();
    const { pantalla } = await abrir();
    escribir(pantalla, 'k7q2-m9xa');
    await esperar(() => router.url === '/e/K7Q2M9XA');
  });

  it('un texto que no es de un envío muestra el error y no navega', async () => {
    sinCamara();
    const { h, pantalla } = await abrir();
    escribir(pantalla, 'hola');
    h.fixture.detectChanges();
    expect(pantalla.querySelector('.invalid-feedback')!.textContent).toContain('no es de un envío');
    expect(router.url).toBe('/admin/escanear');
  });

  it('enviar el campo vacío pide escribir el código', async () => {
    sinCamara();
    const { h, pantalla } = await abrir();
    escribir(pantalla, '   ');
    h.fixture.detectChanges();
    expect(pantalla.querySelector('.invalid-feedback')!.textContent).toContain('Escribí el código');
  });

  describe('cómo se llega desde cada rol', () => {
    it('el superadmin tiene un botón para escanear en la barra superior', async () => {
      sinCamara();
      const { pantalla } = await abrir('/admin/inicio', '.fx-escanear');
      await esperar(() => !!pantalla.querySelector('.fx-escanear'));
      expect(pantalla.querySelector('.fx-escanear')!.getAttribute('href')).toBe('/admin/escanear');
    });

    it('el mensajero tiene "Escanear" en la barra de abajo', async () => {
      sinCamara();
      const data = TestBed.inject(DataService);
      const alta = data.agregarMensajero(mensajero);
      const em = await auth.invitar(alta.usuario.id);
      await auth.activar(em!.enlace.split('/').pop()!, 'Mensajero123');
      const { pantalla } = await abrir('/mensajero/inicio', '.fx-bottomnav');
      await esperar(() => !!pantalla.querySelector('.fx-bottomnav'));
      const etiquetas = [...pantalla.querySelectorAll('.fx-bottomnav a')].map((a) => a.textContent!.trim());
      expect(etiquetas).toEqual(['Mi jornada', 'Mis envíos', 'Escanear', 'Ganancias', 'Historial']);
      expect(pantalla.querySelector('.fx-escanear')).toBeNull();
    });
  });
});
