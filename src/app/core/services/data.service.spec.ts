import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput, resumenItems } from '../models';
import { DataService, StockInsuficienteError } from './data.service';

const KEY = 'flexya-datos';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '20-30211999-7',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

const mensajeroInput: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '+54 9 11 5555 3001', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

function preparar() {
  localStorage.clear();
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
  vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'table').mockImplementation(() => undefined);
  TestBed.configureTestingModule({});
}

describe('Datos iniciales', () => {
  beforeEach(preparar);

  it('arranca vacío y pide la configuración inicial', () => {
    const data = TestBed.inject(DataService);
    expect(data.necesitaConfiguracion()).toBe(true);
    expect([data.usuarios(), data.clientes(), data.mensajeros(), data.envios(), data.lotes(), data.retiros(), data.actividades()].every((l) => l.length === 0)).toBe(true);
  });

  it('con un superadmin creado ya no pide la configuración', () => {
    const data = TestBed.inject(DataService);
    data.crearSuperadmin('Marina Ríos', ' Admin@Flexya.com ', 'hash', 'sal');
    expect(data.necesitaConfiguracion()).toBe(false);
    expect(data.usuarios()[0]).toMatchObject({ rol: 'admin', estado: 'ACTIVO', email: 'admin@flexya.com' });
  });

  it('la clave cifrada y la sal no se imprimen en la consola', () => {
    const data = TestBed.inject(DataService);
    data.crearSuperadmin('Marina Ríos', 'admin@flexya.com', 'HASH-SECRETO', 'SAL-SECRETA');
    const salida = JSON.stringify([vi.mocked(console.log).mock.calls, vi.mocked(console.table).mock.calls]);
    expect(salida).not.toContain('HASH-SECRETO');
    expect(salida).not.toContain('SAL-SECRETA');
  });
});

describe('Gestión de clientes', () => {
  beforeEach(preparar);

  it('al crear un cliente se crea su cuenta pendiente, sin contraseña', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c, usuario } = data.agregarCliente(cliente);
    expect(usuario).toMatchObject({
      rol: 'cliente', estado: 'PENDIENTE', email: 'hola@tallersur.com', clienteId: c.id, claveHash: null, sal: null, intentosFallidos: 0,
    });
    expect(data.usuarios()).toHaveLength(1);
  });

  it('editar sincroniza el nombre y el correo de la cuenta', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    data.actualizarCliente(c.id, { ...cliente, nombre: 'Taller Sur SRL', email: 'nuevo@tallersur.com', plan: 'Corporativo' });
    expect(data.clientes()[0]).toMatchObject({ nombre: 'Taller Sur SRL', plan: 'Corporativo' });
    expect(data.usuarios()[0]).toMatchObject({ nombre: 'Taller Sur SRL', email: 'nuevo@tallersur.com' });
  });

  it('eliminar un cliente borra en cascada su cuenta, productos, envíos y movimientos, y deja el resumen para avisar', () => {
    const data = TestBed.inject(DataService);
    const { cliente: libre } = data.agregarCliente(cliente);
    expect(data.eliminarCliente(libre.id)).toBe(true);
    expect(data.usuarios()).toHaveLength(0);

    const { cliente: otro } = data.agregarCliente({ ...cliente, email: 'otro@x.com', numeroDocumento: '25678902', cuit: '20-25678902-8' });
    const { cliente: ajeno } = data.agregarCliente({ ...cliente, email: 'ajeno@x.com', numeroDocumento: '25678903', cuit: '20-25678903-8' });
    const vacio = { descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };
    const p = data.agregarProducto(otro.id, { ...vacio, nombre: 'Taza', stock: 10 });
    const pAjeno = data.agregarProducto(ajeno.id, { ...vacio, nombre: 'Taza', stock: 4 });
    const destino = { destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Palermo' };
    data.crearEnvio({ ...destino, items: [{ productoId: p.id, cantidad: 2 }] }, otro.id);
    data.crearEnvio({ ...destino, items: [{ productoId: p.id, cantidad: 1 }], borrador: true }, otro.id);
    data.crearEnvio({ ...destino, items: [{ productoId: pAjeno.id, cantidad: 1 }] }, ajeno.id);

    expect(data.resumenCliente(otro.id)).toEqual({ productos: 1, envios: 2, borradores: 1, enCurso: 1, enCustodia: 0, movimientos: 2 });
    expect(data.eliminarCliente(otro.id)).toBe(true);
    expect(data.clientes().some((c) => c.id === otro.id)).toBe(false);
    expect(data.productos().map((x) => x.id)).toEqual([pAjeno.id]);
    expect(data.envios().every((e) => e.clienteId === ajeno.id)).toBe(true);
    expect(data.movimientos().every((m) => m.clienteId === ajeno.id)).toBe(true);
    expect(data.usuarios().every((u) => u.clienteId !== otro.id)).toBe(true);
  });
});

describe('Gestión de mensajeros', () => {
  beforeEach(preparar);

  it('al crear un mensajero se crea su cuenta pendiente con rol mensajero', () => {
    const data = TestBed.inject(DataService);
    const { mensajero, usuario } = data.agregarMensajero(mensajeroInput);
    expect(usuario).toMatchObject({ rol: 'mensajero', estado: 'PENDIENTE', mensajeroId: mensajero.id, claveHash: null });
    expect(mensajero.telefonoEmergencia).toBe('+54 9 11 5555 3001');
  });

  it('editar sincroniza la cuenta', () => {
    const data = TestBed.inject(DataService);
    const { mensajero } = data.agregarMensajero(mensajeroInput);
    data.actualizarMensajero(mensajero.id, { ...mensajeroInput, nombre: 'Santiago P.', email: 'nuevo@flexya.com', telefonoEmergencia: '', zonaId: 'gba-sur' });
    expect(data.mensajeros()[0]).toMatchObject({ nombre: 'Santiago P.', zonaId: 'gba-sur', telefonoEmergencia: '' });
    expect(data.usuarios()[0]).toMatchObject({ nombre: 'Santiago P.', email: 'nuevo@flexya.com' });
  });

  it('no elimina ni suspende a un mensajero con envíos en reparto; al eliminarlo borra su cuenta', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const { mensajero, usuario } = data.agregarMensajero(mensajeroInput);
    const envio = data.crearEnvio({ destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Palermo' }, c.id);
    data.recepcionar(envio.id);
    data.asignar(envio.id, mensajero.id);
    expect(data.motivoMensajeroNoEliminable(mensajero.id)).toContain('curso');
    expect(data.motivoNoSuspender(usuario.id)).toContain('curso');
    expect(data.eliminarMensajero(mensajero.id)).toBe(false);

    data.entregar(envio.id);
    expect(data.motivoNoSuspender(usuario.id)).toBeNull();
    expect(data.motivoMensajeroNoEliminable(mensajero.id)).toContain('pagos pendientes');
    expect(data.eliminarMensajero(mensajero.id)).toBe(false);
    const hoy = new Date().toISOString().slice(0, 10);
    const liquidacion = data.generarLiquidacion(mensajero.id, '2000-01-01', hoy.replace(/^\d{4}/, '2999'))!;
    data.pagarLiquidacion(liquidacion.id, 'Transferencia 1');
    expect(data.eliminarMensajero(mensajero.id)).toBe(true);
    expect(data.mensajeros()).toHaveLength(0);
    expect(data.usuarios().some((u) => u.mensajeroId === mensajero.id)).toBe(false);
    expect(data.envios()[0].estado).toBe('Entregado');
  });
});

describe('Cuentas y tokens', () => {
  beforeEach(preparar);

  it('cambiar el estado de la cuenta invalida las sesiones abiertas', () => {
    const data = TestBed.inject(DataService);
    const { usuario } = data.agregarCliente(cliente);
    data.cambiarEstadoCuenta(usuario.id, 'SUSPENDIDO');
    expect(data.usuarios()[0]).toMatchObject({ estado: 'SUSPENDIDO', versionSesion: usuario.versionSesion + 1 });
  });

  it('invalidar tokens marca como usados los pendientes del mismo tipo', () => {
    const data = TestBed.inject(DataService);
    const { usuario } = data.agregarCliente(cliente);
    const nuevo = (id: string, tipo: 'ACTIVACION' | 'RECUPERACION') =>
      data.guardarToken({ id, usuarioId: usuario.id, tipo, tokenHash: id, expiraEn: new Date(Date.now() + 1000).toISOString(), usadoEn: null });
    nuevo('a', 'ACTIVACION');
    nuevo('b', 'RECUPERACION');
    data.invalidarTokens(usuario.id, 'ACTIVACION');
    expect(data.tokens().find((t) => t.id === 'a')?.usadoEn).toBeTruthy();
    expect(data.tokens().find((t) => t.id === 'b')?.usadoEn).toBeNull();
  });

  it('borrar todos los datos conserva solo al superadmin', () => {
    const data = TestBed.inject(DataService);
    data.crearSuperadmin('Marina Ríos', 'admin@flexya.com', 'hash', 'sal');
    data.agregarCliente(cliente);
    data.agregarMensajero(mensajeroInput);
    data.reset();
    expect(data.clientes()).toHaveLength(0);
    expect(data.mensajeros()).toHaveLength(0);
    expect(data.tokens()).toHaveLength(0);
    expect(data.usuarios().map((u) => u.rol)).toEqual(['admin']);
  });
});

describe('Productos', () => {
  beforeEach(preparar);
  const producto = { nombre: 'Remera', descripcion: 'Talle M', precio: 15990.5, peso: 0.4, alto: 3, ancho: 30, largo: 40 };

  it('cada cliente ve y gestiona solo los suyos; el superadmin los ve todos y el mensajero ninguno', () => {
    const data = TestBed.inject(DataService);
    const admin = data.crearSuperadmin('Marina Ríos', 'admin@flexya.com', 'hash', 'sal');
    const uno = data.agregarCliente(cliente);
    const dos = data.agregarCliente({ ...cliente, email: 'otro@x.com', numeroDocumento: '25678902', cuit: '20-25678902-8' });
    const mio = data.agregarProducto(uno.cliente.id, producto);
    data.agregarProducto(dos.cliente.id, { ...producto, nombre: 'Taza' });
    const mensajero = data.agregarMensajero(mensajeroInput).usuario;

    expect(data.productosDe(uno.usuario).map((p) => p.nombre)).toEqual(['Remera']);
    expect(data.productosDe(dos.usuario).map((p) => p.nombre)).toEqual(['Taza']);
    expect(data.productosDe(admin)).toHaveLength(2);
    expect(data.productosDe(mensajero)).toEqual([]);
    expect(data.productosDe(null)).toEqual([]);

    expect(mio).toMatchObject({ clienteId: uno.cliente.id, precio: 15990.5, peso: 0.4, alto: 3, ancho: 30, largo: 40 });
    expect(mio.id).toMatch(/^p\d+$/);
  });

  it('un producto puede guardarse solo con el nombre', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const p = data.agregarProducto(c.id, { nombre: 'Taza', descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null });
    expect(p).toMatchObject({ nombre: 'Taza', precio: null, peso: null, alto: null });
    expect(JSON.parse(localStorage.getItem(KEY)!).db.productos[0].precio).toBeNull();
  });

  it('editar y eliminar exigen ser el dueño del producto', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const p = data.agregarProducto(c.id, producto);

    expect(data.actualizarProducto(p.id, 'c-ajeno', { ...producto, nombre: 'Hackeado' })).toBe(false);
    expect(data.eliminarProducto(p.id, 'c-ajeno')).toBe(false);
    expect(data.productos()[0].nombre).toBe('Remera');

    expect(data.actualizarProducto(p.id, c.id, { ...producto, nombre: 'Remera nueva', precio: 20000 })).toBe(true);
    expect(data.productos()[0]).toMatchObject({ nombre: 'Remera nueva', precio: 20000, id: p.id, clienteId: c.id });
    expect(data.eliminarProducto(p.id, c.id)).toBe(true);
    expect(data.productos()).toHaveLength(0);
  });

  it('los productos se guardan, y se borran al eliminar al cliente o al borrar todos los datos', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    data.agregarProducto(c.id, producto);
    expect(JSON.parse(localStorage.getItem(KEY)!).db.productos).toHaveLength(1);

    expect(data.eliminarCliente(c.id)).toBe(true);
    expect(data.productos()).toHaveLength(0);

    const otro = data.agregarCliente({ ...cliente, email: 'otro@x.com' });
    data.agregarProducto(otro.cliente.id, producto);
    data.reset();
    expect(data.productos()).toHaveLength(0);
  });
});

describe('Envíos con productos', () => {
  beforeEach(preparar);
  const entrega = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };
  const vacio = { stock: 100, descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };

  function escenario() {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const taza = data.agregarProducto(c.id, { ...vacio, nombre: 'Taza', precio: 1500, peso: 0.3, alto: 10, ancho: 8, largo: 8 });
    const remera = data.agregarProducto(c.id, { ...vacio, nombre: 'Remera' });
    return { data, c, taza, remera };
  }

  it('guarda cada producto con su cantidad y una copia de sus datos', () => {
    const { data, c, taza, remera } = escenario();
    const envio = data.crearEnvio({ ...entrega, retiro: 'deposito', items: [{ productoId: taza.id, cantidad: 24 }, { productoId: remera.id, cantidad: 2 }] }, c.id);
    expect(envio.items).toEqual([
      { productoId: taza.id, nombre: 'Taza', cantidad: 24, precio: 1500, peso: 0.3, alto: 10, ancho: 8, largo: 8 },
      { productoId: remera.id, nombre: 'Remera', cantidad: 2, precio: null, peso: null, alto: null, ancho: null, largo: null },
    ]);
    expect(resumenItems(envio.items)).toEqual({ unidades: 26, peso: 7.2, completo: false });
    expect(data.actividades()[0].detalle).toContain('26 unidades');
  });

  it('suma los productos repetidos y descarta los inexistentes, ajenos o con cantidad inválida', () => {
    const { data, c, taza } = escenario();
    const ajeno = data.agregarProducto('c-otro', { ...vacio, nombre: 'Ajeno' });
    const envio = data.crearEnvio(
      {
        ...entrega,
        items: [
          { productoId: taza.id, cantidad: 2 }, { productoId: taza.id, cantidad: 3 }, { productoId: ajeno.id, cantidad: 9 },
          { productoId: 'p-inexistente', cantidad: 1 }, { productoId: taza.id, cantidad: 0 }, { productoId: taza.id, cantidad: Number.NaN },
        ],
      },
      c.id,
    );
    expect(envio.items.map((i) => [i.productoId, i.cantidad])).toEqual([[taza.id, 5]]);
  });

  it('el retiro en domicilio guarda la dirección del cliente y el retiro en depósito no; por defecto es en depósito', () => {
    const { data, c } = escenario();
    expect(data.crearEnvio({ ...entrega, retiro: 'domicilio' }, c.id)).toMatchObject({ retiro: 'domicilio', origen: 'Av. Mitre 100, Avellaneda' });
    expect(data.crearEnvio({ ...entrega, retiro: 'deposito' }, c.id)).toMatchObject({ retiro: 'deposito', origen: '' });
    expect(data.crearEnvio(entrega, c.id)).toMatchObject({ retiro: 'deposito', items: [] });
  });

  it('el envío conserva los datos del producto aunque después se edite o se elimine', () => {
    const { data, c, taza } = escenario();
    const envio = data.crearEnvio({ ...entrega, items: [{ productoId: taza.id, cantidad: 1 }] }, c.id);
    data.actualizarProducto(taza.id, c.id, { ...vacio, nombre: 'Taza renombrada', precio: 9999 });
    data.eliminarProducto(taza.id, c.id);
    expect(data.envios().find((e) => e.id === envio.id)?.items[0]).toMatchObject({ nombre: 'Taza', precio: 1500 });
  });

  it('resumenItems de una lista vacía no inventa peso', () => {
    expect(resumenItems([])).toEqual({ unidades: 0, peso: null, completo: true });
  });
});

describe('Edición y cancelación de envíos', () => {
  beforeEach(preparar);
  const entrega = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };
  const vacio = { stock: 100, descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };

  function escenario() {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const taza = data.agregarProducto(c.id, { ...vacio, nombre: 'Taza', peso: 0.3 });
    const remera = data.agregarProducto(c.id, { ...vacio, nombre: 'Remera' });
    const envio = data.crearEnvio({ ...entrega, retiro: 'deposito', items: [{ productoId: taza.id, cantidad: 2 }] }, c.id);
    return { data, c, taza, remera, envio };
  }

  it('edita un envío pendiente: recalcula zona, tarifa, productos y retiro, y conserva número, estado y fecha', () => {
    const { data, c, remera, envio } = escenario();
    const ok = data.actualizarEnvio(
      envio.id, c.id,
      { destinatario: 'Bruno Díaz', telefono: '+54 9 11 6666 7777', direccion: 'Mitre 500', localidad: 'Avellaneda', retiro: 'domicilio', items: [{ productoId: remera.id, cantidad: 5 }] },
    );
    expect(ok).toBe(true);
    const editado = data.envios()[0];
    expect(editado).toMatchObject({
      id: envio.id, estado: 'Pendiente', creadoEn: envio.creadoEn, clienteId: c.id,
      destinatario: 'Bruno Díaz', direccion: 'Mitre 500', localidad: 'Avellaneda', zonaId: 'gba-sur', importe: 3200,
      retiro: 'domicilio', origen: 'Av. Mitre 100, Avellaneda',
    });
    expect(editado.items.map((i) => [i.nombre, i.cantidad])).toEqual([['Remera', 5]]);
    expect(data.actividades()[0].titulo).toBe(`Envío ${envio.id} editado`);
  });

  it('solo el dueño puede editar o cancelar su envío', () => {
    const { data, envio } = escenario();
    expect(data.actualizarEnvio(envio.id, 'c-ajeno', { ...entrega, destinatario: 'Hackeado' })).toBe(false);
    expect(data.cancelarEnvio(envio.id, 'c-ajeno')).toBe(false);
    expect(data.envios()[0]).toMatchObject({ destinatario: 'Ana Gómez', estado: 'Pendiente' });
  });

  it('un envío que ya llegó a Flexya no se edita ni se cancela', () => {
    const { data, c, envio } = escenario();
    data.recepcionar(envio.id);
    expect(data.actualizarEnvio(envio.id, c.id, { ...entrega, destinatario: 'Otro' })).toBe(false);
    expect(data.cancelarEnvio(envio.id, c.id)).toBe(false);
    expect(data.envios()[0]).toMatchObject({ estado: 'En depósito', destinatario: 'Ana Gómez' });
  });

  it('cancelar lo deja cancelado, registra la actividad y ya no se puede cancelar de nuevo', () => {
    const { data, c, envio } = escenario();
    expect(data.cancelarEnvio(envio.id, c.id)).toBe(true);
    expect(data.envios()[0]).toMatchObject({ estado: 'Cancelado', eta: 'Cancelado' });
    expect(data.actividades()[0]).toMatchObject({ titulo: `Envío ${envio.id} cancelado` });
    expect(data.actividades()[0].detalle).toContain('Cancelado por el cliente');
    expect(data.cancelarEnvio(envio.id, c.id)).toBe(false);
    expect(data.actualizarEnvio(envio.id, c.id, entrega)).toBe(false);
  });

  it('la tarifa y los datos de un envío nuevo salen del mismo cálculo que al editar', () => {
    const { data, c } = escenario();
    const nuevo = data.crearEnvio({ ...entrega, localidad: 'Avellaneda', retiro: 'domicilio' }, c.id);
    expect(nuevo).toMatchObject({ zonaId: 'gba-sur', importe: 3200, origen: 'Av. Mitre 100, Avellaneda' });
  });
});

describe('Flujo de envíos y depósito', () => {
  beforeEach(preparar);

  it('cliente crea → admin recepciona y asigna → mensajero entrega, y persiste', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const { mensajero } = data.agregarMensajero(mensajeroInput);

    const envio = data.crearEnvio({ destinatario: 'Ana Test', telefono: '1155550000', direccion: 'Calle 123', localidad: 'Belgrano' }, c.id);
    expect(envio).toMatchObject({ estado: 'Pendiente', zonaId: 'caba-norte', importe: 2200 });

    data.recepcionar(envio.id);
    data.asignar(envio.id, mensajero.id);
    expect(data.envios()[0]).toMatchObject({ estado: 'En reparto', mensajeroId: mensajero.id });

    data.entregar(envio.id);
    expect(data.envios()[0].estado).toBe('Entregado');
    expect(JSON.parse(localStorage.getItem(KEY)!).db.envios[0].id).toBe(envio.id);
  });

  it('al entregar queda registrado quién recibió y cuándo; la incidencia guarda su motivo', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const { mensajero } = data.agregarMensajero(mensajeroInput);
    const crear = () => {
      const e = data.crearEnvio({ destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Belgrano' }, c.id);
      data.recepcionar(e.id);
      data.asignar(e.id, mensajero.id);
      return e;
    };
    const entregado = crear();
    const fallido = crear();

    data.entregar(entregado.id, 'Portería');
    data.reportarIncidencia(fallido.id, 'Nadie atendió');

    const por = (id: string) => data.envios().find((e) => e.id === id);
    expect(por(entregado.id)).toMatchObject({ estado: 'Entregado', recibidoPor: 'Portería' });
    expect(por(entregado.id)?.entregadoEn).toBeTruthy();
    expect(por(fallido.id)).toMatchObject({ estado: 'Incidencia', nota: 'Otro motivo: Nadie atendió', intentos: 1 });
    expect(data.actividades()[0].detalle).toContain('Nadie atendió');
    expect(data.actividades().some((a) => a.detalle.includes('Recibió: Portería'))).toBe(true);
  });

  it('aprobar un retiro descuenta unidades del lote', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    data.ingresarLote({ clienteId: c.id, categoria: 'Hogar', unidades: 20, ubicacion: 'A-01' });
    const lote = data.lotes()[0];
    data.solicitarRetiro({ loteId: lote.id, unidades: 5, ventana: 'Mañana', notas: '' }, c.id);
    data.aprobarRetiro(data.retiros()[0].id);
    expect(data.lotes()[0].unidades).toBe(15);
  });

  describe('stock de productos', () => {
    const base = { descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };
    const nuevoEnvio = (items: { productoId: string; cantidad: number }[], retiro: 'domicilio' | 'deposito' = 'deposito') => ({
      destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Calle 123', localidad: 'Belgrano', retiro, items,
    });
    const stockDe = (data: DataService, id: string) => data.productos().find((p) => p.id === id)!.stock;

    it('un producto nuevo registra su stock inicial como primer movimiento', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 20 });
      expect(p.stock).toBe(20);
      expect(data.movimientosDe(p.id)).toEqual([expect.objectContaining({ tipo: 'INICIAL', cantidad: 20, saldo: 20 })]);
      const sin = data.agregarProducto('c1', { ...base, nombre: 'Remera' });
      expect(sin.stock).toBe(0);
      expect(data.movimientosDe(sin.id)).toEqual([]);
    });

    it('crear un envío descuenta el stock y deja el movimiento con el tipo de retiro', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const directo = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 3 }], 'domicilio'), 'c1');
      data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 2 }], 'deposito'), 'c1');
      expect(stockDe(data, p.id)).toBe(5);
      const [ultimo, primero] = data.movimientosDe(p.id);
      expect(ultimo).toMatchObject({ tipo: 'ENVIO', cantidad: -2, saldo: 5, retiro: 'deposito' });
      expect(primero).toMatchObject({ tipo: 'ENVIO', cantidad: -3, saldo: 7, retiro: 'domicilio', envioId: directo.id });
    });

    it('no deja crear un envío que supere el stock y no toca nada', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 2 });
      expect(() => data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 3 }]), 'c1')).toThrow(/hay 2 en stock/);
      expect(data.envios()).toHaveLength(0);
      expect(stockDe(data, p.id)).toBe(2);
    });

    it('un producto agotado no se puede enviar', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 1 });
      data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 1 }]), 'c1');
      expect(stockDe(data, p.id)).toBe(0);
      expect(() => data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 1 }]), 'c1')).toThrow(StockInsuficienteError);
    });

    it('editar un envío solo mueve la diferencia, y puede usar lo que ya tenía reservado', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const q = data.agregarProducto('c1', { ...base, nombre: 'Remera', stock: 4 });
      const envio = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 6 }]), 'c1');
      expect(stockDe(data, p.id)).toBe(4);

      expect(data.actualizarEnvio(envio.id, 'c1', nuevoEnvio([{ productoId: p.id, cantidad: 10 }, { productoId: q.id, cantidad: 1 }]))).toBe(true);
      expect(stockDe(data, p.id)).toBe(0);
      expect(stockDe(data, q.id)).toBe(3);

      expect(data.actualizarEnvio(envio.id, 'c1', nuevoEnvio([{ productoId: q.id, cantidad: 4 }]))).toBe(true);
      expect(stockDe(data, p.id)).toBe(10);
      expect(stockDe(data, q.id)).toBe(0);
      expect(() => data.actualizarEnvio(envio.id, 'c1', nuevoEnvio([{ productoId: q.id, cantidad: 5 }]))).toThrow(StockInsuficienteError);
      expect(stockDe(data, q.id)).toBe(0);
      expect(data.movimientosDe(p.id)[0]).toMatchObject({ tipo: 'EDICION', cantidad: 10 });
    });

    it('cancelar devuelve todo el stock; la incidencia no lo devuelve', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const envio = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 4 }]), 'c1');
      expect(data.cancelarEnvio(envio.id, 'c1')).toBe(true);
      expect(stockDe(data, p.id)).toBe(10);
      expect(data.movimientosDe(p.id)[0]).toMatchObject({ tipo: 'CANCELACION', cantidad: 4, saldo: 10 });

      const otro = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 4 }]), 'c1');
      data.reportarIncidencia(otro.id, 'No estaba');
      expect(stockDe(data, p.id)).toBe(6);
    });

    it('un producto con stock que está en envíos en curso no se elimina; con stock 0 sí', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const envio = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 4 }]), 'c1');
      expect(data.motivoProductoNoEliminable(p.id)).toContain('Dejá el stock en 0');
      expect(data.eliminarProducto(p.id, 'c1')).toBe(false);

      data.actualizarProducto(p.id, 'c1', { ...base, nombre: 'Taza', stock: 0 });
      expect(data.motivoProductoNoEliminable(p.id)).toBeNull();
      expect(data.eliminarProducto(p.id, 'c1')).toBe(true);
      expect(data.movimientosDe(p.id)).toEqual([]);
      expect(data.envios().find((e) => e.id === envio.id)!.items[0].nombre).toBe('Taza');
    });

    it('un producto con stock que ya no está en ningún envío en curso se puede eliminar', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const envio = data.crearEnvio(nuevoEnvio([{ productoId: p.id, cantidad: 2 }]), 'c1');
      data.cancelarEnvio(envio.id, 'c1');
      expect(data.eliminarProducto(p.id, 'c1')).toBe(true);
    });

    it('cancelar devuelve el stock completo aunque el envío tuviera varios productos', () => {
      const data = TestBed.inject(DataService);
      const a = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      const b = data.agregarProducto('c1', { ...base, nombre: 'Remera', stock: 5 });
      const envio = data.crearEnvio(nuevoEnvio([{ productoId: a.id, cantidad: 3 }, { productoId: b.id, cantidad: 5 }]), 'c1');
      expect([stockDe(data, a.id), stockDe(data, b.id)]).toEqual([7, 0]);
      data.cancelarEnvio(envio.id, 'c1');
      expect([stockDe(data, a.id), stockDe(data, b.id)]).toEqual([10, 5]);
    });

    it('ajustar el stock a mano deja un movimiento con la diferencia', () => {
      const data = TestBed.inject(DataService);
      const p = data.agregarProducto('c1', { ...base, nombre: 'Taza', stock: 10 });
      data.actualizarProducto(p.id, 'c1', { ...base, nombre: 'Taza', stock: 25 });
      expect(stockDe(data, p.id)).toBe(25);
      expect(data.movimientosDe(p.id)[0]).toMatchObject({ tipo: 'AJUSTE', cantidad: 15, saldo: 25 });
      data.actualizarProducto(p.id, 'c1', { ...base, nombre: 'Taza grande', stock: 25 });
      expect(data.movimientosDe(p.id)).toHaveLength(2);
    });
  });
});
