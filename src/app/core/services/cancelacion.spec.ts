import { TestBed } from '@angular/core/testing';
import { ClienteInput, Envio, EstadoEnvio, MensajeroInput } from '../models';
import { enCursoMensajero } from '../models';
import { DataService } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('El cliente cancela mientras el paquete no salió de su casa', () => {
  let data: DataService;
  let clienteId: string;
  let mensajeroId: string;
  let productoId: string;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    mensajeroId = data.agregarMensajero(mensajero).mensajero.id;
    productoId = data.agregarProducto(clienteId, { nombre: 'Taza', descripcion: '', precio: 4200, peso: 0.4, alto: 10, ancho: 9, largo: 9, stock: 10 }).id;
  });

  const stock = () => data.productos().find((p) => p.id === productoId)!.stock;
  const directo = () => data.crearEnvio({ ...destino, retiro: 'domicilio', items: [{ productoId, cantidad: 3 }] }, clienteId);
  const estado = (e: Envio) => data.envios().find((x) => x.id === e.id)!;

  it('se puede cancelar pendiente, con mensajero asignado, con el retiro fallido o en revisión, y no después', () => {
    const permitido = (e: Partial<Envio>) => data.cancelableCliente({ estado: 'Pendiente', ...e } as Envio);
    for (const e of ['Pendiente', 'Retiro asignado', 'Retiro fallido', 'En revisión'] as EstadoEnvio[]) expect(permitido({ estado: e })).toBe(true);
    for (const e of ['Borrador', 'Retirado', 'En depósito', 'En reparto', 'Incidencia', 'En devolución', 'Devuelto', 'Entregado', 'Cancelado'] as EstadoEnvio[]) {
      expect(permitido({ estado: e })).toBe(false);
    }
  });

  it('con un mensajero asignado: queda cancelado, el mensajero pierde el retiro y las unidades vuelven al stock', () => {
    const e = directo();
    expect(stock()).toBe(7);
    data.asignar(e.id, mensajeroId);
    expect(estado(e).estado).toBe('Retiro asignado');

    expect(data.cancelarEnvio(e.id, clienteId)).toBe(true);
    const cancelado = estado(e);
    expect(cancelado).toMatchObject({ estado: 'Cancelado', mensajeroId: null });
    expect(stock()).toBe(10);
    expect(cancelado.historial.at(-1)!.detalle).toContain('Estaba asignado a Santiago Pereyra, que ya no tiene este retiro');
    expect(data.actividades()[0].detalle).toContain('Santiago Pereyra');
  });

  it('el mensajero ya no ve el retiro entre sus paradas y no puede retirarlo', () => {
    const e = directo();
    data.asignar(e.id, mensajeroId);
    data.cancelarEnvio(e.id, clienteId);
    expect(enCursoMensajero(estado(e))).toBe(false);
    expect(data.retirar(e.id, mensajeroId)).toBe(false);
    expect(estado(e).estado).toBe('Cancelado');
  });

  it('con el retiro fallido también se puede cancelar, y se conserva el motivo del fallo', () => {
    const e = directo();
    data.asignar(e.id, mensajeroId);
    data.retiroFallido(e.id, mensajeroId, 'No había nadie');
    expect(estado(e).estado).toBe('Retiro fallido');
    expect(data.cancelarEnvio(e.id, clienteId)).toBe(true);
    expect(estado(e).nota).toContain('Antes: No había nadie');
    expect(stock()).toBe(10);
  });

  it('una vez retirado ya no se cancela: pasa a ser una devolución que decide Flexya', () => {
    const e = directo();
    data.asignar(e.id, mensajeroId);
    data.retirar(e.id, mensajeroId);
    expect(estado(e).estado).toBe('Retirado');
    expect(data.cancelarEnvio(e.id, clienteId)).toBe(false);
    expect(estado(e).estado).toBe('Retirado');
    expect(stock()).toBe(7);
  });

  it('no se cancela lo de otro cliente', () => {
    const e = directo();
    data.asignar(e.id, mensajeroId);
    expect(data.cancelarEnvio(e.id, 'c-ajeno')).toBe(false);
    expect(estado(e).estado).toBe('Retiro asignado');
  });

  it('cancelar un retiro completo incluye los que tienen mensajero y deja los ya retirados', () => {
    const [a, b, c] = data.crearRetiro(
      { retiro: 'domicilio', destinos: [1, 2, 3].map((n) => ({ ...destino, destinatario: `Dest ${n}`, items: [{ productoId, cantidad: 1 }] })) },
      clienteId,
    );
    expect(stock()).toBe(7);
    data.asignar(a.id, mensajeroId);
    expect(estado(a).estado).toBe('Retiro asignado');
    expect(estado(b).estado).toBe('Retiro asignado');
    expect(estado(c).estado).toBe('Retiro asignado');

    expect(data.cancelarRetiro(a.retiroId, clienteId)).toBe(3);
    expect([a, b, c].map((x) => estado(x).estado)).toEqual(['Cancelado', 'Cancelado', 'Cancelado']);
    expect(stock()).toBe(10);
  });

  it('si el retiro ya fue retirado, cancelarlo no toca nada', () => {
    const [a] = data.crearRetiro({ retiro: 'domicilio', destinos: [{ ...destino, items: [{ productoId, cantidad: 1 }] }] }, clienteId);
    data.asignar(a.id, mensajeroId);
    data.retirar(a.id, mensajeroId);
    expect(data.cancelarRetiro(a.retiroId, clienteId)).toBe(0);
    expect(estado(a).estado).toBe('Retirado');
  });
});
