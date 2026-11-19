import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, Envio, MensajeroInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnvioDetalleModal } from '../../features/envios/envio-detalle-modal';
import { EnvioModal } from '../../features/envios/envio-modal';
import { EnviosTable } from './envios-table';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

const entrega = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('Tabla de envíos', () => {
  let alerta: { exito: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmar: ReturnType<typeof vi.fn>; pedirTexto: ReturnType<typeof vi.fn> };
  let abrirModal: ReturnType<typeof vi.fn>;
  let data: DataService;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    alerta = { exito: vi.fn(), advertencia: vi.fn(), confirmar: vi.fn().mockResolvedValue(true), pedirTexto: vi.fn().mockResolvedValue('') };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AlertService, useValue: alerta }] });
    abrirModal = vi.spyOn(TestBed.inject(NgbModal), 'open').mockImplementation(
      () => ({ componentInstance: {}, result: Promise.reject(undefined) }) as never,
    ) as unknown as ReturnType<typeof vi.fn>;
    data = TestBed.inject(DataService);
    auth = TestBed.inject(AuthService);
  });

  async function clienteConSesion() {
    const { cliente: c, usuario } = data.agregarCliente(cliente);
    const emision = await auth.invitar(usuario.id);
    await auth.activar(emision!.enlace.split('/').pop()!, 'Cliente123');
    return c;
  }

  function tabla(acciones = true) {
    const f = TestBed.createComponent(EnviosTable);
    f.componentRef.setInput('envios', data.envios());
    f.componentRef.setInput('acciones', acciones);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const botones = (fila = 0) => [...el.querySelectorAll('tbody tr')[fila].querySelectorAll<HTMLButtonElement>('td:last-child button')];
    const titulos = (fila = 0) => botones(fila).map((b) => b.title);
    return { f, el, botones, titulos };
  }

  const esperar = () => new Promise((r) => setTimeout(r, 0));

  describe('diseño', () => {
    it('es una tabla en filas dentro de un área que se desplaza horizontalmente', async () => {
      const c = await clienteConSesion();
      data.crearEnvio(entrega, c.id);
      const { el } = tabla();
      const area = el.querySelector('.fx-table-scroll')!;
      expect(area.getAttribute('role')).toBe('region');
      expect(area.getAttribute('tabindex')).toBe('0');
      expect(area.querySelector('table.fx-table--filas')).not.toBeNull();
    });

    it('los botones solo muestran el ícono salvo en pantallas muy grandes', async () => {
      const c = await clienteConSesion();
      data.crearEnvio(entrega, c.id);
      const { botones } = tabla();
      expect(botones().length).toBeGreaterThan(0);
      for (const b of botones()) {
        expect(b.querySelector('i.bi')).not.toBeNull();
        expect(b.querySelector('span')?.className).toContain('d-none d-xl-inline');
        expect(b.getAttribute('aria-label')).toBeTruthy();
      }
    });

    it('sin envíos muestra el aviso en lugar de una tabla vacía', () => {
      const { el } = tabla();
      expect(el.querySelector('table')).toBeNull();
      expect(el.textContent).toContain('No hay envíos para mostrar');
    });

    it('sin acciones no muestra la columna', async () => {
      const c = await clienteConSesion();
      data.crearEnvio(entrega, c.id);
      const { el } = tabla(false);
      expect(el.textContent).not.toContain('Acciones');
      expect(el.querySelectorAll('tbody button')).toHaveLength(0);
    });
  });

  describe('acciones del cliente', () => {
    it('mientras el envío está pendiente puede ver el detalle, editarlo y cancelarlo', async () => {
      const c = await clienteConSesion();
      data.crearEnvio(entrega, c.id);
      expect(tabla().titulos()).toEqual(['Ver detalle', 'Editar envío', 'Cancelar envío', 'Imprimir etiqueta', 'Ver código QR']);
    });

    it('cuando ya llegó a Flexya solo puede ver el detalle', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      data.recepcionar(e.id);
      expect(tabla().titulos()).toEqual(['Ver detalle', 'Imprimir etiqueta', 'Ver código QR']);
    });

    it('con mensajero asignado no edita pero sí cancela, y avisa que el mensajero pierde el retiro', async () => {
      const c = await clienteConSesion();
      const m = data.agregarMensajero({
        nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email: 'santi@flexya.com', zonaId: 'caba-norte',
      }).mensajero;
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      data.asignar(e.id, m.id);
      const { f, titulos, botones } = tabla();
      expect(titulos()).toEqual(['Ver detalle', 'Cancelar envío', 'Imprimir etiqueta', 'Ver código QR']);

      botones()[1].click();
      await esperar();
      f.detectChanges();
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('Santiago Pereyra') }));
      expect(data.envios().find((x) => x.id === e.id)).toMatchObject({ estado: 'Cancelado', mensajeroId: null });
    });

    it('con el retiro fallido todavía se puede cancelar, y una vez retirado ya no', async () => {
      const c = await clienteConSesion();
      const m = data.agregarMensajero({
        nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email: 'santi@flexya.com', zonaId: 'caba-norte',
      }).mensajero;
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      data.asignar(e.id, m.id);
      data.retiroFallido(e.id, m.id, 'No había nadie');
      expect(tabla().titulos()).toContain('Cancelar envío');
      const otro = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      data.asignar(otro.id, m.id);
      data.retirar(otro.id, m.id);
      const { el } = tabla();
      const fila = [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent!.includes(otro.id))!;
      expect([...fila.querySelectorAll<HTMLButtonElement>('td:last-child button')].map((b) => b.title)).not.toContain('Cancelar envío');
    });

    it('ver el detalle abre el modal con ese envío', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      abrirModal.mockReturnValueOnce({ componentInstance: {}, result: Promise.resolve() });
      tabla().botones()[0].click();
      expect(abrirModal).toHaveBeenCalledWith(EnvioDetalleModal, expect.anything());
      expect(abrirModal.mock.results[0].value.componentInstance).toEqual({ envio: expect.objectContaining({ id: e.id }) });
    });

    it('editar abre el asistente de envíos con ese envío', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      tabla().botones()[1].click();
      expect(abrirModal).toHaveBeenCalledWith(EnvioModal, expect.anything());
      expect(abrirModal.mock.results[0].value.componentInstance).toMatchObject({ clienteId: c.id, envio: expect.objectContaining({ id: e.id }) });
    });

    it('cancelar pide confirmación y deja el envío cancelado', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      const { f, botones } = tabla();

      alerta.confirmar.mockResolvedValueOnce(false);
      botones()[2].click();
      await esperar();
      expect(data.envios()[0].estado).toBe('Pendiente');

      botones()[2].click();
      await esperar();
      f.detectChanges();
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'peligro' }));
      expect(data.envios().find((x) => x.id === e.id)?.estado).toBe('Cancelado');
      expect(alerta.exito).toHaveBeenCalledWith(`Envío ${e.id} cancelado`);
    });

    describe('retiro con varios destinatarios', () => {
      const dest = (destinatario: string) => ({ destinatario, telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', items: [] });
      const filasDeEnvio = (el: HTMLElement) => el.querySelectorAll('tbody tr:not(.fx-grupo-fila)');

      it('agrupa los envíos del mismo retiro bajo una fila con la cantidad y el progreso', async () => {
        const c = await clienteConSesion();
        const creados = data.crearRetiro({ retiro: 'deposito', destinos: [dest('Ana'), dest('Beto'), dest('Carla')] }, c.id);
        data.crearRetiro({ retiro: 'deposito', destinos: [dest('Suelto')] }, c.id);
        data.recepcionar(creados[0].id);
        const { el } = tabla();
        const encabezados = el.querySelectorAll('.fx-grupo-fila');
        expect(encabezados).toHaveLength(1);
        expect(encabezados[0].textContent).toContain(`Retiro ${creados[0].retiroId}`);
        expect(encabezados[0].textContent).toContain('3 destinatarios');
        expect(encabezados[0].textContent).toContain('0 de 3 entregados');
        expect(filasDeEnvio(el)).toHaveLength(4);
      });

      it('el grupo se puede plegar y desplegar', async () => {
        const c = await clienteConSesion();
        data.crearRetiro({ retiro: 'deposito', destinos: [dest('Ana'), dest('Beto')] }, c.id);
        const { f, el } = tabla();
        expect(filasDeEnvio(el)).toHaveLength(2);
        el.querySelector<HTMLButtonElement>('.fx-grupo-titulo')!.click();
        f.detectChanges();
        expect(filasDeEnvio(el)).toHaveLength(0);
        el.querySelector<HTMLButtonElement>('.fx-grupo-titulo')!.click();
        f.detectChanges();
        expect(filasDeEnvio(el)).toHaveLength(2);
      });

      it('un envío suelto no lleva fila de grupo', async () => {
        const c = await clienteConSesion();
        data.crearRetiro({ retiro: 'deposito', destinos: [dest('Ana')] }, c.id);
        expect(tabla().el.querySelectorAll('.fx-grupo-fila')).toHaveLength(0);
      });

      it('el cliente cancela el retiro completo con confirmación', async () => {
        const c = await clienteConSesion();
        const creados = data.crearRetiro({ retiro: 'deposito', destinos: [dest('Ana'), dest('Beto')] }, c.id);
        const { f, el } = tabla();
        const boton = () => el.querySelector<HTMLButtonElement>('[title="Cancelar el retiro completo"]')!;

        alerta.confirmar.mockResolvedValueOnce(false);
        boton().click();
        await esperar();
        expect(data.envios().every((e) => e.estado === 'Pendiente')).toBe(true);

        boton().click();
        await esperar();
        f.detectChanges();
        expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: `¿Cancelar el retiro ${creados[0].retiroId}?` }));
        expect(data.envios().every((e) => e.estado === 'Cancelado')).toBe(true);
        expect(alerta.exito).toHaveBeenCalledWith(`Retiro ${creados[0].retiroId}: 2 envíos cancelados`);
      });

      it('el superadmin ve el grupo pero no tiene el botón de cancelar el retiro del cliente', async () => {
        const c = data.agregarCliente(cliente).cliente;
        data.crearRetiro({ retiro: 'deposito', destinos: [dest('Ana'), dest('Beto')] }, c.id);
        await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
        const { el } = tabla();
        expect(el.querySelectorAll('.fx-grupo-fila')).toHaveLength(1);
        expect(el.querySelector('[title="Cancelar el retiro completo"]')).toBeNull();
      });
    });

    it('un envío cancelado no se puede eliminar: el cliente solo puede verlo', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      data.cancelarEnvio(e.id, c.id);
      expect(tabla().titulos()).toEqual(['Ver detalle']);
      expect(data.eliminarBorrador(e.id, c.id)).toBe(false);
    });

    it('un borrador se puede editar, solicitar o eliminar, y no reserva stock hasta solicitarlo', async () => {
      const c = await clienteConSesion();
      const p = data.agregarProducto(c.id, { stock: 10, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
      const e = data.crearEnvio({ ...entrega, borrador: true, items: [{ productoId: p.id, cantidad: 4 }] }, c.id);
      expect(e.estado).toBe('Borrador');
      expect(data.productos()[0].stock).toBe(10);
      expect(tabla().titulos()).toEqual(['Ver detalle', 'Editar envío', 'Solicitar envío', 'Eliminar borrador']);

      const { f, botones } = tabla();
      botones()[2].click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0].estado).toBe('Pendiente');
      expect(data.productos()[0].stock).toBe(6);
      expect(data.envios()[0].historial.map((h) => h.estado)).toEqual(['Borrador', 'Pendiente']);
    });

    it('eliminar un borrador pide confirmación y lo borra sin dejar rastro de stock', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio({ ...entrega, borrador: true }, c.id);
      const { botones } = tabla();
      alerta.confirmar.mockResolvedValueOnce(false);
      botones()[3].click();
      await esperar();
      expect(data.envios()).toHaveLength(1);
      botones()[3].click();
      await esperar();
      expect(data.envios().some((x) => x.id === e.id)).toBe(false);
      expect(data.movimientos()).toHaveLength(0);
    });

    it('un borrador no se puede solicitar si no alcanza el stock', async () => {
      const c = await clienteConSesion();
      const p = data.agregarProducto(c.id, { stock: 2, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
      const e = data.crearEnvio({ ...entrega, borrador: true, items: [{ productoId: p.id, cantidad: 5 }] }, c.id);
      expect(() => data.solicitarEnvio(e.id, c.id)).toThrow(/hay 2 en stock/);
      expect(data.envios()[0].estado).toBe('Borrador');
    });

    it('un envío solicitado se cancela pero no se elimina, y las fechas quedan registradas', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio({ ...entrega, programado: true, fechaRetiro: '2030-01-15' }, c.id);
      expect(e.fechaRetiro).toBe('2030-01-15');
      expect(e.historial).toEqual([expect.objectContaining({ estado: 'Pendiente', detalle: 'Envío solicitado' })]);
      expect(data.eliminarBorrador(e.id, c.id)).toBe(false);
      data.cancelarEnvio(e.id, c.id);
      expect(data.envios()[0].historial.map((h) => h.estado)).toEqual(['Pendiente', 'Cancelado']);
      expect(tabla().el.textContent).toContain('Llega 15/01/30 · programado');
    });

    it('si el envío ya no es pendiente al confirmar, avisa y no lo cancela', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      const { botones } = tabla();
      data.recepcionar(e.id);
      botones()[2].click();
      await esperar();
      expect(alerta.advertencia).toHaveBeenCalledWith('Este envío ya no se puede cancelar.');
      expect(data.envios()[0].estado).toBe('En depósito');
    });
  });

  describe('acciones del superadmin', () => {
    beforeEach(async () => {
      await auth.configurarSuperadmin({ nombre: 'Marina Ríos', email: 'admin@flexya.com', clave: 'Admin1234' });
    });

    it('un envío vía depósito se puede ver y recepcionar, pero no asignar todavía ni editar ni cancelar', async () => {
      const c = data.agregarCliente(cliente).cliente;
      data.crearEnvio(entrega, c.id);
      const { titulos, botones, f } = tabla();
      expect(titulos()).toEqual(['Ver detalle', 'Recepcionar en depósito', 'Reportar diferencia', 'Cancelar envío', 'Eliminar envío', 'Imprimir etiqueta']);

      alerta.pedirTexto.mockResolvedValueOnce(null);
      botones()[1].click();
      await esperar();
      expect(data.envios()[0].estado).toBe('Pendiente');

      alerta.pedirTexto.mockResolvedValueOnce('Caja con un golpe');
      botones()[1].click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0].estado).toBe('En depósito');
      expect(data.actividades()[0].detalle).toContain('Caja con un golpe');
      expect(alerta.exito).toHaveBeenCalledWith(expect.stringContaining('recepcionado en depósito'));
    });

    it('un envío en depósito se asigna a un mensajero, y avisa si todavía no hay ninguno', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio(entrega, c.id);
      data.recepcionar(e.id);
      const sin = tabla();
      expect(sin.el.textContent).toContain('Primero creá un mensajero.');

      const { mensajero: m } = data.agregarMensajero(mensajero);
      const { f, el, botones } = tabla();
      expect(el.querySelector('select')).not.toBeNull();
      botones(0).find((b) => b.title === 'Asignar al mensajero')!.click();
      await esperar();
      f.detectChanges();
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: expect.stringContaining('¿Asignar') }));
      expect(data.envios()[0]).toMatchObject({ estado: 'En reparto', mensajeroId: m.id });
    });

    it('un envío directo (retiro en domicilio) no se recepciona: se asigna desde pendiente', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      const { mensajero: m } = data.agregarMensajero(mensajero);
      const { titulos, botones, f } = tabla();
      expect(titulos()).toEqual(['Ver detalle', 'Asignar al mensajero', 'Cancelar envío', 'Eliminar envío', 'Imprimir etiqueta']);
      expect(data.recepcionar(e.id)).toBe(false);

      botones(0).find((b) => b.title === 'Asignar al mensajero')!.click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0]).toMatchObject({ estado: 'Retiro asignado', mensajeroId: m.id });
    });

    it('el superadmin cancela con motivo, el stock vuelve y el cliente ve el motivo', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const p = data.agregarProducto(c.id, { stock: 10, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
      const e = data.crearEnvio({ ...entrega, items: [{ productoId: p.id, cantidad: 4 }] }, c.id);
      expect(data.productos()[0].stock).toBe(6);
      const { f, botones } = tabla();

      alerta.pedirTexto.mockResolvedValueOnce(null);
      botones(0).find((b) => b.title === 'Cancelar envío')!.click();
      await esperar();
      expect(data.envios()[0].estado).toBe('Pendiente');

      alerta.pedirTexto.mockResolvedValueOnce('Dirección inexistente');
      botones(0).find((b) => b.title === 'Cancelar envío')!.click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0]).toMatchObject({ id: e.id, estado: 'Cancelado', nota: 'Cancelado por Flexya: Dirección inexistente' });
      expect(data.productos()[0].stock).toBe(10);
    });

    it('el superadmin solo cancela lo que Flexya todavía no tiene; lo que ya recibió se devuelve', () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio(entrega, c.id);
      expect(data.cancelarPorAdmin(e.id, '  ')).toBe(false);
      data.recepcionar(e.id);
      expect(data.cancelarPorAdmin(e.id, 'Motivo')).toBe(false);
      const otro = data.crearEnvio(entrega, c.id);
      expect(data.cancelarPorAdmin(otro.id, 'Motivo')).toBe(true);
    });

    it('si lo recibido no coincide, el superadmin pone el envío en revisión con el motivo', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio(entrega, c.id);
      const { f, botones } = tabla();

      alerta.pedirTexto.mockResolvedValueOnce('Llegaron 2 tazas en lugar de 3');
      botones(0).find((b) => b.title === 'Reportar diferencia')!.click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0]).toMatchObject({ id: e.id, estado: 'En revisión', nota: 'Llegaron 2 tazas en lugar de 3', eta: 'En pausa' });
      expect(tabla().titulos()).toEqual(['Ver detalle', 'Reanudar envío', 'Devolver al cliente', 'Imprimir etiqueta']);
    });

    it('un envío en revisión no se asigna hasta reanudarlo, y reanudar lo deja listo en depósito', () => {
      const c = data.agregarCliente(cliente).cliente;
      const { mensajero: m } = data.agregarMensajero(mensajero);
      const e = data.crearEnvio(entrega, c.id);
      expect(data.observar(e.id, ' ')).toBe(false);
      expect(data.observar(e.id, 'Falta una unidad')).toBe(true);
      expect(data.asignar(e.id, m.id)).toBe(false);
      expect(data.reanudar(e.id)).toBe(true);
      expect(data.envios()[0]).toMatchObject({ estado: 'En depósito', nota: '' });
      expect(data.reanudar(e.id)).toBe(false);
    });

    it('un envío directo no se puede observar (todavía no pasó por el depósito)', () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      expect(data.observar(e.id, 'Algo')).toBe(false);
    });

    it('el cliente puede corregir o cancelar un envío en revisión', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio(entrega, c.id);
      data.observar(e.id, 'No coincide');
      expect(data.actualizarEnvio(e.id, c.id, { ...entrega, destinatario: 'Ana Corregida' })).toBe(true);
      expect(data.envios()[0]).toMatchObject({ estado: 'En revisión', destinatario: 'Ana Corregida' });
      expect(data.cancelarEnvio(e.id, c.id)).toBe(true);
    });

    it('el superadmin elimina un envío con confirmación: desaparece para todos y las unidades vuelven al stock', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const p = data.agregarProducto(c.id, { stock: 10, nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
      const e = data.crearEnvio({ ...entrega, items: [{ productoId: p.id, cantidad: 4 }] }, c.id);
      expect(data.productos()[0].stock).toBe(6);
      const { botones } = tabla();

      alerta.confirmar.mockResolvedValueOnce(false);
      botones(0).find((b) => b.title === 'Eliminar envío')!.click();
      await esperar();
      expect(data.envios()).toHaveLength(1);

      botones(0).find((b) => b.title === 'Eliminar envío')!.click();
      await esperar();
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: `¿Eliminar el envío ${e.id}?`, tipo: 'peligro' }));
      expect(data.envios()).toHaveLength(0);
      expect(data.productos()[0].stock).toBe(10);
    });

    it('el superadmin no ve ni puede eliminar los borradores del cliente', () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio({ ...entrega, borrador: true }, c.id);
      expect(data.enviosDe(auth.user())).toHaveLength(0);
      expect(data.eliminarEnvio(e.id)).toBe(false);
    });

    it('un mensajero que se elimina deja sus envíos cerrados sin mensajero asignado', () => {
      const c = data.agregarCliente(cliente).cliente;
      const { mensajero: m } = data.agregarMensajero(mensajero);
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      data.asignar(e.id, m.id);
      expect(data.eliminarMensajero(m.id)).toBe(false);
      data.retirar(e.id, m.id);
      data.salirAEntregar(e.id, m.id);
      data.entregar(e.id, 'Ana');
      expect(data.resumenMensajero(m.id)).toEqual({ cerrados: 1, enCurso: 0 });
      expect(data.eliminarMensajero(m.id)).toBe(false);
      const l = data.generarLiquidacion(m.id, '2000-01-01', '2999-12-31')!;
      data.pagarLiquidacion(l.id, 'Transferencia');
      expect(data.eliminarMensajero(m.id)).toBe(true);
      expect(data.envios()[0]).toMatchObject({ id: e.id, estado: 'Entregado', mensajeroId: null });
    });

    it('un retiro que pasa por el depósito se recepciona recién cuando el mensajero declaró la entrega', async () => {
      const c = data.agregarCliente(cliente).cliente;
      const { mensajero: m } = data.agregarMensajero(mensajero);
      const e = data.crearEnvio({ ...entrega, retiro: 'recoleccion' }, c.id);
      data.asignar(e.id, m.id);
      data.retirar(e.id, m.id);
      expect(tabla().titulos()).not.toContain('Recepcionar en depósito');

      data.entregarEnDeposito(e.id, m.id);
      const { f, botones } = tabla();
      expect(botones(0).map((b) => b.title)).toContain('Recepcionar en depósito');
      alerta.pedirTexto.mockResolvedValueOnce('Sin novedades');
      botones(0).find((b) => b.title === 'Recepcionar en depósito')!.click();
      await esperar();
      f.detectChanges();
      expect(data.envios()[0]).toMatchObject({ estado: 'En depósito', mensajeroId: null });
      expect(tabla().titulos()).toContain('Asignar al mensajero');
    });

    it('no se asigna un envío vía depósito que todavía no llegó, ni a un mensajero inexistente', () => {
      const c = data.agregarCliente(cliente).cliente;
      const e = data.crearEnvio(entrega, c.id);
      const { mensajero: m } = data.agregarMensajero(mensajero);
      expect(data.asignar(e.id, m.id)).toBe(false);
      data.recepcionar(e.id);
      expect(data.asignar(e.id, 'nadie')).toBe(false);
      expect(data.asignar(e.id, m.id)).toBe(true);
    });
  });

  describe('reprogramar lo que quedó pendiente de otro día', () => {
    afterEach(() => vi.useRealTimers());

    it('el botón aparece solo cuando el envío viene de un día anterior y reprograma el retiro', async () => {
      const c = await clienteConSesion();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2030, 0, 15, 9, 0));
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      expect(tabla().titulos()).not.toContain('Reprogramar retiro');

      vi.setSystemTime(new Date(2030, 0, 16, 9, 0));
      const { botones, titulos } = tabla();
      expect(titulos()).toEqual(['Ver detalle', 'Reprogramar retiro', 'Editar envío', 'Cancelar envío', 'Imprimir etiqueta', 'Ver código QR']);
      expect(tabla().el.textContent).toContain('Viene de ayer');

      (alerta as Record<string, unknown>)['pedirReprogramacion'] = vi.fn().mockResolvedValue({ fecha: '2030-01-17', franja: 'tarde' });
      botones().find((b) => b.title === 'Reprogramar retiro')!.click();
      await esperar();
      expect(data.envios().find((x) => x.id === e.id)).toMatchObject({ fechaRetiro: '2030-01-17', retiroProgramado: true, franja: 'tarde' });
      expect(alerta.exito).toHaveBeenCalledWith(expect.stringContaining('17/01'));
      expect(tabla().titulos()).not.toContain('Reprogramar retiro');
    });
  });

  describe('tarjetas en teléfono', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('en pantalla chica cada envío es una tarjeta y no hay tabla', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      const { el } = tabla();
      expect(el.querySelector('table')).toBeNull();
      const tarjetas = el.querySelectorAll('.fx-envio-card');
      expect(tarjetas).toHaveLength(1);
      expect(tarjetas[0].textContent).toContain(e.id);
      expect(tarjetas[0].textContent).toContain('Ana Gómez');
      expect(tarjetas[0].querySelector('fx-status')).not.toBeNull();
    });

    it('las tarjetas traen las mismas acciones que la tabla, con su nombre visible', async () => {
      const c = await clienteConSesion();
      data.crearEnvio(entrega, c.id);
      const { el } = tabla();
      const botones = [...el.querySelectorAll<HTMLButtonElement>('.fx-card-acciones button')];
      expect(botones.map((b) => b.title)).toEqual(['Ver detalle', 'Editar envío', 'Cancelar envío', 'Imprimir etiqueta', 'Ver código QR']);
    });

    it('un retiro con varios destinatarios muestra su encabezado y una tarjeta por envío', async () => {
      const c = await clienteConSesion();
      data.crearRetiro({ retiro: 'domicilio', destinos: [{ ...entrega, items: [] }, { ...entrega, destinatario: 'Bruno Díaz', items: [] }] }, c.id);
      const { el } = tabla();
      expect(el.querySelector('.fx-card-grupo')!.textContent).toContain('2 destinatarios');
      expect(el.querySelectorAll('.fx-envio-card')).toHaveLength(2);
    });

    it('al tocar una acción en la tarjeta hace lo mismo que en la tabla', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      const { el } = tabla();
      el.querySelector<HTMLButtonElement>('.fx-card-acciones button[title="Cancelar envío"]')!.click();
      await esperar();
      expect(alerta.confirmar).toHaveBeenCalled();
      expect(data.envios().find((x) => x.id === e.id)!.estado).toBe('Cancelado');
    });
  });

  describe('ver el QR en pantalla', () => {
    it('el cliente puede mostrar el QR de un envío que sigue su camino, y el superadmin no ve ese botón', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id);
      const componentInstance: { envio?: Envio } = {};
      abrirModal.mockReturnValue({ componentInstance, result: Promise.resolve(undefined) });
      const { botones, titulos } = tabla();
      expect(titulos()).toContain('Ver código QR');
      botones().find((b) => b.title === 'Ver código QR')!.click();
      await esperar();
      expect(componentInstance.envio).toMatchObject({ id: e.id });
      expect(abrirModal).toHaveBeenCalledTimes(1);
    });

    it('un envío cancelado o entregado ya no ofrece el QR', async () => {
      const c = await clienteConSesion();
      const e = data.crearEnvio(entrega, c.id);
      data.cancelarEnvio(e.id, c.id);
      expect(tabla().titulos()).not.toContain('Ver código QR');
    });
  });
});
