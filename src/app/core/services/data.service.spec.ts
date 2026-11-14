import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput } from '../models';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

const KEY = 'flexya-demo-v8';

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

const cliente0 = () => ({ ...cliente });

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

  it('arranca vacío, solo con el superadmin', () => {
    const data = TestBed.inject(DataService);
    expect(data.usuarios().map((u) => u.rol)).toEqual(['admin']);
    expect([data.clientes(), data.mensajeros(), data.envios(), data.lotes(), data.retiros(), data.actividades()].every((l) => l.length === 0)).toBe(true);
  });

  it('login valida credenciales', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.login('admin@flexya.com', 'mal')).toBeNull();
    expect(auth.login('admin@flexya.com', '123456')?.rol).toBe('admin');
  });
});

describe('Gestión de clientes', () => {
  beforeEach(preparar);

  it('al crear un cliente se genera su acceso y puede ingresar', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c, clave } = data.agregarCliente(cliente);
    expect(clave).toHaveLength(8);
    const usuario = data.usuarios().find((u) => u.clienteId === c.id);
    expect(usuario).toMatchObject({ rol: 'cliente', email: 'hola@tallersur.com' });
    expect(TestBed.inject(AuthService).login('hola@tallersur.com', clave)?.clienteId).toBe(c.id);
  });

  it('editar sincroniza nombre y correo del usuario; regenerar cambia la clave', () => {
    const data = TestBed.inject(DataService);
    const { cliente: c, clave } = data.agregarCliente(cliente);
    data.actualizarCliente(c.id, { ...cliente, nombre: 'Taller Sur SRL', email: 'nuevo@tallersur.com', plan: 'Corporativo' });
    expect(data.clientes()[0]).toMatchObject({ nombre: 'Taller Sur SRL', plan: 'Corporativo' });
    expect(data.usuarios().find((u) => u.clienteId === c.id)).toMatchObject({ nombre: 'Taller Sur SRL', email: 'nuevo@tallersur.com' });

    const nueva = data.regenerarClave(c.id);
    expect(nueva?.email).toBe('nuevo@tallersur.com');
    expect(nueva?.clave).not.toBe(clave);
  });

  it('elimina el cliente y su usuario, salvo que tenga envíos activos o stock', () => {
    const data = TestBed.inject(DataService);
    const { cliente: libre } = data.agregarCliente(cliente);
    expect(data.eliminarCliente(libre.id)).toBe(true);
    expect(data.usuarios().some((u) => u.clienteId === libre.id)).toBe(false);

    const { cliente: activo } = data.agregarCliente({ ...cliente, email: 'otro@x.com', numeroDocumento: '25678902', cuit: '20-25678902-8' });
    data.crearEnvio({ destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Palermo' }, activo.id);
    expect(data.motivoNoEliminable(activo.id)).toContain('envío');
    expect(data.eliminarCliente(activo.id)).toBe(false);
    expect(data.clientes().some((c) => c.id === activo.id)).toBe(true);
  });
});

describe('Gestión de mensajeros', () => {
  beforeEach(preparar);

  it('al crear un mensajero se genera su acceso con rol mensajero', () => {
    const data = TestBed.inject(DataService);
    const { mensajero, clave } = data.agregarMensajero(mensajeroInput);
    expect(data.usuarios().find((u) => u.mensajeroId === mensajero.id)).toMatchObject({ rol: 'mensajero', email: 'santiago@flexya.com' });
    expect(TestBed.inject(AuthService).login('santiago@flexya.com', clave)?.mensajeroId).toBe(mensajero.id);
    expect(mensajero.telefonoEmergencia).toBe('+54 9 11 5555 3001');
  });

  it('editar sincroniza el usuario y regenerar cambia la clave', () => {
    const data = TestBed.inject(DataService);
    const { mensajero, clave } = data.agregarMensajero(mensajeroInput);
    data.actualizarMensajero(mensajero.id, { ...mensajeroInput, nombre: 'Santiago P.', email: 'nuevo@flexya.com', telefonoEmergencia: '', zonaId: 'gba-sur' });
    expect(data.mensajeros()[0]).toMatchObject({ nombre: 'Santiago P.', zonaId: 'gba-sur', telefonoEmergencia: '' });
    expect(data.usuarios().find((u) => u.mensajeroId === mensajero.id)).toMatchObject({ nombre: 'Santiago P.', email: 'nuevo@flexya.com' });
    const nueva = data.regenerarClaveMensajero(mensajero.id);
    expect(nueva?.email).toBe('nuevo@flexya.com');
    expect(nueva?.clave).not.toBe(clave);
  });

  it('no elimina a un mensajero con envíos en reparto, y al eliminarlo borra su usuario', () => {
    const data = TestBed.inject(DataService);
    const { cliente } = data.agregarCliente(cliente0());
    const { mensajero } = data.agregarMensajero(mensajeroInput);
    const envio = data.crearEnvio({ destinatario: 'Ana', telefono: '1155550000', direccion: 'Calle 1', localidad: 'Palermo' }, cliente.id);
    data.recepcionar(envio.id);
    data.asignar(envio.id, mensajero.id);
    expect(data.motivoMensajeroNoEliminable(mensajero.id)).toContain('reparto');
    expect(data.eliminarMensajero(mensajero.id)).toBe(false);

    data.entregar(envio.id);
    expect(data.eliminarMensajero(mensajero.id)).toBe(true);
    expect(data.mensajeros()).toHaveLength(0);
    expect(data.usuarios().some((u) => u.mensajeroId === mensajero.id)).toBe(false);
    expect(data.envios()[0].estado).toBe('Entregado');
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
    expect(JSON.parse(localStorage.getItem(KEY)!).envios[0].id).toBe(envio.id);
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
    expect(por(fallido.id)).toMatchObject({ estado: 'Incidencia', nota: 'Nadie atendió' });
    expect(data.actividades()[0].detalle).toContain('Motivo: Nadie atendió');
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

  it('reset deja solo el superadmin', () => {
    const data = TestBed.inject(DataService);
    data.agregarCliente(cliente);
    data.reset();
    expect(data.clientes()).toHaveLength(0);
    expect(data.usuarios()).toHaveLength(1);
  });
});
