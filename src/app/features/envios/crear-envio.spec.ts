import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, Envio, NuevoEnvio, NuevoPedidoRetiro } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { CrearEnvio } from './crear-envio';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

describe('Alta de envíos del cliente', () => {
  let alerta: { exito: ReturnType<typeof vi.fn>; exitoConAccion: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmar: ReturnType<typeof vi.fn> };
  let abrirModal: ReturnType<typeof vi.fn>;
  let navegar: ReturnType<typeof vi.fn>;
  let data: DataService;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    alerta = { exito: vi.fn(), exitoConAccion: vi.fn().mockResolvedValue(false), advertencia: vi.fn(), confirmar: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AlertService, useValue: alerta }] });
    abrirModal = vi.spyOn(TestBed.inject(NgbModal), 'open') as unknown as ReturnType<typeof vi.fn>;
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    data = TestBed.inject(DataService);
    auth = TestBed.inject(AuthService);
  });

  async function clienteConSesion() {
    const { cliente: c, usuario } = data.agregarCliente(cliente);
    const emision = await auth.invitar(usuario.id);
    await auth.activar(emision!.enlace.split('/').pop()!, 'Cliente123');
    return c;
  }

  const destino = (productoId: string, destinatario = 'Ana Gómez', cantidad = 3) => ({
    destinatario, telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', items: [{ productoId, cantidad }],
  });
  const pedido = (productoId: string): NuevoPedidoRetiro => ({ retiro: 'domicilio', destinos: [destino(productoId)] });

  it('abre el asistente para el cliente, crea el envío con lo que devuelve y vuelve a su lista', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: 1500, peso: 0.3, alto: 10, ancho: 8, largo: 8 });
    const componentInstance: { clienteId?: string } = {};
    abrirModal.mockReturnValue({ componentInstance, result: Promise.resolve(pedido(taza.id)) });

    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 0));

    expect(componentInstance.clienteId).toBe(c.id);
    expect(data.envios()).toHaveLength(1);
    expect(data.envios()[0]).toMatchObject({
      clienteId: c.id, estado: 'Pendiente', retiro: 'domicilio', origen: 'Av. Mitre 100, Avellaneda',
      items: [expect.objectContaining({ productoId: taza.id, nombre: 'Taza', cantidad: 3 })],
    });
    expect(alerta.exitoConAccion).toHaveBeenCalledWith(expect.objectContaining({ titulo: expect.stringMatching(/^Envío LF-\d+ creado correctamente$/), accion: 'Imprimir etiqueta' }));
    expect(navegar).toHaveBeenCalledWith(['/cliente/envios']);
  });

  it('un retiro con varios destinatarios crea un envío por destinatario, todos en el mismo retiro', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    const remera = data.agregarProducto(c.id, { stock: 100, nombre: 'Remera', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    abrirModal.mockReturnValue({
      componentInstance: {},
      result: Promise.resolve({
        retiro: 'domicilio',
        destinos: [destino(taza.id, 'Ana Gómez', 2), { ...destino(remera.id, 'Beto Díaz', 5), localidad: 'Palermo' }],
      } satisfies NuevoPedidoRetiro),
    });

    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 0));

    expect(data.envios()).toHaveLength(2);
    const [b, a] = data.envios();
    expect(a.retiroId).toBe(b.retiroId);
    expect(a.items).toEqual([expect.objectContaining({ productoId: taza.id, cantidad: 2 })]);
    expect(b.items).toEqual([expect.objectContaining({ productoId: remera.id, cantidad: 5 })]);
    expect(alerta.exitoConAccion).toHaveBeenCalledWith(expect.objectContaining({ titulo: expect.stringMatching(/^Retiro R-\d+ listo: 2 envíos$/), accion: 'Imprimir etiquetas' }));
    expect(navegar).toHaveBeenCalledTimes(1);
  });

  it('si el stock total no alcanza, no se crea ningún envío del retiro y se avisa', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 5, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    abrirModal.mockReturnValue({
      componentInstance: {},
      result: Promise.resolve({ retiro: 'domicilio', destinos: [destino(taza.id, 'Ana', 3), destino(taza.id, 'Beto', 3)] } satisfies NuevoPedidoRetiro),
    });
    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 0));
    expect(data.envios()).toHaveLength(0);
    expect(data.productos()[0].stock).toBe(5);
    expect(alerta.advertencia).toHaveBeenCalledWith(expect.stringContaining('hay 5 en stock'));
    expect(navegar).not.toHaveBeenCalled();
  });

  it('al crear el envío se ofrece imprimir las etiquetas y, si la persona acepta, se muestran una por paquete', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    const etiquetas: { envios?: Envio[]; titulo?: string } = {};
    alerta.exitoConAccion.mockResolvedValue(true);
    abrirModal
      .mockReturnValueOnce({ componentInstance: {}, result: Promise.resolve({ retiro: 'domicilio', destinos: [destino(taza.id), destino(taza.id, 'Bruno Díaz')] }) })
      .mockReturnValueOnce({ componentInstance: etiquetas, result: Promise.resolve(undefined) });
    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 10));
    expect(abrirModal).toHaveBeenCalledTimes(2);
    expect(etiquetas.envios).toHaveLength(2);
    expect(etiquetas.envios!.map((e) => e.destinatario).sort()).toEqual(['Ana Gómez', 'Bruno Díaz']);
    expect(etiquetas.titulo).toContain('2 etiquetas');
  });

  it('si la persona no quiere imprimir ahora, no se abre nada: la etiqueta sigue disponible desde su lista', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    alerta.exitoConAccion.mockResolvedValue(false);
    abrirModal.mockReturnValue({ componentInstance: {}, result: Promise.resolve({ retiro: 'domicilio', destinos: [destino(taza.id)] }) });
    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 10));
    expect(alerta.exitoConAccion).toHaveBeenCalledTimes(1);
    expect(abrirModal).toHaveBeenCalledTimes(1);
    expect(data.envios()).toHaveLength(1);
  });

  it('un borrador no ofrece etiquetas: todavía no se pidió el servicio', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    abrirModal.mockReturnValue({ componentInstance: {}, result: Promise.resolve({ retiro: 'domicilio', borrador: true, destinos: [destino(taza.id)] }) });
    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 0));
    expect(abrirModal).toHaveBeenCalledTimes(1);
    expect(alerta.exitoConAccion).not.toHaveBeenCalled();
    expect(alerta.exito).toHaveBeenCalledWith(expect.stringContaining('Borrador'));
  });

  it('si se cierra el asistente sin guardar no se crea nada', async () => {
    await clienteConSesion();
    abrirModal.mockReturnValue({ componentInstance: {}, result: Promise.reject(undefined) });
    TestBed.inject(CrearEnvio).abrir();
    await new Promise((r) => setTimeout(r, 0));
    expect(data.envios()).toHaveLength(0);
    expect(alerta.exito).not.toHaveBeenCalled();
  });

  describe('editar', () => {
    const cambios: NuevoEnvio = { destinatario: 'Bruno Díaz', telefono: '+54 9 11 6666 7777', direccion: 'Honduras 4800', localidad: 'Palermo', retiro: 'deposito' };

    it('abre el asistente con el envío y guarda lo que devuelve', async () => {
      const c = await clienteConSesion();
      const envio = data.crearEnvio({ destinatario: 'Ana', telefono: '+54 9 11 5555 0000', direccion: 'Calle 1', localidad: 'Belgrano' }, c.id);
      const componentInstance: { clienteId?: string; envio?: unknown } = {};
      abrirModal.mockReturnValue({ componentInstance, result: Promise.resolve(cambios) });

      TestBed.inject(CrearEnvio).editar(envio);
      await new Promise((r) => setTimeout(r, 0));

      expect(componentInstance).toMatchObject({ clienteId: c.id, envio });
      expect(data.envios()[0]).toMatchObject({ id: envio.id, destinatario: 'Bruno Díaz', localidad: 'Palermo' });
      expect(alerta.exito).toHaveBeenCalledWith(`Envío ${envio.id} actualizado`);
    });

    it('avisa si mientras tanto el envío dejó de ser editable', async () => {
      const c = await clienteConSesion();
      const envio = data.crearEnvio({ destinatario: 'Ana', telefono: '+54 9 11 5555 0000', direccion: 'Calle 1', localidad: 'Belgrano' }, c.id);
      abrirModal.mockReturnValue({ componentInstance: {}, result: Promise.resolve(cambios) });
      TestBed.inject(CrearEnvio).editar(envio);
      data.recepcionar(envio.id);
      await new Promise((r) => setTimeout(r, 0));
      expect(alerta.advertencia).toHaveBeenCalledWith('Este envío ya no se puede editar.');
      expect(data.envios()[0].destinatario).toBe('Ana');
    });

    it('no abre el asistente para un envío de otro cliente', async () => {
      await clienteConSesion();
      const ajeno = data.crearEnvio({ destinatario: 'Ana', telefono: '+54 9 11 5555 0000', direccion: 'Calle 1', localidad: 'Belgrano' }, 'c-ajeno');
      TestBed.inject(CrearEnvio).editar(ajeno);
      expect(abrirModal).not.toHaveBeenCalled();
    });
  });

  it('solo un cliente con sesión puede abrirlo', () => {
    TestBed.inject(CrearEnvio).abrir();
    expect(abrirModal).not.toHaveBeenCalled();
  });

  it('la lista muestra de cada envío las unidades, el peso y cómo llega a Flexya', async () => {
    const c = await clienteConSesion();
    const taza = data.agregarProducto(c.id, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: 0.3, alto: null, ancho: null, largo: null });
    const sinPeso = data.agregarProducto(c.id, { stock: 100, nombre: 'Remera', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    const base = { destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Belgrano' };
    data.crearEnvio({ ...base, retiro: 'domicilio', items: [{ productoId: taza.id, cantidad: 4 }, { productoId: taza.id, cantidad: 1 }] }, c.id);
    data.crearEnvio({ ...base, retiro: 'deposito', items: [{ productoId: sinPeso.id, cantidad: 2 }] }, c.id);
    data.crearEnvio(base, c.id);

    const f = TestBed.createComponent(EnviosTable);
    f.componentRef.setInput('envios', data.envios());
    f.detectChanges();
    const subs = [...(f.nativeElement as HTMLElement).querySelectorAll('tbody tr td:first-child .fx-sub')].map((s) => s.textContent);
    expect(subs).toEqual(['Lo lleva al depósito', '2 u. · Lo lleva al depósito', '5 u. · 1,5 kg · Retiro en domicilio']);
  });
});
