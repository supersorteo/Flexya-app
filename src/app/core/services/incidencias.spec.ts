import { TestBed } from '@angular/core/testing';
import { ClienteInput, MAX_INTENTOS, MensajeroInput } from '../models';
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

describe('Incidencias y devoluciones: ningún paquete se pierde', () => {
  let data: DataService;
  let clienteId: string;
  let otroClienteId: string;
  let m1: string;
  let m2: string;
  let producto: string;
  let envioId: string;

  const envio = () => data.envios().find((e) => e.id === envioId)!;
  const stock = () => data.productos().find((p) => p.id === producto)!.stock;

  function llevarAReparto() {
    data.recepcionar(envioId);
    data.asignar(envioId, m1);
  }

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    otroClienteId = data.agregarCliente({ ...cliente, email: 'otro@x.com', numeroDocumento: '25678902' }).cliente.id;
    m1 = data.agregarMensajero(mensajeroInput).mensajero.id;
    m2 = data.agregarMensajero({ ...mensajeroInput, numeroDocumento: '28456124', email: 'otro@flexya.com' }).mensajero.id;
    producto = data.agregarProducto(clienteId, { ...base, nombre: 'Taza', stock: 10 }).id;
    envioId = data.crearEnvio({ ...destino, retiro: 'deposito', items: [{ productoId: producto, cantidad: 3 }] }, clienteId).id;
  });

  describe('incidencia en la entrega', () => {
    it('solo se registra si el envío está en reparto, cuenta el intento y no devuelve el stock', () => {
      expect(data.reportarIncidencia(envioId, 'x', 'ausente')).toBe(false);
      llevarAReparto();
      expect(data.reportarIncidencia(envioId, 'Nadie atendió', 'ausente')).toBe(true);
      expect(envio()).toMatchObject({ estado: 'Incidencia', intentos: 1, motivoIncidencia: 'ausente', nota: 'Destinatario ausente: Nadie atendió' });
      expect(stock()).toBe(7);
    });

    it('el paquete sigue con el mensajero hasta que el superadmin confirma el reingreso al depósito', () => {
      llevarAReparto();
      data.reportarIncidencia(envioId, '', 'ausente');
      expect(data.puedeAsignarse(envio())).toBe(false);
      expect(data.puedeDevolver(envio())).toBe(false);
      expect(data.motivoMensajeroNoEliminable(m1)).toContain('en curso');
      expect(data.reingresar(envioId)).toBe(true);
      expect(envio()).toMatchObject({ estado: 'En depósito', mensajeroId: null });
      expect(data.reingresar(envioId)).toBe(false);
    });

    it('desde el depósito se reintenta con otro mensajero hasta agotar los intentos', () => {
      llevarAReparto();
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        data.reportarIncidencia(envioId, '', 'ausente');
        data.reingresar(envioId);
        expect(envio().intentos).toBe(intento);
        if (intento < MAX_INTENTOS) {
          expect(data.puedeAsignarse(envio())).toBe(true);
          expect(data.asignar(envioId, intento % 2 ? m2 : m1)).toBe(true);
        }
      }
      expect(data.puedeAsignarse(envio())).toBe(false);
      expect(data.asignar(envioId, m1)).toBe(false);
      expect(data.puedeDevolver(envio())).toBe(true);
    });

    it('un envío directo con incidencia vuelve al depósito y se reintenta como reparto, no como retiro', () => {
      const directo = data.crearEnvio({ ...destino, retiro: 'domicilio', items: [] }, clienteId).id;
      data.asignar(directo, m1);
      data.retirar(directo, m1);
      data.salirAEntregar(directo, m1);
      data.reportarIncidencia(directo, '', 'direccion');
      data.reingresar(directo);
      expect(data.asignar(directo, m2)).toBe(true);
      expect(data.envios().find((e) => e.id === directo)).toMatchObject({ estado: 'En reparto', mensajeroId: m2 });
    });

    it('si el problema es la dirección se corrige el destino y cambia la tarifa de la zona', () => {
      llevarAReparto();
      expect(data.corregirDestino(envioId, { telefono: '+54 9 11 4444 0000', localidad: 'Avellaneda', direccion: 'Mitre 100' })).toBe(false);
      data.reportarIncidencia(envioId, '', 'direccion');
      const antes = envio().importe;
      expect(data.corregirDestino(envioId, { telefono: '+54 9 11 4444 0000', localidad: 'Avellaneda', direccion: 'Mitre 100' }, otroClienteId)).toBe(false);
      expect(data.corregirDestino(envioId, { telefono: '+54 9 11 4444 0000', localidad: 'Avellaneda', direccion: 'Mitre 100' }, clienteId)).toBe(true);
      expect(envio()).toMatchObject({ direccion: 'Mitre 100', localidad: 'Avellaneda', telefono: '+54 9 11 4444 0000' });
      expect(envio().zonaId).not.toBe('');
      expect(envio().importe).toBeGreaterThan(0);
      expect(typeof antes).toBe('number');
      expect(envio().historial.at(-1)).toMatchObject({ detalle: 'Datos de entrega corregidos' });
    });
  });

  describe('devolución al cliente', () => {
    function aDevolucion() {
      llevarAReparto();
      data.reportarIncidencia(envioId, '', 'rechazo');
      data.reingresar(envioId);
      data.devolverAlCliente(envioId);
    }

    it('queda pendiente de mensajero, y el stock NO vuelve hasta que el cliente confirma', () => {
      aDevolucion();
      expect(envio()).toMatchObject({ estado: 'En devolución', mensajeroId: null });
      expect(data.puedeAsignarse(envio())).toBe(true);
      expect(stock()).toBe(7);

      expect(data.asignar(envioId, m2)).toBe(true);
      expect(envio()).toMatchObject({ estado: 'En devolución', mensajeroId: m2 });
      expect(data.puedeAsignarse(envio())).toBe(false);
      expect(stock()).toBe(7);
    });

    it('el mensajero entrega la devolución, pero solo el cliente la cierra', () => {
      aDevolucion();
      data.asignar(envioId, m2);
      expect(data.entregarDevolucion(envioId, m1)).toBe(false);
      expect(data.entregarDevolucion(envioId, m2)).toBe(true);
      expect(envio().devolucionEntregadaEn).toBeTruthy();
      expect(envio().estado).toBe('En devolución');
      expect(data.motivoMensajeroNoEliminable(m2)).toBeNull();

      expect(data.confirmarDevolucion(envioId, otroClienteId)).toBe(false);
      expect(data.confirmarDevolucion(envioId, clienteId)).toBe(true);
      expect(envio().estado).toBe('Devuelto');
      expect(stock()).toBe(10);
      expect(data.movimientosDe(producto)[0]).toMatchObject({ tipo: 'DEVOLUCION', cantidad: 3, saldo: 10 });
      expect(data.confirmarDevolucion(envioId, clienteId)).toBe(false);
    });

    it('un paquete en custodia de Flexya no se puede cancelar ni eliminar, ni se elimina a su cliente o mensajero', () => {
      aDevolucion();
      data.asignar(envioId, m2);
      expect(data.puedeCancelarAdmin(envio())).toBe(false);
      expect(data.cancelarPorAdmin(envioId, 'x')).toBe(false);
      expect(data.eliminarEnvio(envioId)).toBe(false);
      expect(data.motivoClienteNoEliminable(clienteId)).toContain('paquete');
      expect(data.eliminarCliente(clienteId)).toBe(false);
      expect(data.eliminarMensajero(m2)).toBe(false);
      data.confirmarDevolucion(envioId, clienteId);
      expect(data.eliminarCliente(clienteId)).toBe(true);
    });

    it('si el cliente cancela con el paquete ya en el depósito, se le devuelve en lugar de cancelarlo', () => {
      data.recepcionar(envioId);
      data.observar(envioId, 'Falta una taza');
      expect(data.cancelarEnvio(envioId, clienteId)).toBe(true);
      expect(envio().estado).toBe('En devolución');
      expect(envio().nota).toContain('Cancelado por el cliente');
      expect(stock()).toBe(7);
      data.asignar(envioId, m1);
      data.confirmarDevolucion(envioId, clienteId);
      expect(stock()).toBe(10);
    });

    it('si el paquete nunca salió de manos del cliente (directo), cancelar sí devuelve el stock al instante', () => {
      const directo = data.crearEnvio({ ...destino, retiro: 'domicilio', items: [{ productoId: producto, cantidad: 2 }] }, clienteId).id;
      data.asignar(directo, m1);
      data.diferenciaEnRetiro(directo, m1, 'Hay 1');
      expect(stock()).toBe(5);
      expect(data.cancelarEnvio(directo, clienteId)).toBe(true);
      expect(data.envios().find((e) => e.id === directo)!.estado).toBe('Cancelado');
      expect(stock()).toBe(7);
    });

    it('el superadmin devuelve desde el depósito o desde una revisión, pero no un paquete que no recibió', () => {
      expect(data.devolverAlCliente(envioId)).toBe(false);
      data.recepcionar(envioId);
      data.observar(envioId, 'No coincide');
      expect(data.puedeDevolver(envio())).toBe(true);
      expect(data.devolverAlCliente(envioId)).toBe(true);
    });
  });

  it('deja el historial con cada paso de la devolución', () => {
    llevarAReparto();
    data.reportarIncidencia(envioId, '', 'rechazo');
    data.reingresar(envioId);
    data.devolverAlCliente(envioId);
    data.asignar(envioId, m2);
    data.entregarDevolucion(envioId, m2);
    data.confirmarDevolucion(envioId, clienteId);
    expect(envio().historial.map((h) => h.estado)).toEqual([
      'Pendiente', 'En depósito', 'En reparto', 'Incidencia', 'En depósito', 'En devolución', 'En devolución', 'En devolución', 'Devuelto',
    ]);
  });
});
