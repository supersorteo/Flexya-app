import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, ProductoInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { Productos } from './productos';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

const producto = (nombre: string, extra: Partial<ProductoInput> = {}): ProductoInput => ({
  nombre, stock: 10, descripcion: '', precio: 1500, peso: 0.5, alto: 10, ancho: 20, largo: 30, ...extra,
});

describe('Pantalla de productos del cliente', () => {
  let alerta: { exito: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmar: ReturnType<typeof vi.fn> };
  let abrirModal: ReturnType<typeof vi.fn>;
  let data: DataService;
  let clienteId: string;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    alerta = { exito: vi.fn(), advertencia: vi.fn(), confirmar: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AlertService, useValue: alerta }] });
    abrirModal = vi.spyOn(TestBed.inject(NgbModal), 'open').mockImplementation(
      () => ({ componentInstance: {}, result: Promise.reject(undefined) }) as never,
    ) as unknown as ReturnType<typeof vi.fn>;

    data = TestBed.inject(DataService);
    const auth = TestBed.inject(AuthService);
    const { cliente: c, usuario } = data.agregarCliente(cliente);
    clienteId = c.id;
    const emision = await auth.invitar(usuario.id);
    await auth.activar(emision!.enlace.split('/').pop()!, 'Cliente123');
  });

  function pantalla() {
    const f = TestBed.createComponent(Productos);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, texto: () => (f.nativeElement as HTMLElement).textContent ?? '' };
  }

  const escribir = (el: HTMLElement, valor: string) => {
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };

  it('sin productos muestra el estado vacío con un botón para crear el primero', () => {
    const { el, texto } = pantalla();
    expect(texto()).toContain('Todavía no cargaste ningún producto');
    el.querySelector<HTMLButtonElement>('.text-center .btn-primary')!.click();
    expect(abrirModal).toHaveBeenCalledTimes(1);
  });

  it('lista solo los productos del cliente con sus medidas, peso y precio', () => {
    data.agregarProducto(clienteId, producto('Taza de cerámica', { descripcion: 'Blanca, 300 ml', alto: 9.5, ancho: 8, largo: 8 }));
    data.agregarProducto('otro-cliente', producto('Producto ajeno'));
    const { f, el, texto } = pantalla();
    f.detectChanges();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(texto()).toContain('Taza de cerámica');
    expect(texto()).toContain('Blanca, 300 ml');
    expect(texto()).toContain('cm³');
    expect(texto()).toContain('kg');
    expect(texto()).not.toContain('Producto ajeno');
  });

  it('si faltan datos opcionales muestra un guion en lugar de inventarlos', () => {
    data.agregarProducto(clienteId, producto('Taza', { precio: null, peso: null, alto: null, ancho: null, largo: null }));
    const { el, texto } = pantalla();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(el.querySelectorAll('tbody td .fx-muted')).toHaveLength(4);
    expect(texto()).not.toContain('cm³');
    expect(texto()).not.toContain('kg');
    expect(texto()).not.toContain('$');
  });

  it('con medidas parciales muestra las que hay y no calcula el volumen', () => {
    data.agregarProducto(clienteId, producto('Taza', { alto: 10, ancho: null, largo: null, peso: null, precio: null }));
    const { texto } = pantalla();
    expect(texto()).toContain('10 × — × — cm');
    expect(texto()).not.toContain('cm³');
  });

  it('busca por nombre o descripción', () => {
    data.agregarProducto(clienteId, producto('Taza de cerámica', { descripcion: 'Regalo' }));
    data.agregarProducto(clienteId, producto('Remera de algodón'));
    const { f, el, texto } = pantalla();
    escribir(el, 'remera');
    f.detectChanges();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(texto()).toContain('Remera de algodón');
    escribir(el, 'regalo');
    f.detectChanges();
    expect(texto()).toContain('Taza de cerámica');
    escribir(el, 'zzz');
    f.detectChanges();
    expect(texto()).toContain('No hay productos que coincidan');
  });

  it('crear y editar abren el modal con el cliente y el producto', () => {
    const p = data.agregarProducto(clienteId, producto('Taza'));
    const { f, el } = pantalla();
    el.querySelector<HTMLButtonElement>('fx-page-header .btn-primary')!.click();
    expect(abrirModal.mock.results[0].value.componentInstance).toMatchObject({ producto: null, clienteId });

    f.detectChanges();
    el.querySelector<HTMLButtonElement>('tbody [title="Editar producto"]')!.click();
    expect(abrirModal.mock.results[1].value.componentInstance).toMatchObject({ producto: expect.objectContaining({ id: p.id }), clienteId });
  });

  it('guarda lo que devuelve el modal al crear y al editar', async () => {
    const { el } = pantalla();
    abrirModal.mockReturnValueOnce({ componentInstance: {}, result: Promise.resolve(producto('Taza nueva')) });
    el.querySelector<HTMLButtonElement>('fx-page-header .btn-primary')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(data.productos().map((p) => p.nombre)).toEqual(['Taza nueva']);
    expect(alerta.exito).toHaveBeenCalledWith('Producto Taza nueva creado');

    const id = data.productos()[0].id;
    abrirModal.mockReturnValueOnce({ componentInstance: {}, result: Promise.resolve(producto('Taza renovada', { precio: 2000 })) });
    const f = TestBed.createComponent(Productos);
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody [title="Editar producto"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(data.productos().find((p) => p.id === id)).toMatchObject({ nombre: 'Taza renovada', precio: 2000 });
  });

  it('elimina solo si se confirma', async () => {
    data.agregarProducto(clienteId, producto('Taza'));
    const { f, el } = pantalla();
    alerta.confirmar.mockResolvedValueOnce(false);
    el.querySelector<HTMLButtonElement>('tbody .btn-outline-danger')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(data.productos()).toHaveLength(1);

    el.querySelector<HTMLButtonElement>('tbody .btn-outline-danger')!.click();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    expect(data.productos()).toHaveLength(0);
    expect(alerta.exito).toHaveBeenCalledWith('Producto Taza eliminado');
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'peligro' }));
  });
});
