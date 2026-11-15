import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput, Usuario } from '../models';
import { DataService } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '+54 9 11 5555 3001', email: 'santiago@flexya.com', zonaId: 'gba-sur',
};
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('Reprogramar el retiro de un envío que quedó pendiente', () => {
  let data: DataService;
  let clienteId: string;
  let admin: Usuario;
  let dueño: Usuario;
  let ajeno: Usuario;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 15, 9, 0));
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    admin = { id: 'u1', nombre: 'Marina Ríos', rol: 'admin' } as Usuario;
    dueño = { id: 'u2', nombre: 'Taller Sur', rol: 'cliente', clienteId } as Usuario;
    ajeno = { id: 'u3', nombre: 'Otro', rol: 'cliente', clienteId: 'c999' } as Usuario;
  });

  afterEach(() => vi.useRealTimers());

  const idDelEnvio = () => data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId).id;
  const envio = (id: string) => data.envios().find((e) => e.id === id)!;
  const pasarAlDiaSiguiente = () => vi.setSystemTime(new Date(2030, 0, 16, 9, 0));

  it('el superadmin lo mueve a otro día hábil y queda programado, con su registro en el historial', () => {
    const id = idDelEnvio();
    pasarAlDiaSiguiente();
    expect(data.reprogramarRetiro(id, '2030-01-17', 'tarde', admin)).toBe(true);
    expect(envio(id)).toMatchObject({ estado: 'Pendiente', fechaRetiro: '2030-01-17', retiroProgramado: true, franja: 'tarde', mensajeroId: null });
    expect(envio(id).historial!.at(-1)!.detalle).toContain('reprogramado para el 17/01 por Marina Ríos');
  });

  it('si ya tenía mensajero, lo pierde y hay que asignarlo de nuevo', () => {
    const id = idDelEnvio();
    const m = data.agregarMensajero(mensajero).mensajero.id;
    data.asignar(id, m);
    expect(envio(id).estado).toBe('Retiro asignado');
    pasarAlDiaSiguiente();
    expect(data.reprogramarRetiro(id, '2030-01-17', null, admin)).toBe(true);
    expect(envio(id)).toMatchObject({ estado: 'Pendiente', mensajeroId: null });
  });

  it('el cliente puede con sus envíos y no con los de otro', () => {
    const id = idDelEnvio();
    pasarAlDiaSiguiente();
    expect(data.reprogramarRetiro(id, '2030-01-17', null, ajeno)).toBe(false);
    expect(data.reprogramarRetiro(id, '2030-01-17', null, dueño)).toBe(true);
  });

  it('no acepta fechas pasadas, fines de semana ni feriados', () => {
    const id = idDelEnvio();
    pasarAlDiaSiguiente();
    expect(data.validarFechaRetiro('2030-01-15')).toContain('anterior a hoy');
    expect(data.validarFechaRetiro('2030-01-19')).toContain('fin de semana');
    expect(data.validarFechaRetiro('')).toBe('Elegí una fecha.');
    expect(data.reprogramarRetiro(id, '2030-01-19', null, admin)).toBe(false);
    expect(data.reprogramarRetiro(id, '2030-01-15', null, admin)).toBe(false);
    expect(envio(id).estado).toBe('Pendiente');
  });

  it('una vez retirado ya no se reprograma el retiro', () => {
    const id = idDelEnvio();
    const m = data.agregarMensajero(mensajero).mensajero.id;
    data.asignar(id, m);
    data.retirar(id, m);
    expect(data.puedeReprogramar(envio(id))).toBe(false);
    expect(data.reprogramarRetiro(id, '2030-01-17', null, admin)).toBe(false);
  });
});
