import { TestBed } from '@angular/core/testing';
import Swal from 'sweetalert2';
import { AlertService, acortarEnlace } from './alert.service';

describe('AlertService', () => {
  let fire: ReturnType<typeof vi.spyOn>;
  let alert: AlertService;

  beforeEach(() => {
    fire = vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false });
    alert = TestBed.inject(AlertService);
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const opciones = () => fire.mock.calls.at(-1)?.[0] as Record<string, unknown>;

  it('las notificaciones son avisos tipo toast con el ícono correcto', async () => {
    alert.exito('Guardado');
    await flush();
    expect(opciones()).toMatchObject({ toast: true, icon: 'success', title: 'Guardado', showConfirmButton: false });
    alert.error('Falló');
    await flush();
    expect(opciones()).toMatchObject({ toast: true, icon: 'error', title: 'Falló' });
    alert.advertencia('Ojo');
    await flush();
    expect(opciones()).toMatchObject({ icon: 'warning' });
    alert.info('Dato');
    await flush();
    expect(opciones()).toMatchObject({ icon: 'info' });
  });

  it('confirmar devuelve true o false según el botón', async () => {
    expect(await alert.confirmar({ titulo: '¿Seguro?' })).toBe(true);
    fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true });
    expect(await alert.confirmar({ titulo: '¿Seguro?' })).toBe(false);
  });

  it('la confirmación de peligro usa botón rojo y enfoca cancelar', async () => {
    await alert.confirmar({ titulo: '¿Eliminar?', tipo: 'peligro', confirmar: 'Sí, eliminar' });
    expect(opciones()).toMatchObject({
      showCancelButton: true, focusCancel: true, confirmButtonText: 'Sí, eliminar', customClass: { confirmButton: 'btn btn-danger' },
    });
  });

  it('exitoConAccion avisa que salió bien y devuelve true solo si la persona elige la acción', async () => {
    expect(await alert.exitoConAccion({ titulo: 'Envío creado', mensaje: 'Pegá la etiqueta', accion: 'Imprimir etiqueta' })).toBe(true);
    expect(opciones()).toMatchObject({
      icon: 'success', title: 'Envío creado', text: 'Pegá la etiqueta', showCancelButton: true, confirmButtonText: 'Imprimir etiqueta', cancelButtonText: 'Listo',
    });
    fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true });
    expect(await alert.exitoConAccion({ titulo: 'Envío creado', accion: 'Imprimir etiqueta', cancelar: 'Ahora no' })).toBe(false);
    expect(opciones()).toMatchObject({ cancelButtonText: 'Ahora no' });
  });

  it('pedirTexto devuelve el texto o null si se cancela', async () => {
    fire.mockResolvedValueOnce({ isConfirmed: true, isDenied: false, isDismissed: false, value: '  Nadie atendió ' });
    expect(await alert.pedirTexto({ titulo: 'Incidencia' })).toBe('Nadie atendió');
    fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true });
    expect(await alert.pedirTexto({ titulo: 'Incidencia' })).toBeNull();
  });

  it('la invitación escapa el HTML de los datos', async () => {
    await alert.invitacion({ titulo: 'Invitación enviada', nombre: '<b>Taller</b>', email: 'a<x>@b.com', enlace: 'http://localhost/activar/abc123', vigencia: '72 horas', accion: 'activar su cuenta' });
    const html = String(opciones()['html']);
    expect(html).not.toContain('<b>Taller</b>');
    expect(html).toContain('&lt;b&gt;Taller&lt;/b&gt;');
    expect(html).toContain('data-enlace="http://localhost/activar/abc123"');
    expect(html).toContain('localhost/activar/…abc123');
    expect(html).toContain('a&lt;x&gt;@b.com');
  });

  it('acorta el enlace para mostrarlo pero conserva solo lo necesario', () => {
    expect(acortarEnlace('http://localhost:4200/activar/abcdef0123456789')).toBe('localhost:4200/activar/…456789');
    expect(acortarEnlace('https://flexya.com/restablecer/Zq81xk')).toBe('flexya.com/restablecer/…Zq81xk');
    expect(acortarEnlace('no es una url')).toBe('no es una url');
  });
});
