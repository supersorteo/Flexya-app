import { Envio, fechaLocal, hoyISO } from './models';

export type Periodo = 'hoy' | '7d' | '30d' | 'todo';

export const PERIODOS: { id: Periodo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: '7d', etiqueta: '7 días' },
  { id: '30d', etiqueta: '30 días' },
  { id: 'todo', etiqueta: 'Todo' },
];

export function inicioPeriodo(periodo: Periodo, ahora: Date): Date {
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (periodo === 'todo') return new Date(0);
  if (periodo === '7d') dia.setDate(dia.getDate() - 6);
  if (periodo === '30d') dia.setDate(dia.getDate() - 29);
  return dia;
}

const CERRADOS: readonly Envio['estado'][] = ['Entregado', 'Cancelado', 'Devuelto'];
const tiempo = (iso?: string) => (iso ? new Date(iso).getTime() : Number.NaN);

export type Nivel = 'dia' | 'semana' | 'mes';

/** Período de calendario cerrado: desde incluido, hasta excluido (milisegundos). */
export interface Rango {
  nivel: Nivel;
  desde: number;
  hasta: number;
}

export const NIVELES: { id: Nivel; etiqueta: string }[] = [
  { id: 'dia', etiqueta: 'Día' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
];

const DIA_MS = 86_400_000;

/** La semana va de lunes a domingo. */
export function rangoDe(nivel: Nivel, ancla: Date | number): Rango {
  const a = new Date(ancla);
  const dia = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  if (nivel === 'dia') return { nivel, desde: dia.getTime(), hasta: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1).getTime() };
  if (nivel === 'semana') {
    const lunes = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - ((dia.getDay() + 6) % 7));
    return { nivel, desde: lunes.getTime(), hasta: new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 7).getTime() };
  }
  return { nivel, desde: new Date(dia.getFullYear(), dia.getMonth(), 1).getTime(), hasta: new Date(dia.getFullYear(), dia.getMonth() + 1, 1).getTime() };
}

export function mover(r: Rango, pasos: number): Rango {
  const d = new Date(r.desde);
  if (r.nivel === 'dia') return rangoDe('dia', new Date(d.getFullYear(), d.getMonth(), d.getDate() + pasos));
  if (r.nivel === 'semana') return rangoDe('semana', new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * pasos));
  return rangoDe('mes', new Date(d.getFullYear(), d.getMonth() + pasos, 1));
}

export const incluyeAhora = (r: Rango, ahora: Date) => r.desde <= ahora.getTime() && ahora.getTime() < r.hasta;
export const esPasado = (r: Rango, ahora: Date) => r.hasta <= ahora.getTime();

/** Los períodos de abajo que componen este: la semana en días, el mes en semanas (recortadas al mes). */
export function subrangos(r: Rango): Rango[] {
  if (r.nivel === 'dia') return [];
  const salida: Rango[] = [];
  if (r.nivel === 'semana') {
    for (let t = r.desde; t < r.hasta; ) {
      const d = rangoDe('dia', t);
      salida.push(d);
      t = d.hasta;
    }
    return salida;
  }
  for (let t = r.desde; t < r.hasta; ) {
    const sem = rangoDe('semana', t);
    salida.push({ nivel: 'semana', desde: Math.max(sem.desde, r.desde), hasta: Math.min(sem.hasta, r.hasta) });
    t = sem.hasta;
  }
  return salida;
}

const corto = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('es-AR', o).replace('.', '');

export function etiquetaRango(r: Rango, ahora: Date): string {
  if (r.nivel === 'dia') {
    const base = corto(r.desde, { weekday: 'short', day: 'numeric', month: 'short' });
    if (incluyeAhora(r, ahora)) return `Hoy · ${base}`;
    if (r.hasta === rangoDe('dia', ahora).desde) return `Ayer · ${base}`;
    return base;
  }
  if (r.nivel === 'semana') {
    const fin = r.hasta - DIA_MS;
    const mismoMes = new Date(r.desde).getMonth() === new Date(fin).getMonth();
    const rango = mismoMes
      ? `${new Date(r.desde).getDate()}–${corto(fin, { day: 'numeric', month: 'short' })}`
      : `${corto(r.desde, { day: 'numeric', month: 'short' })} – ${corto(fin, { day: 'numeric', month: 'short' })}`;
    return incluyeAhora(r, ahora) ? `Esta semana · ${rango}` : rango;
  }
  const mes = corto(r.desde, { month: 'long', year: 'numeric' });
  return incluyeAhora(r, ahora) ? `Este mes · ${mes}` : mes;
}

export const COMPARACION: Record<Nivel, string> = { dia: 'ayer', semana: 'la semana pasada', mes: 'el mes pasado' };

export function textoVariacion(actual: number, anterior: number, nivel: Nivel): string {
  if (!anterior) return actual ? `sin datos ${nivel === 'dia' ? 'ayer' : 'antes'}` : '';
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  return `${pct > 0 ? '+' : ''}${pct}% vs ${COMPARACION[nivel]}`;
}

/** Acepta un período de calendario o uno de los atajos heredados (hoy, 7d, 30d, todo). */
export function aRango(p: Periodo | Rango, ahora: Date): { desde: number; hasta: number } {
  if (typeof p !== 'string') return { desde: p.desde, hasta: p.hasta };
  return { desde: inicioPeriodo(p, ahora).getTime(), hasta: p === 'todo' ? Number.POSITIVE_INFINITY : rangoDe('dia', ahora).hasta };
}

const diaMs = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export const estaAbierto = (e: Pick<Envio, 'estado'>) => e.estado !== 'Borrador' && !CERRADOS.includes(e.estado);

/** Día en que ese envío debía trabajarse: la fecha de retiro acordada mientras no se retiró; después, el día en que se pidió. */
const ANTES_DEL_RETIRO: readonly Envio['estado'][] = ['Pendiente', 'Retiro asignado', 'Retiro fallido'];
export const diaDeTrabajo = (e: Pick<Envio, 'estado' | 'fechaRetiro' | 'creadoEn'>): string =>
  ANTES_DEL_RETIRO.includes(e.estado) && e.fechaRetiro ? e.fechaRetiro : fechaLocal(e.creadoEn);

/** Abierto y con su día de trabajo ya pasado: es trabajo de otro día que quedó sin resolver. */
export const esArrastrado = (e: Envio, ahora: Date) => estaAbierto(e) && diaDeTrabajo(e) < hoyISO(ahora);

/** Abierto, pero programado para un día futuro: todavía no le toca. */
export const esFuturo = (e: Envio, ahora: Date) => estaAbierto(e) && diaDeTrabajo(e) > hoyISO(ahora);

export function fechaCierre(e: Envio): number {
  if (e.estado === 'Entregado') return tiempo(e.entregadoEn);
  const hito = [...(e.historial ?? [])].reverse().find((h) => h.estado === e.estado);
  return tiempo(hito?.fecha);
}

/**
 * Lo que se trabaja en el período: todo lo abierto que ya le toca (incluido lo arrastrado de días anteriores,
 * que va primero) más lo que se cerró dentro del período. Lo cerrado en días anteriores no aparece.
 */
export function actividadDelPeriodo(envios: Envio[], periodo: Periodo | Rango, ahora: Date): Envio[] {
  const { desde, hasta } = aRango(periodo, ahora);
  const actual = hasta > ahora.getTime();
  const lista = envios.filter((e) => {
    if (e.estado === 'Borrador') return false;
    const cierre = fechaCierre(e);
    const cerradoDentro = cierre >= desde && cierre < hasta;
    if (!actual) return cerradoDentro || (tiempo(e.creadoEn) >= desde && tiempo(e.creadoEn) < hasta);
    if (estaAbierto(e)) return diaMs(diaDeTrabajo(e)) < hasta;
    return cerradoDentro;
  });
  return lista.sort((a, b) => Number(esArrastrado(b, ahora)) - Number(esArrastrado(a, ahora)) || tiempo(b.creadoEn) - tiempo(a.creadoEn));
}

export const diasDeArrastre = (e: Envio, ahora: Date) =>
  Math.round((new Date(hoyISO(ahora)).getTime() - new Date(diaDeTrabajo(e)).getTime()) / 86_400_000);

export function etiquetaArrastre(e: Envio, ahora: Date): string | null {
  if (!esArrastrado(e, ahora)) return null;
  const d = diasDeArrastre(e, ahora);
  return d === 1 ? 'Viene de ayer' : `Viene de hace ${d} días`;
}

/** Cuántos envíos seguían abiertos al terminar el período, reconstruido con el historial de cada uno. */
export function abiertosAlCierre(envios: Envio[], r: Rango): number {
  return envios.filter((e) => e.estado !== 'Borrador' && tiempo(e.creadoEn) < r.hasta && !(fechaCierre(e) < r.hasta)).length;
}

export const enRango = (iso: string | undefined, r: { desde: number; hasta: number }) => {
  const t = tiempo(iso);
  return t >= r.desde && t < r.hasta;
};
