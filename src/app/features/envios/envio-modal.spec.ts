import { fechaDesdeISO, hoyISO, sumarDiasISO } from '../../core/models';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { Router, provideRouter } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { EnvioModal } from './envio-modal';

type Mock = ReturnType<typeof vi.fn>;

function fechaSiguiente(iso: string): string {
  const d = fechaDesdeISO(iso);
  d.setDate(d.getDate() + 1);
  return hoyISO(d);
}
interface Interno {
  form: FormGroup;
  guardar: () => Promise<void>;
  cancelar: () => Promise<void>;
  agregarFila: () => void;
  quitarFila: (i: number) => Promise<void>;
  cambiarCantidad: (i: number, delta: number) => void;
  quedanProductos: () => boolean;
  disponibles: (i: number) => { id: string }[];
  totales: () => { unidades: number; peso: number | null; completo: boolean } | null;
  irAProductos: () => void;
  paso: { set: (n: number) => void };
  guardarBorrador: () => Promise<void>;
}

const sinDatos = { stock: 100, descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };

describe('EnvioModal', () => {
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
    taza = data.agregarProducto('c1', { ...sinDatos, nombre: 'Taza', peso: 0.3, alto: 10, ancho: 8, largo: 8 }).id;
    remera = data.agregarProducto('c1', { ...sinDatos, nombre: 'Remera' }).id;
    data.agregarProducto('c2', { ...sinDatos, nombre: 'Producto ajeno' });
  });

  function abrir(clienteId = 'c1') {
    const fixture = TestBed.createComponent(EnvioModal);
    fixture.componentInstance.clienteId = clienteId;
    fixture.detectChanges();
    return { fixture, modal: fixture.componentInstance as unknown as Interno, el: fixture.nativeElement as HTMLElement };
  }

  const filas = (m: Interno) => m.form.controls['items'] as FormArray;

  function completar(m: Interno, extra: Record<string, unknown> = {}) {
    filas(m).at(0).patchValue({ productoId: taza, cantidad: '3' });
    m.form.patchValue({ destinatario: 'Ana Gómez', telefono: '1155550000', localidad: 'Belgrano', direccion: 'Av. Cabildo 1840, 3° B', retiro: 'domicilio', ...extra });
  }

  it('sin productos cargados invita a crearlos y lleva a la sección de productos', () => {
    const { modal, el } = abrir('c3');
    expect(el.textContent).toContain('Todavía no cargaste productos');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.fx-empty-box .btn-primary')!.click();
    expect(TestBed.inject(NgbActiveModal).dismiss).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/cliente/productos']);
    expect(modal.form.valid).toBe(false);
  });

  it('empieza con una fila de cantidad 1 y solo ofrece los productos del cliente', () => {
    const { modal, el } = abrir();
    expect(filas(modal).length).toBe(1);
    expect(filas(modal).at(0).value).toEqual({ productoId: '', cantidad: '1' });
    const opciones = [...el.querySelectorAll('#e-prod-0 option')].map((o) => o.textContent!.trim());
    expect(opciones).toEqual(['Elegí un producto…', 'Taza · 100 en stock', 'Remera · 100 en stock']);
  });

  it('permite varios productos y no deja repetir ninguno', async () => {
    const { modal } = abrir();
    modal.agregarFila();
    filas(modal).at(0).patchValue({ productoId: taza });
    expect(modal.disponibles(1).map((p) => p.id)).toEqual([remera]);
    expect(modal.disponibles(0).map((p) => p.id)).toEqual([taza, remera]);

    filas(modal).at(1).patchValue({ productoId: taza });
    expect(modal.form.controls['items'].errors).toEqual({ repetido: true });
    filas(modal).at(1).patchValue({ productoId: remera });
    expect(modal.form.controls['items'].errors).toBeNull();
    expect(modal.quedanProductos()).toBe(false);

    await modal.quitarFila(1);
    expect(filas(modal).length).toBe(1);
    await modal.quitarFila(0);
    expect(filas(modal).length).toBe(1);
    expect(filas(modal).at(0).value).toEqual({ productoId: '', cantidad: '1' });
  });

  it('la cantidad es un entero entre 1 y 10.000, también para cargar por lotes', () => {
    const { modal } = abrir();
    const cantidad = filas(modal).at(0).get('cantidad')!;
    for (const ok of ['1', '250', '10000']) { cantidad.setValue(ok); expect(cantidad.errors).toBeNull(); }
    for (const mal of ['0', '10001']) { cantidad.setValue(mal); expect(cantidad.errors).toEqual({ rango: true }); }
    cantidad.setValue('');
    expect(cantidad.errors).toEqual({ required: true });
  });

  it('los botones suman y restan sin salirse de los límites', () => {
    const { modal } = abrir();
    const cantidad = filas(modal).at(0).get('cantidad')!;
    modal.cambiarCantidad(0, 1);
    expect(cantidad.value).toBe('2');
    modal.cambiarCantidad(0, -5);
    expect(cantidad.value).toBe('1');
    cantidad.setValue('10000');
    modal.cambiarCantidad(0, 1);
    expect(cantidad.value).toBe('10000');
  });

  it('calcula las unidades y el peso total, avisando si falta el peso de algún producto', () => {
    const { modal } = abrir();
    expect(modal.totales()).toBeNull();
    filas(modal).at(0).patchValue({ productoId: taza, cantidad: '4' });
    expect(modal.totales()).toEqual({ unidades: 4, peso: 1.2, completo: true });
    modal.agregarFila();
    filas(modal).at(1).patchValue({ productoId: remera, cantidad: '2' });
    expect(modal.totales()).toEqual({ unidades: 6, peso: 1.2, completo: false });
  });

  it('valida los datos del destinatario', () => {
    const { modal } = abrir();
    const f = modal.form.controls;
    expect(['destinatario', 'telefono', 'localidad', 'direccion', 'retiro'].every((c) => f[c].hasError('required'))).toBe(true);

    f['telefono'].setValue('011155550000');
    expect(f['telefono'].errors).toEqual({ telefono: true });
    f['telefono'].setValue('1155550000');
    expect(f['telefono'].errors).toBeNull();

    f['direccion'].setValue('Palermo');
    expect(f['direccion'].errors).toEqual({ direccion: true });
    f['direccion'].setValue('Honduras 4800, 2° A');
    expect(f['direccion'].errors).toBeNull();

    f['destinatario'].setValue('Lu');
    expect(f['destinatario'].errors).toEqual({ minlength: expect.anything() });
    f['destinatario'].setValue('Casa <b>');
    expect(f['destinatario'].errors).toEqual({ nombre: true });
  });

  it('guarda los productos con su cantidad y los datos del destinatario, previa confirmación', async () => {
    const { modal } = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    modal.agregarFila();
    completar(modal, { destinatario: '  Ana   Gómez ' });
    filas(modal).at(1).patchValue({ productoId: remera, cantidad: '12' });
    expect(modal.form.valid).toBe(true);

    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.guardar();
    expect(cerrar).not.toHaveBeenCalled();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Solicitar el envío?', mensaje: expect.stringContaining('15 unidades') }));

    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith({
      destinatario: 'Ana Gómez',
      telefono: '+54 9 11 5555 0000',
      direccion: 'Av. Cabildo 1840, 3° B',
      localidad: 'Belgrano',
      retiro: 'domicilio',
      programado: false,
      fechaRetiro: null,
      franja: null,
      items: [
        { productoId: taza, cantidad: 3 },
        { productoId: remera, cantidad: 12 },
      ],
    });
  });

  it('el retiro es obligatorio y puede ser en el domicilio o en el depósito', () => {
    const { modal } = abrir();
    completar(modal, { retiro: '' });
    expect(modal.form.valid).toBe(false);
    modal.form.patchValue({ retiro: 'deposito' });
    expect(modal.form.valid).toBe(true);
    modal.form.patchValue({ retiro: 'domicilio' });
    expect(modal.form.valid).toBe(true);
  });

  it('avisa si faltan datos y cancelar pide confirmar solo si hay cambios', async () => {
    const { modal } = abrir();
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock; advertencia: Mock };
    const descartar = TestBed.inject(NgbActiveModal).dismiss as Mock;
    await modal.guardar();
    expect(alerta.advertencia).toHaveBeenCalled();
    expect(TestBed.inject(NgbActiveModal).close).not.toHaveBeenCalled();

    await modal.cancelar();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(descartar).toHaveBeenCalledTimes(1);
    modal.form.controls['destinatario'].markAsDirty();
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.cancelar();
    expect(descartar).toHaveBeenCalledTimes(1);
  });

  it('por defecto el retiro es "lo antes posible" y la fecha la calcula el sistema con la hora de corte', () => {
    const { modal, el } = abrir();
    expect(modal.form.getRawValue()).toMatchObject({ programar: false, fechaRetiro: '' });
    expect(modal.form.valid).toBe(false);
    completar(modal);
    expect(modal.form.valid).toBe(true);
    expect(el.querySelector('#e-fecha')).toBeNull();
  });

  it('al programar otro día, la fecha es obligatoria, hábil, no anterior a la próxima disponible y hasta 30 días', () => {
    const { fixture, modal, el } = abrir();
    completar(modal);
    modal.paso.set(2);
    const control = modal.form.controls['fechaRetiro'];
    modal.form.controls['programar'].setValue(true);
    fixture.detectChanges();
    expect(el.querySelector('#e-fecha')).not.toBeNull();
    expect(el.querySelector('#e-franja')).not.toBeNull();
    expect(control.errors).toEqual({ required: true });
    control.setValue('2020-01-01');
    expect(control.errors).toEqual({ pasada: true });
    control.setValue(sumarDiasISO(31));
    expect(control.errors).toEqual({ lejana: true });

    const proxima = data.proximaFechaRetiro();
    let habil = sumarDiasISO(10);
    while (!data.esDiaHabil(habil)) habil = fechaSiguiente(habil);
    control.setValue(habil >= proxima ? habil : proxima);
    expect(control.errors).toBeNull();

    let finDeSemana = sumarDiasISO(5);
    while (data.esDiaHabil(finDeSemana)) finDeSemana = fechaSiguiente(finDeSemana);
    control.setValue(finDeSemana);
    expect(control.errors).toEqual({ inhabil: true });

    modal.form.controls['programar'].setValue(false);
    expect(control.errors).toBeNull();
  });

  it('un feriado cargado por el superadmin no es día de retiro', () => {
    const { modal } = abrir();
    let dia = sumarDiasISO(3);
    while (!data.esDiaHabil(dia)) dia = fechaSiguiente(dia);
    data.guardarConfigOperacion({ ...data.configOperacion(), feriados: [dia] });
    modal.form.controls['programar'].setValue(true);
    modal.form.controls['fechaRetiro'].setValue(dia);
    expect(modal.form.controls['fechaRetiro'].errors).toEqual({ inhabil: true });
  });

  it('al crear ofrece guardar como borrador, que no pide el servicio', async () => {
    const { fixture, modal, el } = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    completar(modal);
    modal.paso.set(2);
    fixture.detectChanges();
    const textos = [...el.querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(textos).toEqual(expect.arrayContaining(['Guardar borrador', 'Solicitar envío']));

    await modal.guardarBorrador();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Guardar como borrador?', mensaje: expect.stringContaining('no se reserva stock') }));
    expect(cerrar).toHaveBeenCalledWith(expect.objectContaining({ borrador: true, programado: false, fechaRetiro: null }));
  });

  describe('modo edición', () => {
    function envioPendiente(items: { productoId: string; cantidad: number }[] = [{ productoId: taza, cantidad: 3 }, { productoId: remera, cantidad: 1 }]) {
      return data.crearEnvio(
        { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840, 3° B', localidad: 'Belgrano', retiro: 'domicilio', fechaRetiro: hoyISO(), items },
        'c1',
      );
    }

    let fixture: ReturnType<typeof TestBed.createComponent<EnvioModal>>;

    function editar(envio: ReturnType<typeof envioPendiente>) {
      fixture = TestBed.createComponent(EnvioModal);
      fixture.componentInstance.clienteId = 'c1';
      fixture.componentInstance.envio = envio;
      fixture.detectChanges();
      return { modal: fixture.componentInstance as unknown as Interno, el: fixture.nativeElement as HTMLElement };
    }

    it('precarga productos, cantidades y datos del envío, con el teléfono sin el prefijo', () => {
      const { modal, el } = editar(envioPendiente());
      expect(filas(modal).length).toBe(2);
      expect(filas(modal).value).toEqual([{ productoId: taza, cantidad: '3' }, { productoId: remera, cantidad: '1' }]);
      expect(modal.form.getRawValue()).toMatchObject({
        destinatario: 'Ana Gómez', telefono: '1155550000', localidad: 'Belgrano', direccion: 'Av. Cabildo 1840, 3° B', retiro: 'domicilio',
      });
      expect(modal.form.valid).toBe(true);
      expect(el.textContent).toContain('Editar envío');
      expect(el.textContent).toContain('Siguiente');
      const form = el.querySelector('form')!;
      form.dispatchEvent(new Event('submit'));
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(el.textContent).toContain('Guardar cambios');
    });

    it('guarda los cambios previa confirmación específica de edición', async () => {
      const { modal } = editar(envioPendiente());
      const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
      const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
      modal.form.patchValue({ direccion: 'Honduras 4800' });
      filas(modal).at(0).patchValue({ cantidad: '10' });
      await modal.guardar();
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Guardar los cambios?', confirmar: 'Sí, guardar' }));
      expect(cerrar).toHaveBeenCalledWith(
        expect.objectContaining({
          direccion: 'Honduras 4800', retiro: 'domicilio',
          items: [{ productoId: taza, cantidad: 10 }, { productoId: remera, cantidad: 1 }],
        }),
      );
    });

    it('si un producto del envío ya no existe, lo omite y avisa', () => {
      const envio = envioPendiente();
      data.actualizarProducto(remera, 'c1', { ...sinDatos, nombre: 'Remera', stock: 0 });
      data.eliminarProducto(remera, 'c1');
      const { modal, el } = editar(envio);
      expect(filas(modal).length).toBe(1);
      expect(filas(modal).value).toEqual([{ productoId: taza, cantidad: '3' }]);
      expect(el.textContent).toContain('1 producto ya no existe');
    });

    it('si ya no existe ninguno deja una fila vacía para elegir otro, sin dar el envío por válido', () => {
      const envio = envioPendiente([{ productoId: remera, cantidad: 2 }]);
      data.actualizarProducto(remera, 'c1', { ...sinDatos, nombre: 'Remera', stock: 0 });
      data.eliminarProducto(remera, 'c1');
      const { modal } = editar(envio);
      expect(filas(modal).value).toEqual([{ productoId: '', cantidad: '1' }]);
      expect(modal.form.valid).toBe(false);
    });
  });

  describe('agregar y quitar productos', () => {
    const alerta = () => TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    const pausa = () => new Promise((r) => setTimeout(r, 0));
    const boton = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Agregar otro producto'))!;

    it('un solo botón agrega una fila y cuenta cuántos productos quedan disponibles', () => {
      const { fixture, el } = abrir();
      expect(el.textContent).toContain('2 disponibles');
      boton(el).click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.fx-linea')).toHaveLength(2);
      expect(boton(el).disabled).toBe(false);
    });

    it('cuando ya están todos los productos el botón se apaga y lo explica', () => {
      const { fixture, modal, el } = abrir();
      boton(el).click();
      fixture.detectChanges();
      filas(modal).at(0).patchValue({ productoId: taza });
      filas(modal).at(1).patchValue({ productoId: remera });
      fixture.detectChanges();
      expect(boton(el).disabled).toBe(true);
      expect(el.textContent).toContain('Ya agregaste todos tus productos');
    });

    it('las filas viven en una zona con su propio scroll, para que el formulario no crezca', () => {
      const { fixture, modal, el } = abrir();
      for (let i = 0; i < 4; i++) modal.agregarFila();
      fixture.detectChanges();
      const zona = el.querySelector('.fx-lineas')!;
      expect(zona.querySelectorAll('.fx-linea')).toHaveLength(5);
      expect(zona.parentElement?.querySelector('.fx-agregar-fila')).not.toBeNull();
    });

    it('quitar un producto pide confirmación y no lo quita si se cancela', async () => {
      const { modal } = abrir();
      modal.agregarFila();
      filas(modal).at(0).patchValue({ productoId: taza });
      filas(modal).at(1).patchValue({ productoId: remera });

      alerta().confirmar.mockResolvedValueOnce(false);
      await modal.quitarFila(1);
      expect(filas(modal).length).toBe(2);
      expect(alerta().confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Quitar Remera del envío?', tipo: 'peligro' }));

      await modal.quitarFila(1);
      expect(filas(modal).value).toEqual([{ productoId: taza, cantidad: '1' }]);
    });

    it('una fila sin producto elegido se quita sin preguntar', async () => {
      const { modal } = abrir();
      modal.agregarFila();
      await modal.quitarFila(1);
      expect(alerta().confirmar).not.toHaveBeenCalled();
      expect(filas(modal).length).toBe(1);
    });

    it('en la pantalla, el botón de quitar abre la confirmación y recién entonces saca la fila', async () => {
      const { fixture, modal, el } = abrir();
      boton(el).click();
      fixture.detectChanges();
      filas(modal).at(0).patchValue({ productoId: taza });
      filas(modal).at(1).patchValue({ productoId: remera });
      fixture.detectChanges();

      el.querySelectorAll<HTMLButtonElement>('.fx-linea-quitar')[1].click();
      await pausa();
      fixture.detectChanges();
      expect(alerta().confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Quitar Remera del envío?' }));
      expect(el.querySelectorAll('.fx-linea')).toHaveLength(1);
    });

    it('editando un envío se pueden sumar productos y quitar los que tenía', async () => {
      const envio = data.crearEnvio(
        { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Calle 123', localidad: 'Belgrano', retiro: 'deposito', fechaRetiro: hoyISO(), items: [{ productoId: taza, cantidad: 2 }] },
        'c1',
      );
      const fixture = TestBed.createComponent(EnvioModal);
      fixture.componentInstance.clienteId = 'c1';
      fixture.componentInstance.envio = envio;
      fixture.detectChanges();
      const modal = fixture.componentInstance as unknown as Interno;
      const el = fixture.nativeElement as HTMLElement;
      const cerrar = TestBed.inject(NgbActiveModal).close as Mock;

      boton(el).click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.fx-linea')).toHaveLength(2);

      filas(modal).at(1).patchValue({ productoId: remera, cantidad: '4' });
      await modal.quitarFila(0);
      expect(filas(modal).value).toEqual([{ productoId: remera, cantidad: '4' }]);

      await modal.guardar();
      expect(cerrar).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productoId: remera, cantidad: 4 }] }));
    });
  });
});
