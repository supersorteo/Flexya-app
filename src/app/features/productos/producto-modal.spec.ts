import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Producto, ProductoInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { ProductoModal } from './producto-modal';

const base: ProductoInput = { stock: 10, nombre: 'Remera de algodón', descripcion: 'Talle M, color negro', precio: 15990.5, peso: 0.4, alto: 3, ancho: 30, largo: 40 };

type Interno = { form: FormGroup; guardar: () => Promise<void>; cancelar: () => Promise<void>; volumen: () => number };
type Mock = ReturnType<typeof vi.fn>;

describe('ProductoModal', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: NgbActiveModal, useValue: { close: vi.fn(), dismiss: vi.fn() } },
        { provide: AlertService, useValue: { confirmar: vi.fn().mockResolvedValue(true), advertencia: vi.fn() } },
      ],
    });
  });

  function abrir(producto: Producto | null = null, clienteId = 'c1') {
    const fixture = TestBed.createComponent(ProductoModal);
    fixture.componentInstance.producto = producto;
    fixture.componentInstance.clienteId = clienteId;
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Interno;
  }

  function llenar(modal: Interno, valores: Record<string, string> = {}) {
    modal.form.setValue({ nombre: 'Taza', stock: '10', descripcion: '', precio: '1500', peso: '0,3', alto: '10', ancho: '8', largo: '8', ...valores });
  }

  it('solo el nombre es obligatorio; descripción, precio, peso y medidas son opcionales', () => {
    const { form } = abrir();
    expect(Object.keys(form.controls).filter((c) => form.controls[c].hasError('required'))).toEqual(['nombre', 'stock']);
    expect(form.valid).toBe(false);
    form.controls['nombre'].setValue('Taza');
    form.controls['stock'].setValue('0');
    expect(form.valid).toBe(true);
  });

  it('si se completa un opcional igual se valida su formato', () => {
    const { form } = abrir();
    form.controls['nombre'].setValue('Taza');
    form.controls['stock'].setValue('5');
    form.controls['peso'].setValue('abc');
    expect(form.valid).toBe(false);
    form.controls['peso'].setValue('');
    expect(form.valid).toBe(true);
  });

  it('valida los números: formato, mínimos y máximos', () => {
    const { form } = abrir();
    const probar = (campo: string, valor: string) => {
      form.controls[campo].setValue(valor);
      return form.controls[campo].errors;
    };
    expect(probar('peso', '0,75')).toBeNull();
    expect(probar('peso', '100')).toBeNull();
    expect(probar('peso', '100,5')).toEqual({ rango: true });
    expect(probar('peso', '0')).toEqual({ rango: true });
    expect(probar('peso', '1.2.3')).toEqual({ decimal: true });
    expect(probar('alto', '0,1')).toBeNull();
    expect(probar('alto', '300')).toBeNull();
    expect(probar('alto', '301')).toEqual({ rango: true });
    expect(probar('alto', 'abc')).toEqual({ decimal: true });
    expect(probar('precio', '15990,50')).toBeNull();
    expect(probar('precio', '0')).toEqual({ rango: true });
    expect(probar('precio', '100000001')).toEqual({ rango: true });
  });

  it('el stock es obligatorio y debe ser un entero entre 0 y 99.999', () => {
    const { form } = abrir();
    const probar = (valor: string) => {
      form.controls['stock'].setValue(valor);
      return form.controls['stock'].errors;
    };
    expect(probar('')).toEqual({ required: true });
    expect(probar('0')).toBeNull();
    expect(probar('99999')).toBeNull();
    expect(probar('100000')).toEqual({ rango: true });
    expect(probar('1,5')).toEqual({ entero: true });
  });

  it('el nombre acepta signos de uso común y rechaza los raros', () => {
    const { form } = abrir();
    const nombre = form.controls['nombre'];
    for (const ok of ['Remera 100% algodón (talle M)', 'Cable USB-C 1,5 m', "Kit O'Higgins #2", 'Lámpara 12V/5A']) {
      nombre.setValue(ok);
      expect(nombre.errors).toBeNull();
    }
    nombre.setValue('Pr');
    expect(nombre.errors).toEqual({ minlength: expect.anything() });
    nombre.setValue('Taza <script>');
    expect(nombre.errors).toEqual({ nombre: true });
  });

  it('no repite nombres del mismo cliente, pero otro cliente sí puede usarlo y al editar no choca con el propio', () => {
    const data = TestBed.inject(DataService);
    const propio = data.agregarProducto('c1', base);
    data.agregarProducto('c2', { ...base, nombre: 'Taza' });

    const nuevo = abrir(null, 'c1');
    nuevo.form.controls['nombre'].setValue(' remera DE algodón ');
    expect(nuevo.form.controls['nombre'].errors).toEqual({ duplicado: true });
    nuevo.form.controls['nombre'].setValue('Taza');
    expect(nuevo.form.controls['nombre'].errors).toBeNull();

    const edicion = abrir(propio, 'c1');
    expect(edicion.form.controls['nombre'].errors).toBeNull();
  });

  it('editar precarga los datos con coma decimal', () => {
    const producto = TestBed.inject(DataService).agregarProducto('c1', base);
    const modal = abrir(producto);
    expect(modal.form.getRawValue()).toEqual({
      nombre: 'Remera de algodón', stock: '10', descripcion: 'Talle M, color negro', precio: '15990,5', peso: '0,4', alto: '3', ancho: '30', largo: '40',
    });
    expect(modal.form.valid).toBe(true);
  });

  it('calcula el volumen del paquete mientras se escriben las medidas', () => {
    const modal = abrir();
    expect(modal.volumen()).toBeNull();
    llenar(modal, { alto: '10', ancho: '20,5', largo: '30' });
    expect(modal.volumen()).toBe(6150);
    llenar(modal, { alto: '', ancho: '20', largo: '30' });
    expect(modal.volumen()).toBeNull();
  });

  it('guarda números (coma → punto) con el redondeo correcto, previa confirmación', async () => {
    const modal = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    llenar(modal, { nombre: '  Zapatillas   running ', descripcion: ' Talle 42 ', precio: '84999,999', peso: '1,2345', alto: '12,34', ancho: '20', largo: '33,3' });

    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.guardar();
    expect(cerrar).not.toHaveBeenCalled();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Crear el producto?' }));

    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith({
      nombre: 'Zapatillas running', stock: 10, descripcion: 'Talle 42', precio: 85000, peso: 1.235, alto: 12.3, ancho: 20, largo: 33.3,
    });
  });

  it('sin opcionales guarda solo el nombre y deja el resto vacío', async () => {
    const modal = abrir();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    llenar(modal, { nombre: 'Taza', descripcion: '', precio: '', peso: '', alto: '', ancho: '', largo: '' });
    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith({ nombre: 'Taza', stock: 10, descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
  });

  it('editar un producto sin opcionales deja los campos vacíos', () => {
    const producto = TestBed.inject(DataService).agregarProducto('c1', { stock: 0, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    const modal = abrir(producto);
    expect(modal.form.getRawValue()).toEqual({ nombre: 'Taza', stock: '0', descripcion: '', precio: '', peso: '', alto: '', ancho: '', largo: '' });
    expect(modal.form.valid).toBe(true);
  });

  it('avisa si faltan datos y cancelar pide confirmar solo si hay cambios', async () => {
    const modal = abrir();
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock; advertencia: Mock };
    const descartar = TestBed.inject(NgbActiveModal).dismiss as Mock;
    await modal.guardar();
    expect(alerta.advertencia).toHaveBeenCalled();
    expect(TestBed.inject(NgbActiveModal).close).not.toHaveBeenCalled();

    await modal.cancelar();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(descartar).toHaveBeenCalledTimes(1);
    modal.form.controls['nombre'].markAsDirty();
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.cancelar();
    expect(descartar).toHaveBeenCalledTimes(1);
  });
});
