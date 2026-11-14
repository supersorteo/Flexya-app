import { TestBed } from '@angular/core/testing';
import { CONFIG_PAGOS_DEFECTO, ClienteInput, MensajeroInput, hoyISO } from '../models';
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
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };
const TODO = { desde: '2000-01-01', hasta: '2999-12-31' };

describe('Pagos a mensajeros', () => {
  let data: DataService;
  let clienteId: string;
  let m1: string;
  let m2: string;

  function entregado(extra: Record<string, unknown> = {}, mensajeroId = m1) {
    const e = data.crearEnvio({ ...destino, retiro: 'deposito', ...extra }, clienteId);
    data.recepcionar(e.id);
    data.asignar(e.id, mensajeroId);
    data.entregar(e.id, 'Ana');
    return data.envios().find((x) => x.id === e.id)!;
  }

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    m1 = data.agregarMensajero(mensajeroInput).mensajero.id;
    m2 = data.agregarMensajero({ ...mensajeroInput, numeroDocumento: '28456124', email: 'otro@flexya.com' }).mensajero.id;
  });

  describe('comisión por entrega', () => {
    it('solo se genera al entregar, con el porcentaje general por defecto', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      data.recepcionar(e.id);
      data.asignar(e.id, m1);
      expect(data.comisiones()).toHaveLength(0);
      data.entregar(e.id);
      expect(data.comisiones()).toHaveLength(1);
      const [c] = data.comisiones();
      expect(c).toMatchObject({ concepto: 'ENTREGA', mensajeroId: m1, base: e.importe, porcentaje: CONFIG_PAGOS_DEFECTO.porcentajeGeneral, liquidacionId: null });
      expect(c.monto).toBe(Math.round(e.importe * 60) / 100);
    });

    it('un envío cancelado o con incidencia no genera comisión de entrega', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      data.cancelarEnvio(e.id, clienteId);
      expect(data.comisiones()).toHaveLength(0);
    });

    it('no se cobra dos veces la misma entrega', () => {
      const e = entregado();
      data.entregar(e.id);
      expect(data.comisiones().filter((c) => c.concepto === 'ENTREGA')).toHaveLength(1);
    });

    it('el ejemplo del negocio: 10 envíos que suman $40.000 a un 60% son $24.000', () => {
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, porcentajeGeneral: 60 });
      for (let i = 0; i < 10; i++) {
        const e = entregado();
        expect(e.estado).toBe('Entregado');
      }
      const total = data.envios().reduce((t, e) => t + e.importe, 0);
      const comision = data.comisiones().reduce((t, c) => t + c.monto, 0);
      expect(Math.round(comision * 100) / 100).toBe(Math.round(total * 60) / 100);
    });
  });

  describe('porcentajes por nivel', () => {
    it('manda el del mensajero, si no el de la zona, si no el general', () => {
      const e = entregado();
      const zona = e.zonaId;
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, porcentajeGeneral: 50, porZona: { [zona]: 70 }, porMensajero: { [m2]: 80 } });
      expect(data.porcentajeDe(m1, zona)).toBe(70);
      expect(data.porcentajeDe(m2, zona)).toBe(80);
      expect(data.porcentajeDe(m1, 'otra-zona')).toBe(50);
      expect(data.porcentajeDe(null, 'otra-zona')).toBe(50);
    });

    it('cambiar el porcentaje no altera las entregas ya hechas (el monto queda congelado)', () => {
      const antes = entregado();
      const montoAntes = data.comisiones()[0].monto;
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, porcentajeGeneral: 90 });
      const despues = entregado();
      const porEnvio = (id: string) => data.comisiones().find((c) => c.envioId === id)!;
      expect(porEnvio(antes.id).monto).toBe(montoAntes);
      expect(porEnvio(antes.id).porcentaje).toBe(60);
      expect(porEnvio(despues.id).porcentaje).toBe(90);
    });
  });

  describe('intentos fallidos, retiros y devoluciones', () => {
    it('el intento fallido paga un porcentaje de su comisión, salvo si el paquete se dañó', () => {
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, porcentajeGeneral: 60, porcentajeIntentoFallido: 50 });
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      data.recepcionar(e.id);
      data.asignar(e.id, m1);
      data.reportarIncidencia(e.id, '', 'ausente');
      expect(data.comisiones()[0]).toMatchObject({ concepto: 'INTENTO_FALLIDO', porcentaje: 30 });

      data.reingresar(e.id);
      data.asignar(e.id, m1);
      data.reportarIncidencia(e.id, '', 'danado');
      expect(data.comisiones()).toHaveLength(1);
    });

    it('con 0% (valor por defecto) el intento fallido no genera pago', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      data.recepcionar(e.id);
      data.asignar(e.id, m1);
      data.reportarIncidencia(e.id, '', 'ausente');
      expect(data.comisiones()).toHaveLength(0);
    });

    it('el adicional por retiro se paga una sola vez por retiro, aunque tenga varios destinatarios', () => {
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, adicionalRetiro: 500 });
      const a = data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
      data.crearEnvio({ ...destino, retiro: 'domicilio', retiroId: a.retiroId }, clienteId);
      data.asignar(a.id, m1);
      data.retirar(a.id, m1);
      const retiros = data.comisiones().filter((c) => c.concepto === 'RETIRO');
      expect(retiros).toHaveLength(1);
      expect(retiros[0]).toMatchObject({ monto: 500, mensajeroId: m1, retiroId: a.retiroId });
    });

    it('la devolución paga un porcentaje configurable al mensajero que la entrega', () => {
      data.guardarConfigPagos({ ...CONFIG_PAGOS_DEFECTO, porcentajeDevolucion: 50 });
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      data.recepcionar(e.id);
      data.devolverAlCliente(e.id);
      data.asignar(e.id, m2);
      data.entregarDevolucion(e.id, m2);
      expect(data.comisiones()[0]).toMatchObject({ concepto: 'DEVOLUCION', mensajeroId: m2, porcentaje: 30 });
    });
  });

  describe('liquidaciones', () => {
    it('agrupa las comisiones pendientes del período, no repite las ya liquidadas y arma el neto con el descuento', () => {
      entregado();
      entregado();
      entregado({}, m2);
      const bruto = data.comisiones().filter((c) => c.mensajeroId === m1).reduce((t, c) => t + c.monto, 0);

      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta, { concepto: 'Adelanto', monto: 100 })!;
      expect(l.comisionIds).toHaveLength(2);
      expect(l.bruto).toBe(Math.round(bruto * 100) / 100);
      expect(l.neto).toBe(Math.round((bruto - 100) * 100) / 100);
      expect(l.ajustes).toEqual([{ concepto: 'Adelanto', monto: -100 }]);
      expect(data.comisiones().filter((c) => c.liquidacionId === l.id)).toHaveLength(2);
      expect(data.generarLiquidacion(m1, TODO.desde, TODO.hasta)).toBeNull();
      expect(data.pendientesDe(m2, TODO.desde, TODO.hasta)).toHaveLength(1);
    });

    it('el descuento nunca supera lo que se le debe y el período vacío no genera nada', () => {
      entregado();
      const bruto = data.comisiones()[0].monto;
      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta, { concepto: 'Multa', monto: bruto * 10 })!;
      expect(l.neto).toBe(0);
      expect(data.generarLiquidacion(m2, TODO.desde, TODO.hasta)).toBeNull();
      expect(data.generarLiquidacion(m1, '2999-01-02', '2999-01-01')).toBeNull();
    });

    it('solo entran las comisiones del rango de fechas pedido', () => {
      entregado();
      expect(data.pendientesDe(m1, '2000-01-01', '2000-12-31')).toHaveLength(0);
      expect(data.pendientesDe(m1, hoyISO(), hoyISO())).toHaveLength(1);
    });

    it('pagar exige el medio y deja registro; una liquidación pagada no se anula ni se paga de nuevo', () => {
      entregado();
      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta)!;
      expect(data.pagarLiquidacion(l.id, '  ')).toBe(false);
      expect(data.pagarLiquidacion(l.id, 'Transferencia 123')).toBe(true);
      const pagada = data.liquidaciones()[0];
      expect(pagada).toMatchObject({ estado: 'Pagada', pago: 'Transferencia 123' });
      expect(pagada.pagadaEn).toBeTruthy();
      expect(data.pagarLiquidacion(l.id, 'otra')).toBe(false);
      expect(data.anularLiquidacion(l.id)).toBe(false);
      expect(data.estadoComision(data.comisiones()[0])).toBe('Pagada');
    });

    it('anular una liquidación libera las comisiones para volver a liquidarlas', () => {
      entregado();
      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta)!;
      expect(data.estadoComision(data.comisiones()[0])).toBe('Liquidada');
      expect(data.anularLiquidacion(l.id)).toBe(true);
      expect(data.liquidaciones()[0].estado).toBe('Anulada');
      expect(data.estadoComision(data.comisiones()[0])).toBe('Pendiente');
      expect(data.generarLiquidacion(m1, TODO.desde, TODO.hasta)).not.toBeNull();
    });
  });

  describe('resúmenes', () => {
    it('el superadmin ve ingresos, comisiones, pendiente, pagado y margen', () => {
      const a = entregado();
      const b = entregado({}, m2);
      const ingresos = a.importe + b.importe;
      const comision = data.comisiones().reduce((t, c) => t + c.monto, 0);
      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta)!;
      data.pagarLiquidacion(l.id, 'Efectivo');

      const r = data.resumenPagos();
      expect(r.ingresos).toBe(ingresos);
      expect(r.comisionado).toBe(Math.round(comision * 100) / 100);
      expect(r.margen).toBe(Math.round((ingresos - comision) * 100) / 100);
      expect(r.pagado).toBe(l.neto);
      expect(r.pendiente).toBe(Math.round((comision - l.bruto) * 100) / 100);
    });

    it('el mensajero ve lo suyo: hoy, semana, a cobrar y cobrado, sin mezclar con otros', () => {
      entregado();
      entregado();
      entregado({}, m2);
      const propio = data.comisiones().filter((c) => c.mensajeroId === m1).reduce((t, c) => t + c.monto, 0);
      let g = data.gananciasDe(m1);
      expect(g).toMatchObject({ hoy: Math.round(propio * 100) / 100, semana: Math.round(propio * 100) / 100, pendiente: Math.round(propio * 100) / 100, cobrado: 0 });

      const l = data.generarLiquidacion(m1, TODO.desde, TODO.hasta)!;
      data.pagarLiquidacion(l.id, 'Transferencia');
      g = data.gananciasDe(m1);
      expect(g.pendiente).toBe(0);
      expect(g.cobrado).toBe(l.neto);
      expect(data.gananciasDe(m2).cobrado).toBe(0);
    });

    it('cada mensajero solo accede a sus propias comisiones', () => {
      entregado();
      entregado({}, m2);
      const usuarioDe = (mensajeroId: string) => ({ rol: 'mensajero' as const, mensajeroId }) as never;
      expect(data.comisionesDe(usuarioDe(m1)).every((c) => c.mensajeroId === m1)).toBe(true);
      expect(data.comisionesDe(usuarioDe(m1))).toHaveLength(1);
      expect(data.comisionesDe(null)).toHaveLength(0);
    });

    it('un mensajero con pagos sin cobrar no se puede eliminar', () => {
      entregado();
      expect(data.motivoMensajeroNoEliminable(m1)).toContain('pagos pendientes');
      expect(data.eliminarMensajero(m1)).toBe(false);
    });
  });
});
