import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClienteInput, Comision, Envio, Liquidacion, MensajeroInput } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { AlertasAdmin, ResumenNegocio, calcularAlertas, calcularResumen, formatoDuracion, inicioPeriodo } from './resumen-negocio';

const AHORA = new Date(2030, 0, 15, 12, 0, 0);
const iso = (d: number, h = 12, m = 0) => new Date(2030, 0, d, h, m).toISOString();
const nombres = { cliente: (id: string) => `Cliente ${id}`, mensajero: (id: string) => `Mensajero ${id}`, zona: (id: string) => `Zona ${id}` };

let n = 0;
const envio = (extra: Partial<Envio> = {}): Envio => ({
  id: `LF-${++n}`, clienteId: 'c1', destinatario: 'Ana', telefono: '', direccion: '', localidad: '', zonaId: 'z1', estado: 'Entregado', eta: '',
  importe: 1000, mensajeroId: 'm1', creadoEn: iso(10), retiro: 'deposito', origen: '', items: [], historial: [], fechaRetiro: null, retiroId: `R-${n}`,
  retiroProgramado: false, franja: null, intentos: 0, ...extra,
});
const comision = (extra: Partial<Comision> = {}): Comision => ({
  id: `k${++n}`, mensajeroId: 'm1', envioId: 'LF-1', retiroId: 'R-1', concepto: 'ENTREGA', base: 1000, porcentaje: 60, monto: 600, fecha: iso(14), liquidacionId: null, ...extra,
});

describe('Resumen de negocio: cálculos', () => {
  describe('período', () => {
    it('hoy empieza a la medianoche; 7 y 30 días incluyen hoy; todo no tiene límite', () => {
      expect(inicioPeriodo('hoy', AHORA)).toEqual(new Date(2030, 0, 15));
      expect(inicioPeriodo('7d', AHORA)).toEqual(new Date(2030, 0, 9));
      expect(inicioPeriodo('30d', AHORA)).toEqual(new Date(2029, 11, 17));
      expect(inicioPeriodo('todo', AHORA).getTime()).toBe(0);
    });

    it('solo cuenta lo que pasó dentro del período', () => {
      const lista = [envio({ creadoEn: iso(15, 9) }), envio({ creadoEn: iso(12) }), envio({ creadoEn: iso(2) })];
      expect(calcularResumen(lista, [], 'hoy', AHORA, nombres).solicitados).toBe(1);
      expect(calcularResumen(lista, [], '7d', AHORA, nombres).solicitados).toBe(2);
      expect(calcularResumen(lista, [], '30d', AHORA, nombres).solicitados).toBe(3);
      expect(calcularResumen(lista, [], 'todo', AHORA, nombres).solicitados).toBe(3);
    });

    it('los borradores no existen para el negocio', () => {
      expect(calcularResumen([envio({ estado: 'Borrador' })], [], 'todo', AHORA, nombres).solicitados).toBe(0);
    });
  });

  describe('efectividad e incidencias', () => {
    it('es entregados sobre cerrados con servicio (entregados + devueltos); los cancelados no cuentan en contra', () => {
      const lista = [
        envio({ estado: 'Entregado', entregadoEn: iso(14) }),
        envio({ estado: 'Entregado', entregadoEn: iso(14) }),
        envio({ estado: 'Entregado', entregadoEn: iso(14) }),
        envio({ estado: 'Devuelto', historial: [{ estado: 'Devuelto', fecha: iso(14), detalle: '' }] }),
        envio({ estado: 'Cancelado', historial: [{ estado: 'Cancelado', fecha: iso(14), detalle: '' }] }),
      ];
      const r = calcularResumen(lista, [], '7d', AHORA, nombres);
      expect(r).toMatchObject({ entregados: 3, devueltos: 1, cancelados: 1, efectividad: 75 });
    });

    it('sin envíos cerrados no inventa un porcentaje', () => {
      expect(calcularResumen([], [], 'todo', AHORA, nombres).efectividad).toBeNull();
    });

    it('cuenta cada incidencia ocurrida, aunque el envío se haya recuperado después', () => {
      const lista = [
        envio({ historial: [{ estado: 'Incidencia', fecha: iso(13), detalle: '' }, { estado: 'Incidencia', fecha: iso(14), detalle: '' }] }),
        envio({ historial: [{ estado: 'Incidencia', fecha: iso(1), detalle: '' }] }),
      ];
      expect(calcularResumen(lista, [], '7d', AHORA, nombres).incidencias).toBe(2);
      expect(calcularResumen(lista, [], 'todo', AHORA, nombres).incidencias).toBe(3);
    });
  });

  describe('tiempos y puntualidad', () => {
    it('mide la entrega desde el pedido y el servicio desde que Flexya recibe el paquete', () => {
      const lista = [
        envio({ creadoEn: iso(10, 8), entregadoEn: iso(11, 8), historial: [{ estado: 'En depósito', fecha: iso(10, 20), detalle: '' }] }),
        envio({ creadoEn: iso(12, 8), entregadoEn: iso(13, 8), historial: [{ estado: 'Retirado', fecha: iso(12, 20), detalle: '' }] }),
      ];
      const r = calcularResumen(lista, [], 'todo', AHORA, nombres);
      expect(r.tiempoTotalMs).toBe(24 * 3_600_000);
      expect(r.tiempoServicioMs).toBe(12 * 3_600_000);
    });

    it('sin entregas no hay tiempo', () => {
      const r = calcularResumen([envio({ estado: 'Pendiente' })], [], 'todo', AHORA, nombres);
      expect(r.tiempoTotalMs).toBeNull();
      expect(r.tiempoServicioMs).toBeNull();
    });

    it('formatea la duración en minutos, horas o días', () => {
      expect(formatoDuracion(null)).toBe('—');
      expect(formatoDuracion(20 * 60_000)).toBe('20 min');
      expect(formatoDuracion(5.5 * 3_600_000)).toBe('5,5 h');
      expect(formatoDuracion(72 * 3_600_000)).toBe('3 días');
    });

    it('la puntualidad mira solo los retiros que hace un mensajero: a tiempo si fue en o antes de la fecha pedida', () => {
      const dia = (d: number) => `2030-01-${String(d).padStart(2, '0')}`;
      const lista = [
        envio({ retiro: 'domicilio', fechaRetiro: dia(12), historial: [{ estado: 'Retirado', fecha: iso(12, 9), detalle: '' }] }),
        envio({ retiro: 'domicilio', fechaRetiro: dia(12), historial: [{ estado: 'Retirado', fecha: iso(11, 9), detalle: '' }] }),
        envio({ retiro: 'recoleccion', fechaRetiro: dia(12), historial: [{ estado: 'Retirado', fecha: iso(13, 9), detalle: '' }] }),
        envio({ retiro: 'deposito', fechaRetiro: dia(12), historial: [{ estado: 'En depósito', fecha: iso(14, 9), detalle: '' }] }),
      ];
      const r = calcularResumen(lista, [], 'todo', AHORA, nombres);
      expect(r.retirosHechos).toBe(3);
      expect(r.puntualidad).toBe(67);
    });
  });

  describe('dinero y rankings', () => {
    it('ingresos por lo entregado, comisiones del período y margen', () => {
      const lista = [envio({ importe: 2000, entregadoEn: iso(14) }), envio({ importe: 3000, entregadoEn: iso(14) }), envio({ importe: 9999, estado: 'Pendiente' })];
      const r = calcularResumen(lista, [comision({ monto: 1200 }), comision({ monto: 1800 }), comision({ monto: 500, fecha: iso(1) })], '7d', AHORA, nombres);
      expect(r).toMatchObject({ ingresos: 5000, comisiones: 3000, margen: 2000 });
    });

    it('arma los rankings de clientes, mensajeros y zonas', () => {
      const lista = [
        envio({ clienteId: 'c1', zonaId: 'z1', creadoEn: iso(14) }),
        envio({ clienteId: 'c1', zonaId: 'z1', creadoEn: iso(14) }),
        envio({ clienteId: 'c2', zonaId: 'z2', creadoEn: iso(14) }),
      ];
      const r = calcularResumen(lista, [comision({ mensajeroId: 'm1', monto: 600 }), comision({ mensajeroId: 'm2', monto: 900 }), comision({ mensajeroId: 'm2', monto: 100, concepto: 'RETIRO' })], '7d', AHORA, nombres);
      expect(r.clientes.map((f) => [f.nombre, f.cantidad])).toEqual([['Cliente c1', 2], ['Cliente c2', 1]]);
      expect(r.zonas.map((f) => [f.nombre, f.cantidad])).toEqual([['Zona z1', 2], ['Zona z2', 1]]);
      expect(r.mensajeros.map((f) => [f.nombre, f.cantidad, f.monto])).toEqual([['Mensajero m2', 1, 1000], ['Mensajero m1', 1, 600]]);
    });

    it('muestra como máximo los cinco primeros', () => {
      const lista = Array.from({ length: 8 }, (_, i) => envio({ clienteId: `c${i}`, creadoEn: iso(14) }));
      expect(calcularResumen(lista, [], '7d', AHORA, nombres).clientes).toHaveLength(5);
    });
  });
});

describe('Alertas del superadmin', () => {
  const liquidacion = (extra: Partial<Liquidacion> = {}): Liquidacion => ({
    id: `LQ-${++n}`, mensajeroId: 'm1', desde: '2030-01-01', hasta: '2030-01-07', comisionIds: [], bruto: 1000, ajustes: [], neto: 1000, estado: 'Generada', creadaEn: iso(8), ...extra,
  });
  const alertas = (envios: Envio[], comisiones: Comision[] = [], liquidaciones: Liquidacion[] = []) =>
    calcularAlertas(envios, comisiones, liquidaciones, AHORA, (e) => e.estado === 'En depósito' || (e.retiro !== 'deposito' && e.estado === 'Pendiente'));
  const ids = (a: ReturnType<typeof alertas>) => a.map((x) => x.id);

  it('sin pendientes no hay alertas', () => {
    expect(alertas([envio()])).toEqual([]);
  });

  it('retiros vencidos y paquetes esperados que no llegaron, por fecha', () => {
    const lista = [
      envio({ estado: 'Pendiente', retiro: 'domicilio', fechaRetiro: '2030-01-14' }),
      envio({ estado: 'Retiro asignado', retiro: 'recoleccion', fechaRetiro: '2030-01-10' }),
      envio({ estado: 'Pendiente', retiro: 'domicilio', fechaRetiro: '2030-01-15' }),
      envio({ estado: 'Pendiente', retiro: 'deposito', fechaRetiro: '2030-01-13' }),
    ];
    const a = alertas(lista);
    expect(a.find((x) => x.id === 'retiros-vencidos')?.cantidad).toBe(2);
    expect(a.find((x) => x.id === 'llegadas-atrasadas')?.cantidad).toBe(1);
    expect(a.find((x) => x.id === 'sin-asignar')?.cantidad).toBe(2);
  });

  it('avisa de los paquetes que el mensajero ya entregó en el depósito y esperan la recepción', () => {
    const a = alertas([
      envio({ estado: 'Retirado', retiro: 'recoleccion', entregadoEnDepositoEn: iso(14) }),
      envio({ estado: 'Retirado', retiro: 'recoleccion' }),
      envio({ estado: 'Retirado', retiro: 'domicilio' }),
    ]);
    expect(a.find((x) => x.id === 'por-recibir')).toMatchObject({ cantidad: 1, accion: 'Recepcionar', enlace: '/admin/deposito' });
  });

  it('casos que necesitan una decisión', () => {
    const lista = [
      envio({ estado: 'Incidencia' }),
      envio({ estado: 'En revisión' }),
      envio({ estado: 'En depósito', intentos: 3 }),
      envio({ estado: 'En devolución', mensajeroId: null }),
      envio({ estado: 'En devolución', mensajeroId: 'm1', devolucionEntregadaEn: iso(14) }),
    ];
    expect(ids(alertas(lista))).toEqual(expect.arrayContaining(['intentos-agotados', 'incidencias', 'revisiones', 'devoluciones-sin-mensajero', 'devoluciones-sin-confirmar']));
  });

  it('pagos: comisiones sin liquidar y liquidaciones sin pagar, con su monto', () => {
    const a = alertas([], [comision({ monto: 600 }), comision({ monto: 400 }), comision({ liquidacionId: 'LQ-1' })], [liquidacion({ neto: 2500 }), liquidacion({ estado: 'Pagada' })]);
    expect(a.find((x) => x.id === 'sin-liquidar')).toMatchObject({ cantidad: 2, enlace: '/admin/pagos' });
    expect(a.find((x) => x.id === 'sin-liquidar')?.texto).toContain('1.000');
    expect(a.find((x) => x.id === 'sin-pagar')).toMatchObject({ cantidad: 1 });
    expect(a.find((x) => x.id === 'sin-pagar')?.texto).toContain('2.500');
  });

  it('los borradores no generan alertas', () => {
    expect(alertas([envio({ estado: 'Borrador', retiro: 'domicilio', fechaRetiro: '2020-01-01' })])).toEqual([]);
  });
});

describe('Pantallas del resumen del superadmin', () => {
  const cliente: ClienteInput = {
    nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
    email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
    direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
  };
  const mensajero: MensajeroInput = {
    nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
    telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
  };
  const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };
  let data: DataService;
  let clienteId: string;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
  });

  it('sin nada pendiente, las alertas dicen que está todo al día', () => {
    const f = TestBed.createComponent(AlertasAdmin);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Todo al día');
  });

  it('muestra lo que espera una decisión, con un enlace a donde se resuelve', () => {
    data.crearEnvio({ ...destino, retiro: 'domicilio' }, clienteId);
    const f = TestBed.createComponent(AlertasAdmin);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('esperando mensajero');
    expect(el.querySelector('a[href="/admin/envios"]')).not.toBeNull();
  });

  it('el resumen calcula con lo que realmente pasó y cambia al elegir otro período', () => {
    const m = data.agregarMensajero(mensajero).mensajero.id;
    const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
    data.recepcionar(e.id);
    data.asignar(e.id, m);
    data.entregar(e.id, 'Ana');

    const f = TestBed.createComponent(ResumenNegocio);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Resumen del negocio');
    expect(el.textContent).toContain('Entregados');
    expect(el.textContent).toContain('100%');
    expect(el.textContent).toContain('Mensajero');
    expect(el.textContent).toContain('Santiago Pereyra');

    const botones = [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    expect(botones.map((b) => b.textContent!.trim())).toEqual(['Hoy', '7 días', '30 días', 'Todo']);
    expect(botones[2].classList.contains('active')).toBe(true);
    botones[0].click();
    f.detectChanges();
    expect(botones[0].classList.contains('active')).toBe(true);
    expect(el.textContent).toContain('Entregados');
  });
});
