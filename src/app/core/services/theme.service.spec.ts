import { TestBed } from '@angular/core/testing';
import { CLAVE_TEMA, ThemeService } from './theme.service';

function simularSistema(oscuro: boolean) {
  const oyentes: ((e: { matches: boolean }) => void)[] = [];
  const consulta = {
    matches: oscuro,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => oyentes.push(fn),
  };
  vi.stubGlobal('matchMedia', () => consulta);
  return { cambiar: (valor: boolean) => oyentes.forEach((fn) => fn({ matches: valor })) };
}

describe('Tema claro y oscuro', () => {
  const raiz = () => document.documentElement.getAttribute('data-bs-theme');
  const barra = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-bs-theme');
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#f3f6fb';
    document.head.appendChild(meta);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  it('sin preferencia guardada sigue al sistema', () => {
    simularSistema(true);
    const tema = TestBed.inject(ThemeService);
    expect(tema.preferencia()).toBe('sistema');
    expect(tema.efectivo()).toBe('oscuro');
    expect(raiz()).toBe('dark');
    expect(barra()).toBe('#0a1424');
  });

  it('con el sistema en claro queda en claro', () => {
    simularSistema(false);
    const tema = TestBed.inject(ThemeService);
    expect(tema.efectivo()).toBe('claro');
    expect(raiz()).toBe('light');
    expect(barra()).toBe('#f3f6fb');
  });

  it('si el sistema cambia mientras sigue al sistema, la app lo acompaña', () => {
    const sistema = simularSistema(false);
    const tema = TestBed.inject(ThemeService);
    sistema.cambiar(true);
    expect(tema.efectivo()).toBe('oscuro');
    expect(raiz()).toBe('dark');
  });

  it('una elección explícita manda sobre el sistema y se recuerda', () => {
    const sistema = simularSistema(true);
    const tema = TestBed.inject(ThemeService);
    tema.establecer('claro');
    expect(raiz()).toBe('light');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('claro');
    sistema.cambiar(true);
    expect(tema.efectivo()).toBe('claro');
  });

  it('recupera la preferencia guardada al arrancar', () => {
    simularSistema(false);
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    const tema = TestBed.inject(ThemeService);
    expect(tema.preferencia()).toBe('oscuro');
    expect(raiz()).toBe('dark');
  });

  it('ignora un valor guardado que no corresponde', () => {
    simularSistema(false);
    localStorage.setItem(CLAVE_TEMA, 'violeta');
    expect(TestBed.inject(ThemeService).preferencia()).toBe('sistema');
  });

  it('alternar recorre automático, claro y oscuro', () => {
    simularSistema(false);
    const tema = TestBed.inject(ThemeService);
    const vistos = [tema.preferencia()];
    for (let i = 0; i < 3; i++) {
      tema.alternar();
      vistos.push(tema.preferencia());
    }
    expect(vistos).toEqual(['sistema', 'claro', 'oscuro', 'sistema']);
  });

  it('funciona aunque el navegador no permita guardar la preferencia', () => {
    simularSistema(false);
    const tema = TestBed.inject(ThemeService);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin espacio');
    });
    expect(() => tema.establecer('oscuro')).not.toThrow();
    expect(raiz()).toBe('dark');
    vi.restoreAllMocks();
  });

  it('en un entorno sin matchMedia queda en claro', () => {
    vi.stubGlobal('matchMedia', undefined);
    const tema = TestBed.inject(ThemeService);
    expect(tema.efectivo()).toBe('claro');
  });
});
