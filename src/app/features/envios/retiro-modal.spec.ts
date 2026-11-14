import { TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { Router, provideRouter } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { sumarDiasISO } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { RetiroModal } from './retiro-modal';

type Mock = ReturnType<typeof vi.fn>;
interface Interno {
  form: FormGroup;
  destinos: FormArray<FormGroup>;
  paso: { set: (n: number) => void; (): number };
  abierto: { (): number };
  agregarDestino: () => void;
  quitarDestino: (i: number) => Promise<void>;
  agregarFila: (d: FormGroup) => void;
  restante: (productoId: string, fila?: FormGroup) => number;
  guardar: () => Promise<void>;
  guardarBorrador: () => Promise<void>;
  enviar: () => void;
  totalUnidades: () => number;
  totalTarifa: () => number;
  cambiarCantidad: (fila: FormGroup, delta: number) => void;
}

const sinDatos = { descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };

describe('RetiroModal: un retiro con varios destinatarios', () => {
  let data: DataService;
  let taza: string;
  let remera: string;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NgbActiveModal, useValue: { close: vi.fn(), dismiss: vi.fn() } },
        { provide: AlertService, useValue: { confirmar: vi.fn().mockResolvedValue(true), advertencia: vi.fn(), exito: vi.fn() } },
      ],
    });
    data = TestBed.inject(DataService);
    taza = data.agregarProducto('c1', { ...sinDatos, nombre: 'Taza', stock: 10 }).id;
    remera = data.agregarProducto('c1', { ...sinDatos, nombre: 'Remera', stock: 4 }).id;
    data.agregarProducto('c2', { ...sinDatos, nombre: 'Ajeno', stock: 99 });
  });

  function abrir(clienteId = 'c1') {
    const fixture = TestBed.createComponent(RetiroModal);
    fixture.componentInstance.clienteId = clienteId;
    fixture.detectChanges();
    return { fixture, modal: fixture.componentInstance as unknown as Interno, el: fixture.nativeElement as HTMLElement };
  }

  const datos = (nombre: string, extra: Record<string, unknown> = {}) => ({
    destinatario: nombre, telefono: '1155550000', localidad: 'Belgrano', direccion: 'Av. Cabildo 1840, 3° B', ...extra,
  });
  const fila = (modal: Interno, d: number, f = 0) => (modal.destinos.at(d).get('items') as FormArray).at(f) as FormGroup;
  const poner = (modal: Interno, d: number, producto: string, cantidad: string, f = 0) => fila(modal, d, f).patchValue({ productoId: producto, cantidad });

  function completo(modal: Interno) {
    modal.form.patchValue({ retiro: 'domicilio' });
    modal.destinos.at(0).patchValue(datos('Ana Gómez'));
    poner(modal, 0, taza, '3');
    modal.agregarDestino();
    modal.destinos.at(1).patchValue(datos('Beto Díaz', { localidad: 'Palermo' }));
    poner(modal, 1, taza, '5');
    modal.agregarFila(modal.destinos.at(1));
    poner(modal, 1, remera, '2', 1);
  }

  it('arranca con un destinatario abierto, el retiro sin elegir y "lo antes posible"', () => {
    const { modal, el } = abrir();
    expect(modal.destinos.length).toBe(1);
    expect(modal.abierto()).toBe(0);
    expect(modal.form.getRawValue()).toMatchObject({ retiro: '', programar: false, fechaRetiro: '' });
    expect(modal.form.valid).toBe(false);
    expect(el.textContent).toContain('Nuevo retiro');
    expect(el.textContent).toContain('Lo antes posible');
  });

  it('cada destinatario tiene sus propios productos, y se pueden agregar y quitar', async () => {
    const { fixture, modal } = abrir();
    modal.form.patchValue({ retiro: 'domicilio' });
    modal.paso.set(1);
    modal.agregarDestino();
    modal.agregarDestino();
    fixture.detectChanges();
    expect(modal.destinos.length).toBe(3);
    expect(modal.abierto()).toBe(2);

    await modal.quitarDestino(2);
    expect(modal.destinos.length).toBe(2);
    modal.destinos.at(0).patchValue(datos('Ana'));
    await modal.quitarDestino(0);
    expect((TestBed.inject(AlertService) as unknown as { confirmar: Mock }).confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Quitar a Ana?' }));
    expect(modal.destinos.length).toBe(1);
  });

  it('el mismo producto puede ir a varios destinatarios mientras el total no pase el stock', () => {
    const { modal } = abrir();
    completo(modal);
    expect(modal.restante(taza)).toBe(2);
    expect(modal.restante(taza, fila(modal, 0))).toBe(5);
    expect(modal.form.valid).toBe(true);

    poner(modal, 1, taza, '8');
    expect(modal.destinos.errors).toEqual({ stock: true });
    expect(modal.form.valid).toBe(false);
    poner(modal, 1, taza, '7');
    expect(modal.form.valid).toBe(true);
  });

  it('el botón de sumar frena en lo que queda disponible entre todos los destinatarios', () => {
    const { modal } = abrir();
    completo(modal);
    modal.cambiarCantidad(fila(modal, 1), 1);
    modal.cambiarCantidad(fila(modal, 1), 1);
    modal.cambiarCantidad(fila(modal, 1), 1);
    expect(fila(modal, 1).value.cantidad).toBe('7');
  });

  it('no repite un producto dentro del mismo destinatario, pero sí en destinatarios distintos', () => {
    const { modal } = abrir();
    completo(modal);
    poner(modal, 1, taza, '1', 1);
    expect((modal.destinos.at(1).get('items') as FormArray).errors).toEqual({ repetido: true });
    poner(modal, 1, remera, '1', 1);
    expect((modal.destinos.at(1).get('items') as FormArray).errors).toBeNull();
  });

  it('suma unidades y tarifa de todos los destinatarios en el resumen', () => {
    const { modal } = abrir();
    completo(modal);
    expect(modal.totalUnidades()).toBe(10);
    expect(modal.totalTarifa()).toBeGreaterThan(0);
  });

  it('guarda un solo pedido con todos los destinatarios y sus productos, previa confirmación', async () => {
    const { modal } = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    completo(modal);
    modal.destinos.at(0).patchValue({ destinatario: '  Ana   Gómez ' });

    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.guardar();
    expect(cerrar).not.toHaveBeenCalled();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Solicitar el retiro?', mensaje: expect.stringContaining('2 destinatarios, 10 unidades') }));

    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith({
      retiro: 'domicilio',
      programado: false,
      fechaRetiro: null,
      franja: null,
      destinos: [
        { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840, 3° B', localidad: 'Belgrano', items: [{ productoId: taza, cantidad: 3 }] },
        {
          destinatario: 'Beto Díaz', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840, 3° B', localidad: 'Palermo',
          items: [{ productoId: taza, cantidad: 5 }, { productoId: remera, cantidad: 2 }],
        },
      ],
    });
  });

  it('un solo destinatario se pide como "envío"; como borrador se avisa que no reserva stock', async () => {
    const { modal } = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    modal.form.patchValue({ retiro: 'deposito' });
    modal.destinos.at(0).patchValue(datos('Ana'));
    poner(modal, 0, taza, '1');
    await modal.guardar();
    expect(alerta.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ titulo: '¿Solicitar el envío?' }));

    await modal.guardarBorrador();
    expect(alerta.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ titulo: '¿Guardar como borrador?', mensaje: expect.stringContaining('no se reserva stock') }));
    expect(cerrar).toHaveBeenLastCalledWith(expect.objectContaining({ borrador: true }));
  });

  it('programar guarda la fecha y, en domicilio, la franja', async () => {
    const { modal } = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    modal.form.patchValue({ retiro: 'domicilio' });
    modal.destinos.at(0).patchValue(datos('Ana'));
    poner(modal, 0, taza, '1');
    let dia = sumarDiasISO(7);
    const d = new Date(dia + 'T00:00:00');
    while (!data.esDiaHabil(dia)) {
      d.setDate(d.getDate() + 1);
      dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    modal.form.patchValue({ programar: true, fechaRetiro: dia, franja: 'tarde' });
    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith(expect.objectContaining({ programado: true, fechaRetiro: dia, franja: 'tarde' }));
  });

  it('si algún destinatario tiene errores, no avanza y abre justo ese destinatario', () => {
    const { modal } = abrir();
    modal.form.patchValue({ retiro: 'domicilio' });
    modal.destinos.at(0).patchValue(datos('Ana'));
    poner(modal, 0, taza, '1');
    modal.agregarDestino();
    modal.paso.set(1);
    modal.abierto();
    modal.enviar();
    expect(modal.paso()).toBe(1);
    expect(modal.abierto()).toBe(1);
    expect((TestBed.inject(AlertService) as unknown as { advertencia: Mock }).advertencia).toHaveBeenCalled();
  });

  it('sin productos cargados invita a crearlos y lleva a la sección de productos', () => {
    const { fixture, modal, el } = abrir('c3');
    modal.paso.set(1);
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no cargaste productos');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.fx-empty-box .btn-primary')!.click();
    expect(TestBed.inject(NgbActiveModal).dismiss).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/cliente/productos']);
  });
});
