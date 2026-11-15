import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Envio } from '../../core/models';
import { Jornada } from './jornada';

const base = { id: 'LF-1', destinatario: 'Ana Gómez', direccion: 'Cabildo 1840', localidad: 'Belgrano', mensajeroId: 'm1', retiro: 'directo' } as unknown as Envio;
const envio = (parcial: Partial<Envio>) => ({ ...base, ...parcial }) as Envio;

function montar(envios: Envio[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Jornada);
  fixture.componentRef.setInput('envios', envios);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Mi jornada', () => {
  it('cuenta las entregas de hoy sobre el total del día y muestra la próxima parada', () => {
    const el = montar([
      envio({ id: 'LF-1', estado: 'Entregado', entregadoEn: new Date().toISOString() }),
      envio({ id: 'LF-2', estado: 'Retirado' as Envio['estado'], destinatario: 'Luis Paz' }),
      envio({ id: 'LF-3', estado: 'En reparto', destinatario: 'Ana Gómez' }),
    ]);
    expect(el.querySelector('.fx-jornada-cifra')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('1 de 3');
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('1');
    expect(el.querySelector('.fx-proxima-nombre')!.textContent).toContain('Ana Gómez');
  });

  it('sin paradas avisa que está todo al día', () => {
    const el = montar([]);
    expect(el.querySelector('.fx-proxima')).toBeNull();
    expect(el.textContent).toContain('Todo al día');
  });
});
