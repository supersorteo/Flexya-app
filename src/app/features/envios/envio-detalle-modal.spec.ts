import { TestBed } from '@angular/core/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { EnvioDetalleModal } from './envio-detalle-modal';

const base: Envio = {
  id: 'LF-10001', clienteId: 'c1', destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano',
  zonaId: 'caba-norte', estado: 'Pendiente', eta: 'A coordinar', importe: 2200, mensajeroId: null, creadoEn: '2026-11-14T12:00:00.000Z',
  retiro: 'deposito', origen: '', historial: [], fechaRetiro: null, retiroId: 'R-10001', retiroProgramado: false, franja: null, intentos: 0, items: [{ productoId: 'p1', nombre: 'Taza', cantidad: 3, precio: null, peso: 0.3, alto: null, ancho: null, largo: null }],
};

describe('Detalle de un envío', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [{ provide: NgbActiveModal, useValue: { close: vi.fn(), dismiss: vi.fn() } }] });
  });

  function abrir(cambios: Partial<Envio> = {}) {
    const f = TestBed.createComponent(EnvioDetalleModal);
    f.componentInstance.envio = { ...base, ...cambios };
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const pasos = () => [...el.querySelectorAll('.fx-seguimiento li')].map((li) => li.className.trim());
    return { f, el, pasos, texto: () => el.textContent ?? '' };
  }

  it('un envío recién creado marca el primer paso como actual', () => {
    const { pasos, texto } = abrir();
    expect(pasos()).toEqual(['actual', '', '', '']);
    expect(texto()).toContain('Envío LF-10001');
    expect(texto()).toContain('Ana Gómez');
    expect(texto()).toContain('Sin asignar');
  });

  it('el seguimiento avanza con el estado: los pasos anteriores quedan hechos', () => {
    expect(abrir({ estado: 'En depósito' }).pasos()).toEqual(['hecho', 'actual', '', '']);
    expect(abrir({ estado: 'En reparto' }).pasos()).toEqual(['hecho', 'hecho', 'actual', '']);
    expect(abrir({ estado: 'Entregado' }).pasos()).toEqual(['hecho', 'hecho', 'hecho', 'actual']);
  });

  it('un envío entregado muestra quién recibió', () => {
    const { texto } = abrir({ estado: 'Entregado', recibidoPor: 'Portería', entregadoEn: '2026-11-14T15:30:00.000Z' });
    expect(texto()).toContain('Recibió: Portería');
  });

  it('una incidencia muestra el motivo y deja el paso en reparto', () => {
    const { pasos, texto } = abrir({ estado: 'Incidencia', nota: 'Nadie atendió' });
    expect(texto()).toContain('Hubo una incidencia');
    expect(texto()).toContain('Nadie atendió');
    expect(pasos()).toEqual(['hecho', 'hecho', 'actual', '']);
  });

  it('un envío cancelado no muestra el seguimiento sino el aviso', () => {
    const { el, texto } = abrir({ estado: 'Cancelado' });
    expect(el.querySelector('.fx-seguimiento')).toBeNull();
    expect(texto()).toContain('Envío cancelado');
  });

  it('muestra los productos con su cantidad y el peso total', () => {
    const { texto } = abrir();
    expect(texto()).toContain('3 ×');
    expect(texto()).toContain('Taza');
    expect(texto()).toMatch(/Peso total: 0[.,]9 kg/);
  });

  it('muestra cómo llega a Flexya: en el domicilio con su dirección o en el depósito', () => {
    expect(abrir({ retiro: 'domicilio', origen: 'Av. Mitre 100, Avellaneda' }).texto()).toContain('Av. Mitre 100, Avellaneda');
    expect(abrir({ retiro: 'deposito' }).texto()).toContain('Lo dejás vos en el depósito de Flexya');
  });

  it('muestra el nombre del mensajero asignado', () => {
    const data = TestBed.inject(DataService);
    const { mensajero } = data.agregarMensajero({
      nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
      telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
    });
    expect(abrir({ estado: 'En reparto', mensajeroId: mensajero.id }).texto()).toContain('Santiago Pereyra');
  });

  it('tolera envíos viejos sin productos', () => {
    const { texto } = abrir({ items: undefined as never });
    expect(texto()).toContain('Sin productos cargados');
  });

  it('cerrar cierra el modal', () => {
    const { el } = abrir();
    el.querySelector<HTMLButtonElement>('.modal-footer .btn-primary')!.click();
    expect(TestBed.inject(NgbActiveModal).close).toHaveBeenCalled();
  });
});
