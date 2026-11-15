export interface Ganancias {
  hoy: number;
  semana: number;
  pendiente: number;
  acumulado: number;
  liquidado: number;
  cobrado: number;
  ultimoPago?: { importe: number; fecha: string } | null;
}

export interface TarjetaDinero {
  label: string;
  value: string;
  foot: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'purple';
}

export function detallePendiente(g: Pick<Ganancias, 'acumulado' | 'liquidado'>, pesos: (n: number) => string): string {
  if (g.liquidado > 0 && g.acumulado > 0) return `${pesos(g.liquidado)} por pagar y ${pesos(g.acumulado)} sin liquidar`;
  if (g.liquidado > 0) return 'Ya liquidado: falta que te lo paguen';
  if (g.acumulado > 0) return 'Lo que ganaste, todavía sin liquidar';
  return 'No tenés nada pendiente';
}

function diaMes(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function tarjetaGanancias(g: Ganancias, pesos: (n: number) => string): TarjetaDinero {
  if (g.pendiente > 0) {
    return { label: 'A cobrar', value: pesos(g.pendiente), foot: detallePendiente(g, pesos), icon: 'hourglass-split', tone: 'amber' };
  }
  if (g.ultimoPago) {
    const total = g.cobrado > g.ultimoPago.importe ? ` · ${pesos(g.cobrado)} en total` : '';
    return { label: 'Cobrado', value: pesos(g.ultimoPago.importe), foot: `Pagado el ${diaMes(g.ultimoPago.fecha)}${total}`, icon: 'check2-circle', tone: 'teal' };
  }
  return { label: 'A cobrar', value: pesos(0), foot: 'Aparece cuando completes una entrega', icon: 'hourglass-split', tone: 'purple' };
}
