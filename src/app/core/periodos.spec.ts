import { calcularResumen } from '../features/dashboard/resumen-negocio';
import { actividadDelPeriodo, esArrastrado, esFuturo, etiquetaArrastre } from './periodos';
import { Comision, Envio } from './models';

const AHORA = new Date(2030, 0, 15, 12, 0, 0);
const dia = (atras: number, hora = 10) => new Date(2030, 0, 15 - atras, hora).toISOString();
const ymd = (atras: number) => {
  const d = new Date(2030, 0, 15 - atras);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nombres = { cliente: (id: string) => id, mensajero: (id: string) => id, zona: (id: string) => id };

let n = 0;
function envio(p: Partial<Envio> & { creado?: number; entregado?: number }): Envio {
  const { creado = 0, entregado, ...resto } = p;
  const e = {
    id: `LF-${++n}`, clienteId: 'c1', mensajeroId: null, zonaId: 'z1', importe: 1000, retiro: 'directo', items: [],
    estado: 'Pendiente', creadoEn: dia(creado), fechaRetiro: ymd(creado), historial: [], ...resto,
  } as unknown as Envio;
  if (entregado !== undefined) {
    e.estado = 'Entregado';
    e.entregadoEn = dia(entregado);
    e.historial = [{ estado: 'Entregado', fecha: dia(entregado) }] as Envio['historial'];
  }
  return e;
}
const comision = (m: string, monto: number, atras = 0) => ({ id: `K-${++n}`, mensajeroId: m, monto, concepto: 'ENTREGA', fecha: dia(atras) }) as unknown as Comision;

describe('Pendientes que pasan de un día a otro', () => {
  it('un envío abierto cuyo día de trabajo ya pasó es arrastrado; uno de hoy o programado a futuro no', () => {
    expect(esArrastrado(envio({ creado: 1 }), AHORA)).toBe(true);
    expect(esArrastrado(envio({ creado: 0 }), AHORA)).toBe(false);
    const futuro = envio({ creado: 0, fechaRetiro: ymd(-3) });
    expect(esArrastrado(futuro, AHORA)).toBe(false);
    expect(esFuturo(futuro, AHORA)).toBe(true);
    expect(esArrastrado(envio({ creado: 2, entregado: 2 }), AHORA)).toBe(false);
  });

  it('lo etiqueta con cuántos días viene', () => {
    expect(etiquetaArrastre(envio({ creado: 1 }), AHORA)).toBe('Viene de ayer');
    expect(etiquetaArrastre(envio({ creado: 3 }), AHORA)).toBe('Viene de hace 3 días');
    expect(etiquetaArrastre(envio({ creado: 0 }), AHORA)).toBeNull();
  });
});

describe('Actividad del período', () => {
  it('en "Hoy" muestra lo abierto (con lo arrastrado primero) y lo cerrado hoy; no lo cerrado antes ni lo futuro ni los borradores', () => {
    const arrastrado = envio({ creado: 2, estado: 'En reparto' });
    const deHoy = envio({ creado: 0 });
    const cerradoHoy = envio({ creado: 1, entregado: 0 });
    const cerradoAyer = envio({ creado: 2, entregado: 1 });
    const futuro = envio({ creado: 1, fechaRetiro: ymd(-2) });
    const borrador = envio({ creado: 0, estado: 'Borrador' });
    const ids = actividadDelPeriodo([deHoy, cerradoAyer, borrador, cerradoHoy, futuro, arrastrado], 'hoy', AHORA).map((e) => e.id);
    expect(ids).toEqual([arrastrado.id, deHoy.id, cerradoHoy.id]);
  });

  it('en 7 días suma lo cerrado esos días y en "Todo" incluye lo programado a futuro', () => {
    const cerradoAyer = envio({ creado: 2, entregado: 1 });
    const viejo = envio({ creado: 20, entregado: 20 });
    const futuro = envio({ creado: 8, fechaRetiro: ymd(-2) });
    expect(actividadDelPeriodo([cerradoAyer, viejo, futuro], '7d', AHORA).map((e) => e.id)).toEqual([cerradoAyer.id]);
    expect(actividadDelPeriodo([cerradoAyer, viejo, futuro], 'todo', AHORA)).toHaveLength(3);
  });
});

describe('Las cifras de los tres roles cuadran entre sí', () => {
  const m1 = 'm1';
  const m2 = 'm2';
  const todos = [
    envio({ clienteId: 'c1', mensajeroId: m1, creado: 0, entregado: 0, importe: 1000 }),
    envio({ clienteId: 'c1', mensajeroId: m2, creado: 0, entregado: 0, importe: 2000 }),
    envio({ clienteId: 'c2', mensajeroId: m1, creado: 0, entregado: 0, importe: 500 }),
    envio({ clienteId: 'c2', mensajeroId: m1, creado: 1, entregado: 1, importe: 700 }),
    envio({ clienteId: 'c1', mensajeroId: m2, creado: 0, estado: 'En reparto' }),
    envio({ clienteId: 'c2', creado: 0, estado: 'Cancelado', historial: [{ estado: 'Cancelado', fecha: dia(0) }] as Envio['historial'] }),
  ];
  const comisiones = [comision(m1, 300), comision(m1, 300), comision(m2, 400), comision(m1, 300, 1)];
  const admin = calcularResumen(todos, comisiones, 'hoy', AHORA, nombres);

  it('lo del superadmin es la suma exacta de lo de cada cliente', () => {
    const porCliente = ['c1', 'c2'].map((c) => calcularResumen(todos.filter((e) => e.clienteId === c), [], 'hoy', AHORA, nombres));
    for (const campo of ['solicitados', 'entregados', 'cancelados', 'ingresos'] as const) {
      expect(porCliente.reduce((t, r) => t + r[campo], 0)).toBe(admin[campo]);
    }
    expect(admin.entregados).toBe(3);
  });

  it('lo del superadmin es la suma exacta de lo de cada mensajero, entregas y comisiones', () => {
    const porMensajero = [m1, m2].map((m) =>
      calcularResumen(todos.filter((e) => e.mensajeroId === m), comisiones.filter((c) => c.mensajeroId === m), 'hoy', AHORA, nombres),
    );
    expect(porMensajero.reduce((t, r) => t + r.entregados, 0)).toBe(admin.entregados);
    expect(porMensajero.reduce((t, r) => t + r.comisiones, 0)).toBe(admin.comisiones);
    expect(admin.comisiones).toBe(1000);
  });

  it('lo que cobra cada mensajero coincide con lo que el superadmin ve pagado a ese mensajero', () => {
    const filaAdmin = (m: string) => admin.mensajeros.find((f) => f.clave === m)!;
    for (const m of [m1, m2]) {
      const propio = calcularResumen(todos.filter((e) => e.mensajeroId === m), comisiones.filter((c) => c.mensajeroId === m), 'hoy', AHORA, nombres);
      expect(propio.comisiones).toBe(filaAdmin(m).monto);
    }
  });
});

import { abiertosAlCierre, mover, rangoDe, subrangos, textoVariacion } from './periodos';

describe('Períodos de calendario', () => {
  const miercoles = new Date(2030, 0, 16, 9, 0, 0);

  it('el día, la semana (lunes a domingo) y el mes son unidades cerradas', () => {
    expect(new Date(rangoDe('dia', miercoles).desde)).toEqual(new Date(2030, 0, 16));
    const sem = rangoDe('semana', miercoles);
    expect(new Date(sem.desde)).toEqual(new Date(2030, 0, 14));
    expect(new Date(sem.hasta)).toEqual(new Date(2030, 0, 21));
    const mes = rangoDe('mes', miercoles);
    expect(new Date(mes.desde)).toEqual(new Date(2030, 0, 1));
    expect(new Date(mes.hasta)).toEqual(new Date(2030, 1, 1));
  });

  it('se navega hacia atrás y adelante sin saltos', () => {
    expect(new Date(mover(rangoDe('semana', miercoles), -1).desde)).toEqual(new Date(2030, 0, 7));
    expect(new Date(mover(rangoDe('mes', miercoles), -1).desde)).toEqual(new Date(2029, 11, 1));
    expect(mover(mover(rangoDe('dia', miercoles), -3), 3)).toEqual(rangoDe('dia', miercoles));
  });

  it('la semana se compone de 7 días y el mes de semanas recortadas que lo cubren exacto', () => {
    expect(subrangos(rangoDe('semana', miercoles))).toHaveLength(7);
    const mes = rangoDe('mes', miercoles);
    const partes = subrangos(mes);
    expect(partes[0].desde).toBe(mes.desde);
    expect(partes[partes.length - 1].hasta).toBe(mes.hasta);
    for (let i = 1; i < partes.length; i++) expect(partes[i].desde).toBe(partes[i - 1].hasta);
    expect(subrangos(rangoDe('dia', miercoles))).toEqual([]);
  });

  it('la suma de los días es la semana y la suma de las semanas es el mes', () => {
    const lista: Envio[] = [];
    for (let d = 0; d < 20; d++) lista.push(envio({ creado: d, entregado: d, importe: 100 + d }));
    const ahora = new Date(2030, 0, 15, 12);
    const total = (r: ReturnType<typeof rangoDe>) => calcularResumen(lista, [], r, ahora, nombres);
    const semana = rangoDe('semana', ahora);
    const dias = subrangos(semana).map(total);
    expect(dias.reduce((t, r) => t + r.entregados, 0)).toBe(total(semana).entregados);
    expect(dias.reduce((t, r) => t + r.ingresos, 0)).toBe(total(semana).ingresos);
    const mes = rangoDe('mes', ahora);
    const semanas = subrangos(mes).map(total);
    expect(semanas.reduce((t, r) => t + r.entregados, 0)).toBe(total(mes).entregados);
    expect(semanas.reduce((t, r) => t + r.solicitados, 0)).toBe(total(mes).solicitados);
  });

  it('en un día pasado muestra lo que se pidió o cerró ese día y reconstruye lo que quedó abierto', () => {
    const ayer = rangoDe('dia', new Date(2030, 0, 14, 12));
    const cerradoAyer = envio({ creado: 3, entregado: 1 });
    const abiertoDesdeAntes = envio({ creado: 3, estado: 'En reparto' });
    const pedidoAyerYCerradoHoy = envio({ creado: 1, entregado: 0 });
    const posterior = envio({ creado: 0 });
    const lista = [cerradoAyer, abiertoDesdeAntes, pedidoAyerYCerradoHoy, posterior];
    expect(actividadDelPeriodo(lista, ayer, AHORA).map((e) => e.id).sort()).toEqual([cerradoAyer.id, pedidoAyerYCerradoHoy.id].sort());
    expect(abiertosAlCierre(lista, ayer)).toBe(2);
  });

  it('compara con el período anterior', () => {
    expect(textoVariacion(12, 10, 'semana')).toBe('+20% vs la semana pasada');
    expect(textoVariacion(5, 10, 'dia')).toBe('-50% vs ayer');
    expect(textoVariacion(3, 0, 'mes')).toBe('');
    expect(textoVariacion(0, 0, 'mes')).toBe('');
  });
});

describe('El día de trabajo depende de si ya se retiró', () => {
  it('un envío ya en reparto no queda oculto aunque su retiro estuviera programado a futuro', () => {
    const enReparto = envio({ creado: 0, estado: 'En reparto', fechaRetiro: ymd(-2) });
    expect(esFuturo(enReparto, AHORA)).toBe(false);
    expect(actividadDelPeriodo([enReparto], 'hoy', AHORA)).toHaveLength(1);
  });

  it('antes del retiro, programado a futuro no aparece hoy; y uno viejo ya retirado sí es arrastrado', () => {
    expect(actividadDelPeriodo([envio({ creado: 1, fechaRetiro: ymd(-2) })], 'hoy', AHORA)).toHaveLength(0);
    expect(actividadDelPeriodo([envio({ creado: 0, fechaRetiro: ymd(-2) })], 'hoy', AHORA)).toHaveLength(1);
    expect(esArrastrado(envio({ creado: 3, estado: 'Retirado' as Envio['estado'], fechaRetiro: ymd(3) }), AHORA)).toBe(true);
  });
});
