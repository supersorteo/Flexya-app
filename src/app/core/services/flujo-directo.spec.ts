import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput } from '../models';
import { DataService } from './data.service';

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
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('Envío directo: del domicilio del cliente al destinatario', () => {
  let data: DataService;
  let clienteId: string;
  let m1: string;
  let m2: string;
  let producto: string;
  let envioId: string;

  const envio = () => data.envios().find((e) => e.id === envioId)!;
  const stock = () => data.productos().find((p) => p.id === producto)!.stock;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    m1 = data.agregarMensajero(mensajeroInput).mensajero.id;
    m2 = data.agregarMensajero({ ...mensajeroInput, numeroDocumento: '28456124', email: 'otro@flexya.com' }).mensajero.id;
    producto = data.agregarProducto(clienteId, { ...base, nombre: 'Taza', stock: 10 }).id;
    envioId = data.crearEnvio({ ...destino, retiro: 'domicilio', items: [{ productoId: producto, cantidad: 3 }] }, clienteId).id;
  });

  it('recorre Pendiente → Retiro asignado → Retirado → En reparto → Entregado', () => {
    expect(envio().estado).toBe('Pendiente');
    expect(data.asignar(envioId, m1)).toBe(true);
    expect(envio()).toMatchObject({ estado: 'Retiro asignado', mensajeroId: m1 });
    expect(data.retirar(envioId, m1, 'Caja sellada')).toBe(true);
    expect(envio().estado).toBe('Retirado');
    expect(data.salirAEntregar(envioId, m1)).toBe(true);
    expect(envio().estado).toBe('En reparto');
    data.entregar(envioId, 'Ana');
    expect(envio().estado).toBe('Entregado');
    expect(stock()).toBe(7);
  });

  it('cada paso solo lo puede hacer el mensajero asignado y en el orden correcto', () => {
    data.asignar(envioId, m1);
    expect(data.retirar(envioId, m2)).toBe(false);
    expect(data.salirAEntregar(envioId, m1)).toBe(false);
    data.retirar(envioId, m1);
    expect(data.retirar(envioId, m1)).toBe(false);
    expect(data.retiroFallido(envioId, m1, 'tarde')).toBe(false);
    expect(data.salirAEntregar(envioId, m2)).toBe(false);
  });

  it('retiro fallido: pide motivo, libera al mensajero y se puede reprogramar con otro', () => {
    data.asignar(envioId, m1);
    expect(data.retiroFallido(envioId, m1, '  ')).toBe(false);
    expect(data.retiroFallido(envioId, m1, 'No había nadie')).toBe(true);
    expect(envio()).toMatchObject({ estado: 'Retiro fallido', nota: 'No había nadie', mensajeroId: null });
    expect(data.puedeAsignarse(envio())).toBe(true);
    expect(data.asignar(envioId, m2)).toBe(true);
    expect(envio()).toMatchObject({ estado: 'Retiro asignado', mensajeroId: m2, nota: '' });
    expect(stock()).toBe(7);
  });

  it('diferencia en el retiro: pausa el envío, el cliente lo corrige y el superadmin lo vuelve a asignar', () => {
    data.asignar(envioId, m1);
    expect(data.diferenciaEnRetiro(envioId, m1, 'Hay 2 tazas')).toBe(true);
    expect(envio()).toMatchObject({ estado: 'En revisión', nota: 'Hay 2 tazas', mensajeroId: null });
    expect(data.actualizarEnvio(envioId, clienteId, { ...destino, retiro: 'domicilio', items: [{ productoId: producto, cantidad: 2 }] })).toBe(true);
    expect(stock()).toBe(8);
    expect(data.reanudar(envioId)).toBe(true);
    expect(envio()).toMatchObject({ estado: 'Pendiente', nota: '', mensajeroId: null });
    expect(data.asignar(envioId, m1)).toBe(true);
  });

  it('el superadmin puede cancelar antes del retiro, pero no con el paquete en manos del mensajero', () => {
    data.asignar(envioId, m1);
    expect(data.puedeCancelarAdmin(envio())).toBe(true);
    data.retirar(envioId, m1);
    expect(data.puedeCancelarAdmin(envio())).toBe(false);
    expect(data.cancelarPorAdmin(envioId, 'x')).toBe(false);
  });

  it('cancelar con retiro asignado devuelve el stock', () => {
    data.asignar(envioId, m1);
    expect(stock()).toBe(7);
    expect(data.cancelarPorAdmin(envioId, 'El cliente lo pidió')).toBe(true);
    expect(stock()).toBe(10);
  });

  it('un mensajero con retiros o entregas en curso no se elimina ni suspende', () => {
    data.asignar(envioId, m1);
    expect(data.motivoMensajeroNoEliminable(m1)).toContain('en curso');
    data.retiroFallido(envioId, m1, 'No estaba');
    expect(data.motivoMensajeroNoEliminable(m1)).toBeNull();
  });

  it('un envío directo nunca pasa por el depósito', () => {
    expect(data.recepcionar(envioId)).toBe(false);
    data.asignar(envioId, m1);
    expect(data.recepcionar(envioId)).toBe(false);
    expect(data.observar(envioId, 'x')).toBe(false);
  });
});
