import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput, enCursoMensajero, enCustodiaFlexya } from '../models';
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

describe('Retiro a domicilio que pasa por el depósito', () => {
  let data: DataService;
  let clienteId: string;
  let recolector: string;
  let repartidor: string;
  let producto: string;
  let envioId: string;

  const envio = (id = envioId) => data.envios().find((e) => e.id === id)!;
  const stock = () => data.productos().find((p) => p.id === producto)!.stock;
  const retirado = () => {
    data.asignar(envioId, recolector);
    data.retirar(envioId, recolector);
  };

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    recolector = data.agregarMensajero(mensajeroInput).mensajero.id;
    repartidor = data.agregarMensajero({ ...mensajeroInput, numeroDocumento: '28456124', email: 'otro@flexya.com' }).mensajero.id;
    producto = data.agregarProducto(clienteId, { ...base, nombre: 'Taza', stock: 10 }).id;
    envioId = data.crearEnvio({ ...destino, retiro: 'recoleccion', items: [{ productoId: producto, cantidad: 3 }] }, clienteId).id;
  });

  it('nace como un retiro del mensajero en el domicilio del cliente, con fecha y franja, y reserva el stock', () => {
    expect(envio()).toMatchObject({ retiro: 'recoleccion', estado: 'Pendiente', origen: 'Av. Mitre 100, Avellaneda' });
    expect(envio().fechaRetiro).toBeTruthy();
    expect(stock()).toBe(7);
    const programado = data.crearEnvio({ ...destino, retiro: 'recoleccion', programado: true, fechaRetiro: '2099-02-02', franja: 'tarde' }, clienteId);
    expect(programado).toMatchObject({ retiroProgramado: true, franja: 'tarde' });
  });

  it('el superadmin no lo recepciona hasta que el mensajero declara que lo entregó en el depósito', () => {
    expect(data.puedeRecepcionar(envio())).toBe(false);
    expect(data.recepcionar(envioId)).toBe(false);
    retirado();
    expect(envio().estado).toBe('Retirado');
    expect(data.puedeRecepcionar(envio())).toBe(false);
    expect(data.recepcionar(envioId)).toBe(false);
  });

  it('no sale a entregar directo: del retiro tiene que pasar por el depósito', () => {
    retirado();
    expect(data.salirAEntregar(envioId, recolector)).toBe(false);
    expect(envio().estado).toBe('Retirado');
  });

  it('recorre Pendiente → Retiro asignado → Retirado → En depósito → En reparto → Entregado', () => {
    data.asignar(envioId, recolector);
    expect(envio()).toMatchObject({ estado: 'Retiro asignado', mensajeroId: recolector });
    data.retirar(envioId, recolector);
    expect(data.entregarEnDeposito(envioId, recolector)).toBe(true);
    expect(envio().estado).toBe('Retirado');
    expect(envio().entregadoEnDepositoEn).toBeTruthy();
    expect(data.puedeRecepcionar(envio())).toBe(true);

    expect(data.recepcionar(envioId, 'Todo en orden')).toBe(true);
    expect(envio()).toMatchObject({ estado: 'En depósito', mensajeroId: null });
    expect(data.puedeAsignarse(envio())).toBe(true);

    expect(data.asignar(envioId, repartidor)).toBe(true);
    expect(envio()).toMatchObject({ estado: 'En reparto', mensajeroId: repartidor });
    data.entregar(envioId, 'Ana');
    expect(envio().estado).toBe('Entregado');
    expect(envio().historial.map((h) => h.estado)).toEqual(['Pendiente', 'Retiro asignado', 'Retirado', 'Retirado', 'En depósito', 'En reparto', 'Entregado']);
    expect(stock()).toBe(7);
  });

  it('solo el mensajero que lo retiró puede declarar la entrega en el depósito, y una sola vez', () => {
    retirado();
    expect(data.entregarEnDeposito(envioId, repartidor)).toBe(false);
    expect(data.entregarEnDeposito(envioId, recolector)).toBe(true);
    expect(data.entregarEnDeposito(envioId, recolector)).toBe(false);
  });

  it('al declarar la entrega el mensajero deja de tenerlo a su cargo, pero el paquete sigue siendo de Flexya', () => {
    retirado();
    expect(enCursoMensajero(envio())).toBe(true);
    expect(data.motivoMensajeroNoEliminable(recolector)).toContain('en curso');
    data.entregarEnDeposito(envioId, recolector);
    expect(enCursoMensajero(envio())).toBe(false);
    expect(enCustodiaFlexya(envio())).toBe(true);
  });

  it('retirar y recepcionar un retiro con varios destinatarios se hace en bloque', () => {
    const b = data.crearEnvio({ ...destino, destinatario: 'Beto', retiro: 'recoleccion', retiroId: envio().retiroId, items: [] }, clienteId).id;
    data.asignar(envioId, recolector);
    data.retirar(envioId, recolector);
    data.entregarEnDeposito(b, recolector);
    expect([envio().entregadoEnDepositoEn, envio(b).entregadoEnDepositoEn].every(Boolean)).toBe(true);
    expect(data.paquetesRecepcionables(envio())).toHaveLength(2);
    data.recepcionar(envioId);
    expect([envio().estado, envio(b).estado]).toEqual(['En depósito', 'En depósito']);
  });

  describe('diferencias', () => {
    it('si no coincide al retirar, queda en revisión y el cliente puede cancelarlo sin devolución (el paquete no salió)', () => {
      data.asignar(envioId, recolector);
      data.diferenciaEnRetiro(envioId, recolector, 'Hay 2');
      expect(envio().estado).toBe('En revisión');
      expect(enCustodiaFlexya(envio())).toBe(false);
      expect(data.cancelarEnvio(envioId, clienteId)).toBe(true);
      expect(envio().estado).toBe('Cancelado');
      expect(stock()).toBe(10);
    });

    it('al reanudar una revisión del retiro, vuelve a pendiente para asignarlo otra vez', () => {
      data.asignar(envioId, recolector);
      data.diferenciaEnRetiro(envioId, recolector, 'Hay 2');
      data.reanudar(envioId);
      expect(envio()).toMatchObject({ estado: 'Pendiente', mensajeroId: null });
    });

    it('si no coincide al recibirlo en el depósito, queda en revisión con el paquete en custodia de Flexya', () => {
      retirado();
      data.entregarEnDeposito(envioId, recolector);
      expect(data.puedeObservar(envio())).toBe(true);
      expect(data.observar(envioId, 'Falta una taza')).toBe(true);
      expect(enCustodiaFlexya(envio())).toBe(true);
      expect(data.puedeCancelarAdmin(envio())).toBe(false);
      expect(data.puedeDevolver(envio())).toBe(true);
      data.reanudar(envioId);
      expect(envio().estado).toBe('En depósito');
    });

    it('si el cliente cancela con el paquete ya en el depósito, se le devuelve', () => {
      retirado();
      data.entregarEnDeposito(envioId, recolector);
      data.observar(envioId, 'No coincide');
      expect(data.cancelarEnvio(envioId, clienteId)).toBe(true);
      expect(envio().estado).toBe('En devolución');
      expect(stock()).toBe(7);
    });

    it('un retiro fallido lo vuelve a dejar asignable', () => {
      data.asignar(envioId, recolector);
      data.retiroFallido(envioId, recolector, 'No estaba');
      expect(envio().estado).toBe('Retiro fallido');
      expect(data.puedeAsignarse(envio())).toBe(true);
    });
  });

  describe('dinero', () => {
    it('el recargo es configurable, empieza en cero y se suma a la tarifa solo en este tipo', () => {
      const sinRecargo = envio().importe;
      const directo = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
      expect(directo.importe).toBe(sinRecargo);
      data.guardarConfigOperacion({ ...data.configOperacion(), recargoRecoleccion: 700 });
      const conRecargo = data.crearEnvio({ ...destino, retiro: 'recoleccion' }, clienteId);
      const otroDirecto = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
      expect(conRecargo.importe).toBe(sinRecargo + 700);
      expect(otroDirecto.importe).toBe(sinRecargo);
    });

    it('el mensajero que retira cobra el adicional por retiro y el que entrega, su comisión de entrega', () => {
      data.guardarConfigPagos({ ...data.configPagos(), adicionalRetiro: 500 });
      retirado();
      data.entregarEnDeposito(envioId, recolector);
      data.recepcionar(envioId);
      data.asignar(envioId, repartidor);
      data.entregar(envioId);
      const retiro = data.comisiones().find((c) => c.concepto === 'RETIRO')!;
      const entrega = data.comisiones().find((c) => c.concepto === 'ENTREGA')!;
      expect(retiro).toMatchObject({ mensajeroId: recolector, monto: 500 });
      expect(entrega).toMatchObject({ mensajeroId: repartidor });
      expect(entrega.monto).toBeGreaterThan(0);
    });
  });

  it('no cambia el comportamiento de los otros dos tipos', () => {
    const directo = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId).id;
    data.asignar(directo, recolector);
    data.retirar(directo, recolector);
    expect(data.entregarEnDeposito(directo, recolector)).toBe(false);
    expect(data.salirAEntregar(directo, recolector)).toBe(true);
    expect(envio(directo).estado).toBe('En reparto');

    const viaDeposito = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId).id;
    expect(data.puedeRecepcionar(envio(viaDeposito))).toBe(true);
    expect(data.recepcionar(viaDeposito)).toBe(true);
  });
});
