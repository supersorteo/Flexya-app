import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput, NuevoPedidoRetiro } from '../models';
import { DataService, StockInsuficienteError } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajeroInput: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};
const base = { descripcion: '', precio: null, peso: null, alto: null, ancho: null, largo: null };

describe('Retiro con varios destinatarios', () => {
  let data: DataService;
  let clienteId: string;
  let m1: string;
  let producto: string;

  const pedido = (destinatario: string, cantidad: number, extra: Record<string, unknown> = {}) => ({
    destinatario, telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', retiro: 'domicilio' as const,
    fechaRetiro: '2030-01-15', programado: true, items: [{ productoId: producto, cantidad }], ...extra,
  });
  const estado = (id: string) => data.envios().find((e) => e.id === id)!.estado;
  const stock = () => data.productos().find((p) => p.id === producto)!.stock;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    m1 = data.agregarMensajero(mensajeroInput).mensajero.id;
    producto = data.agregarProducto(clienteId, { ...base, nombre: 'Taza', stock: 30 }).id;
  });

  it('cada destinatario es su propio envío y todos comparten el retiro', () => {
    const a = data.crearEnvio(pedido('Ana', 2), clienteId);
    const b = data.crearEnvio(pedido('Beto', 3, { retiroId: a.retiroId }), clienteId);
    const aparte = data.crearEnvio(pedido('Carla', 1), clienteId);
    expect(a.retiroId).toMatch(/^R-\d+$/);
    expect(b.retiroId).toBe(a.retiroId);
    expect(aparte.retiroId).not.toBe(a.retiroId);
    expect(data.tamanoRetiro(a)).toBe(2);
    expect(new Set([a.id, b.id, aparte.id]).size).toBe(3);
    expect(stock()).toBe(24);
  });

  it('un destinatario que se suma hereda el tipo de retiro y la fecha del retiro', () => {
    const a = data.crearEnvio(pedido('Ana', 1), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiroId: a.retiroId, retiro: 'deposito', fechaRetiro: '2031-05-05' }), clienteId);
    expect(b).toMatchObject({ retiro: 'domicilio', fechaRetiro: '2030-01-15' });
  });

  it('el stock se controla en acumulado entre los destinatarios del retiro', () => {
    const a = data.crearEnvio(pedido('Ana', 25), clienteId);
    expect(() => data.crearEnvio(pedido('Beto', 6, { retiroId: a.retiroId }), clienteId)).toThrow(StockInsuficienteError);
    expect(data.tamanoRetiro(a)).toBe(1);
  });

  it('no hay tope fijo de destinatarios por retiro', () => {
    const primero = data.crearEnvio(pedido('D1', 1), clienteId);
    for (let i = 2; i <= 25; i++) data.crearEnvio(pedido(`D${i}`, 1, { retiroId: primero.retiroId }), clienteId);
    expect(data.tamanoRetiro(primero)).toBe(25);
  });

  describe('crearRetiro', () => {
    const destino = (destinatario: string, cantidad: number, extra: Record<string, unknown> = {}) => ({
      destinatario, telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', items: [{ productoId: producto, cantidad }], ...extra,
    });
    const retiro = (destinos: NuevoPedidoRetiro['destinos'], extra: Partial<NuevoPedidoRetiro> = {}): NuevoPedidoRetiro => ({ retiro: 'domicilio', destinos, ...extra });

    it('crea un envío por destinatario, con sus productos, y todos comparten retiro, tipo y fecha', () => {
      const creados = data.crearRetiro(retiro([destino('Ana', 2), destino('Beto', 3), destino('Carla', 4)], { programado: true, fechaRetiro: '2099-02-02', franja: 'tarde' }), clienteId);
      expect(creados).toHaveLength(3);
      expect(new Set(creados.map((e) => e.retiroId)).size).toBe(1);
      expect(creados.map((e) => e.items[0].cantidad)).toEqual([2, 3, 4]);
      expect(creados.every((e) => e.fechaRetiro === '2099-02-02' && e.retiroProgramado && e.franja === 'tarde')).toBe(true);
      expect(data.tamanoRetiro(creados[0])).toBe(3);
      expect(stock()).toBe(21);
    });

    it('cada destinatario puede llevar varios productos distintos', () => {
      const otro = data.agregarProducto(clienteId, { ...base, nombre: 'Remera', stock: 10 }).id;
      const [e] = data.crearRetiro(retiro([{ ...destino('Ana', 2), items: [{ productoId: producto, cantidad: 2 }, { productoId: otro, cantidad: 1 }] }]), clienteId);
      expect(e.items.map((i) => [i.nombre, i.cantidad])).toEqual([['Taza', 2], ['Remera', 1]]);
    });

    it('valida el stock sumando a todos los destinatarios y no crea nada si no alcanza', () => {
      expect(() => data.crearRetiro(retiro([destino('Ana', 20), destino('Beto', 11)]), clienteId)).toThrow(StockInsuficienteError);
      expect(data.envios()).toHaveLength(0);
      expect(stock()).toBe(30);
      expect(data.crearRetiro(retiro([destino('Ana', 20), destino('Beto', 10)]), clienteId)).toHaveLength(2);
      expect(stock()).toBe(0);
    });

    it('como borrador no reserva stock ni se lo ve el superadmin, y al solicitar cada envío reserva el suyo', () => {
      const creados = data.crearRetiro(retiro([destino('Ana', 20), destino('Beto', 20)], { borrador: true }), clienteId);
      expect(creados.every((e) => e.estado === 'Borrador')).toBe(true);
      expect(stock()).toBe(30);
      expect(data.solicitarEnvio(creados[0].id, clienteId)).toBe(true);
      expect(stock()).toBe(10);
      expect(() => data.solicitarEnvio(creados[1].id, clienteId)).toThrow(StockInsuficienteError);
    });

    it('un pedido sin destinatarios no crea nada', () => {
      expect(data.crearRetiro(retiro([]), clienteId)).toEqual([]);
    });

    it('cancelar el retiro cancela los envíos que todavía se pueden cancelar y devuelve el stock', () => {
      const creados = data.crearRetiro(retiro([destino('Ana', 2), destino('Beto', 3), destino('Carla', 4)]), clienteId);
      data.asignar(creados[0].id, m1);
      data.retirar(creados[0].id, m1);
      expect(data.cancelarRetiro(creados[0].retiroId, clienteId)).toBe(0);

      const otros = data.crearRetiro(retiro([destino('Dani', 1), destino('Eva', 2)]), clienteId);
      data.cancelarEnvio(otros[0].id, clienteId);
      expect(data.cancelarRetiro(otros[0].retiroId, clienteId)).toBe(1);
      expect(data.envios().filter((e) => e.retiroId === otros[0].retiroId).map((e) => e.estado)).toEqual(['Cancelado', 'Cancelado']);
      expect(stock()).toBe(30 - 9);
    });
  });

  it('el superadmin asigna el retiro completo a un mensajero con una sola acción', () => {
    const a = data.crearEnvio(pedido('Ana', 1), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiroId: a.retiroId }), clienteId);
    const otro = data.crearEnvio(pedido('Carla', 1), clienteId);
    expect(data.asignar(a.id, m1)).toBe(true);
    expect([estado(a.id), estado(b.id), estado(otro.id)]).toEqual(['Retiro asignado', 'Retiro asignado', 'Pendiente']);
    expect(data.envios().find((e) => e.id === b.id)!.mensajeroId).toBe(m1);
  });

  it('el mensajero retira todo de una vez y sale a entregar todo de una vez', () => {
    const a = data.crearEnvio(pedido('Ana', 1), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiroId: a.retiroId }), clienteId);
    data.asignar(a.id, m1);
    expect(data.paquetesDelRetiro(data.envios().find((e) => e.id === a.id)!, 'Retiro asignado')).toHaveLength(2);
    expect(data.retirar(a.id, m1)).toBe(true);
    expect([estado(a.id), estado(b.id)]).toEqual(['Retirado', 'Retirado']);
    expect(data.salirAEntregar(b.id, m1)).toBe(true);
    expect([estado(a.id), estado(b.id)]).toEqual(['En reparto', 'En reparto']);
  });

  it('una diferencia pausa solo el envío que no coincide; el resto sigue su camino', () => {
    const a = data.crearEnvio(pedido('Ana', 1), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiroId: a.retiroId }), clienteId);
    data.asignar(a.id, m1);
    expect(data.diferenciaEnRetiro(b.id, m1, 'Falta una taza')).toBe(true);
    data.retirar(a.id, m1);
    expect([estado(a.id), estado(b.id)]).toEqual(['Retirado', 'En revisión']);
  });

  it('si no se puede retirar, falla todo el retiro con el mismo motivo', () => {
    const a = data.crearEnvio(pedido('Ana', 1), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiroId: a.retiroId }), clienteId);
    data.asignar(a.id, m1);
    data.retiroFallido(a.id, m1, 'No había nadie');
    expect([estado(a.id), estado(b.id)]).toEqual(['Retiro fallido', 'Retiro fallido']);
    expect(data.asignar(b.id, m1)).toBe(true);
    expect([estado(a.id), estado(b.id)]).toEqual(['Retiro asignado', 'Retiro asignado']);
  });

  it('cancelar un destinatario antes del retiro no afecta a los demás', () => {
    const a = data.crearEnvio(pedido('Ana', 2), clienteId);
    const b = data.crearEnvio(pedido('Beto', 3, { retiroId: a.retiroId }), clienteId);
    expect(data.cancelarEnvio(a.id, clienteId)).toBe(true);
    expect(stock()).toBe(27);
    data.asignar(b.id, m1);
    expect([estado(a.id), estado(b.id)]).toEqual(['Cancelado', 'Retiro asignado']);
  });

  it('un retiro vía depósito se recepciona completo, pero cada entrega se asigna por separado', () => {
    const a = data.crearEnvio(pedido('Ana', 1, { retiro: 'deposito' }), clienteId);
    const b = data.crearEnvio(pedido('Beto', 1, { retiro: 'deposito', retiroId: a.retiroId }), clienteId);
    expect(data.recepcionar(a.id)).toBe(true);
    expect([estado(a.id), estado(b.id)]).toEqual(['En depósito', 'En depósito']);
    expect(data.asignar(a.id, m1)).toBe(true);
    expect([estado(a.id), estado(b.id)]).toEqual(['En reparto', 'En depósito']);
  });
});
