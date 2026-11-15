import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';

registerLocaleData(localeEsAr);

async function esperar(condicion: () => boolean) {
  for (let i = 0; i < 150 && !condicion(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condicion()).toBe(true);
}

describe('Navegación del shell', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-bs-theme');
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  async function adminEnInicio() {
    await TestBed.inject(AuthService).configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/inicio');
    await esperar(() => !!(harness.routeNativeElement as HTMLElement).querySelector('.fx-bottomnav'));
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('el superadmin tiene 7 secciones: la barra inferior muestra 4 y el resto va en "Más"', async () => {
    const { el } = await adminEnInicio();
    const etiquetas = [...el.querySelectorAll('.fx-bottomnav a, .fx-bottomnav button')].map((n) => n.textContent!.trim());
    expect(etiquetas).toEqual(['Resumen', 'Envíos', 'Depósito', 'Clientes', 'Más']);
  });

  it('"Más" abre una hoja con las demás secciones, la cuenta, el tema y salir, y se cierra', async () => {
    const { harness, el } = await adminEnInicio();
    expect(el.querySelector('.fx-sheet')).toBeNull();
    el.querySelector<HTMLButtonElement>('.fx-bottomnav button')!.click();
    harness.detectChanges();

    const hoja = el.querySelector('.fx-sheet')!;
    expect(hoja.getAttribute('role')).toBe('dialog');
    const enlaces = [...hoja.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(enlaces).toEqual(['/admin/mensajeros', '/admin/pagos', '/admin/reportes', '/admin/cuenta']);
    expect(hoja.textContent).toContain('Tema:');
    expect(hoja.textContent).toContain('Cerrar sesión');

    el.querySelector<HTMLElement>('.fx-sheet-fondo')!.click();
    harness.detectChanges();
    expect(el.querySelector('.fx-sheet')).toBeNull();
  });

  it('con Escape también se cierra la hoja', async () => {
    const { harness, el } = await adminEnInicio();
    el.querySelector<HTMLButtonElement>('.fx-bottomnav button')!.click();
    harness.detectChanges();
    el.querySelector('.fx-sheet')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    harness.detectChanges();
    expect(el.querySelector('.fx-sheet')).toBeNull();
  });

  it('desde la hoja se llega a otra sección y "Más" queda marcado como activo', async () => {
    const { harness, el } = await adminEnInicio();
    await harness.navigateByUrl('/admin/pagos');
    harness.detectChanges();
    const boton = el.querySelector('.fx-bottomnav button')!;
    await esperar(() => {
      harness.detectChanges();
      return boton.classList.contains('active');
    });
    expect(boton.classList.contains('active')).toBe(true);
  });

  it('el botón de tema de la barra superior recorre automático, claro y oscuro', async () => {
    const { harness, el } = await adminEnInicio();
    const tema = TestBed.inject(ThemeService);
    const boton = el.querySelector<HTMLButtonElement>('.fx-tema')!;
    expect(tema.preferencia()).toBe('sistema');
    boton.click();
    harness.detectChanges();
    expect(tema.preferencia()).toBe('claro');
    expect(boton.getAttribute('aria-label')).toContain('Claro');
    boton.click();
    harness.detectChanges();
    expect(tema.preferencia()).toBe('oscuro');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  it('la marca es el logotipo en SVG, no tres rayitas sueltas', async () => {
    const { el } = await adminEnInicio();
    expect(el.querySelector('.fx-sidebar fx-logo svg')).not.toBeNull();
    expect(el.querySelector('.fx-brand-mark')).toBeNull();
  });
});

describe('Período global en el shell', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding())] });
  });

  async function admin(url: string) {
    await TestBed.inject(AuthService).configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await esperar(() => !!(harness.routeNativeElement as HTMLElement).querySelector('.fx-bottomnav'));
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('el selector de período aparece en las secciones operativas, abre en Día = hoy y no en las de datos maestros', async () => {
    const { harness, el } = await admin('/admin/envios');
    expect([...el.querySelectorAll('.fx-periodobar [role=tab]')].map((b) => b.textContent!.trim())).toEqual(['Día', 'Semana', 'Mes']);
    expect(el.querySelector('.fx-periodo-etiqueta')!.textContent).toContain('Hoy');
    expect(el.querySelector('.fx-viendo')).toBeNull();
    await harness.navigateByUrl('/admin/clientes');
    harness.detectChanges();
    expect(el.querySelector('.fx-periodobar')).toBeNull();
  });

  it('al ir a un día anterior avisa que no es hoy y el período se mantiene al cambiar de sección', async () => {
    const { harness, el } = await admin('/admin/inicio');
    el.querySelector<HTMLButtonElement>('[aria-label="Período anterior"]')!.click();
    harness.detectChanges();
    expect(el.querySelector('.fx-viendo')!.textContent).toContain('Estás viendo');
    await harness.navigateByUrl('/admin/pagos');
    harness.detectChanges();
    expect(el.querySelector('.fx-viendo')).not.toBeNull();
    expect(el.querySelector('.fx-periodo-etiqueta')!.textContent).toContain('Ayer');
    el.querySelector<HTMLButtonElement>('.fx-viendo button')!.click();
    harness.detectChanges();
    expect(el.querySelector('.fx-viendo')).toBeNull();
  });
});
