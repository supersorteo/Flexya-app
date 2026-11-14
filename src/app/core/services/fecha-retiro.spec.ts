import { TestBed } from '@angular/core/testing';
import { ClienteInput, OPERACION_DEFECTO, esDiaHabilISO, proximaFechaHabil } from '../models';
import { DataService } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('Fecha de retiro automática', () => {
  describe('cálculo con hora de corte y días hábiles', () => {
    const cfg = { ...OPERACION_DEFECTO, horaCorte: 14 };

    it('antes de la hora de corte en un día hábil, es para hoy', () => {
      expect(proximaFechaHabil(new Date(2030, 0, 15, 9, 0), cfg)).toBe('2030-01-15');
      expect(proximaFechaHabil(new Date(2030, 0, 15, 13, 59), cfg)).toBe('2030-01-15');
    });

    it('desde la hora de corte, es para el próximo día hábil', () => {
      expect(proximaFechaHabil(new Date(2030, 0, 15, 14, 0), cfg)).toBe('2030-01-16');
      expect(proximaFechaHabil(new Date(2030, 0, 15, 20, 30), cfg)).toBe('2030-01-16');
    });

    it('los fines de semana salta al lunes', () => {
      expect(new Date(2030, 0, 18).getDay()).toBe(5);
      expect(proximaFechaHabil(new Date(2030, 0, 18, 16, 0), cfg)).toBe('2030-01-21');
      expect(proximaFechaHabil(new Date(2030, 0, 19, 9, 0), cfg)).toBe('2030-01-21');
      expect(proximaFechaHabil(new Date(2030, 0, 20, 9, 0), cfg)).toBe('2030-01-21');
    });

    it('los feriados cargados tampoco son hábiles', () => {
      const conFeriado = { ...cfg, feriados: ['2030-01-16', '2030-01-17'] };
      expect(proximaFechaHabil(new Date(2030, 0, 15, 15, 0), conFeriado)).toBe('2030-01-18');
      expect(esDiaHabilISO('2030-01-16', conFeriado.feriados)).toBe(false);
      expect(esDiaHabilISO('2030-01-18', conFeriado.feriados)).toBe(true);
      expect(esDiaHabilISO('2030-01-19', [])).toBe(false);
    });

    it('la hora de corte es configurable', () => {
      expect(proximaFechaHabil(new Date(2030, 0, 15, 11, 0), { horaCorte: 10, feriados: [] })).toBe('2030-01-16');
      expect(proximaFechaHabil(new Date(2030, 0, 15, 11, 0), { horaCorte: 18, feriados: [] })).toBe('2030-01-15');
    });
  });

  describe('en los envíos', () => {
    let data: DataService;
    let clienteId: string;

    beforeEach(() => {
      localStorage.clear();
      for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
      TestBed.configureTestingModule({});
      data = TestBed.inject(DataService);
      clienteId = data.agregarCliente(cliente).cliente.id;
    });

    it('sin programar, el sistema pone la fecha y queda marcado como "lo antes posible"', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
      expect(e).toMatchObject({ fechaRetiro: data.proximaFechaRetiro(), retiroProgramado: false, franja: null });
    });

    it('una fecha enviada sin pedir programar se ignora: manda el cálculo automático', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio', fechaRetiro: '2099-01-01' }, clienteId);
      expect(e.fechaRetiro).toBe(data.proximaFechaRetiro());
      expect(e.retiroProgramado).toBe(false);
    });

    it('programado conserva la fecha elegida y, en retiro a domicilio, la franja', () => {
      const dom = data.crearEnvio({ ...destino, retiro: 'domicilio', programado: true, fechaRetiro: '2099-03-03', franja: 'tarde' }, clienteId);
      expect(dom).toMatchObject({ fechaRetiro: '2099-03-03', retiroProgramado: true, franja: 'tarde' });
      const dep = data.crearEnvio({ ...destino, retiro: 'deposito', programado: true, fechaRetiro: '2099-03-03', franja: 'tarde' }, clienteId);
      expect(dep).toMatchObject({ fechaRetiro: '2099-03-03', retiroProgramado: true, franja: null });
    });

    it('una fecha programada que ya pasó vuelve al cálculo automático', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio', programado: true, fechaRetiro: '2000-01-01' }, clienteId);
      expect(e).toMatchObject({ fechaRetiro: data.proximaFechaRetiro(), retiroProgramado: false });
    });

    it('al editar un envío automático no se mueve la fecha; pasarlo a programado sí', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
      data.guardarConfigOperacion({ horaCorte: 0, feriados: [] });
      data.actualizarEnvio(e.id, clienteId, { ...destino, retiro: 'domicilio', direccion: 'Honduras 4800' });
      expect(data.envios()[0].fechaRetiro).toBe(e.fechaRetiro);

      data.actualizarEnvio(e.id, clienteId, { ...destino, retiro: 'domicilio', programado: true, fechaRetiro: '2099-05-05', franja: 'manana' });
      expect(data.envios()[0]).toMatchObject({ fechaRetiro: '2099-05-05', retiroProgramado: true, franja: 'manana' });
    });

    it('un borrador recalcula la fecha automática recién cuando se solicita', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio', borrador: true }, clienteId);
      data.guardarConfigOperacion({ horaCorte: 0, feriados: [] });
      expect(data.solicitarEnvio(e.id, clienteId)).toBe(true);
      expect(data.envios()[0].fechaRetiro).toBe(data.proximaFechaRetiro());
    });

    it('un destinatario que se suma a un retiro programado hereda la fecha y la franja', () => {
      const a = data.crearEnvio({ ...destino, retiro: 'domicilio', programado: true, fechaRetiro: '2099-04-04', franja: 'tarde' }, clienteId);
      const b = data.crearEnvio({ ...destino, destinatario: 'Beto', retiro: 'deposito', retiroId: a.retiroId }, clienteId);
      expect(b).toMatchObject({ fechaRetiro: '2099-04-04', retiroProgramado: true, franja: 'tarde', retiro: 'domicilio' });
    });

    it('la fecha de creación es siempre automática y distinta de la de retiro', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'domicilio', programado: true, fechaRetiro: '2099-06-06' }, clienteId);
      expect(Math.abs(new Date(e.creadoEn).getTime() - Date.now())).toBeLessThan(5000);
      expect(e.historial[0].fecha).toBe(e.creadoEn);
      expect(e.fechaRetiro).not.toBe(e.creadoEn.slice(0, 10));
    });
  });
});
