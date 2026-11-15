import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Comision, Envio, Liquidacion, MAX_INTENTOS, fechaLocal, hoyISO } from '../../core/models';
import { aRango, inicioPeriodo, PERIODOS, Periodo, Rango } from '../../core/periodos';
import { DataService } from '../../core/services/data.service';
import { PeriodoService } from '../../core/services/periodo.service';
import { KpiCard } from '../../shared/ui/ui';

export { PERIODOS, inicioPeriodo };
export type { Periodo, Rango };

export interface FilaRanking {
  clave: string;
  nombre: string;
  cantidad: number;
  monto: number;
}

export interface ResumenNegocioDatos {
  solicitados: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  incidencias: number;
  efectividad: number | null;
  tiempoTotalMs: number | null;
  tiempoServicioMs: number | null;
  puntualidad: number | null;
  retirosHechos: number;
  ingresos: number;
  comisiones: number;
  margen: number;
  clientes: FilaRanking[];
  mensajeros: FilaRanking[];
  zonas: FilaRanking[];
}

export interface Nombres {
  cliente: (id: string) => string;
  mensajero: (id: string) => string;
  zona: (id: string) => string;
}

export interface Alerta {
  id: string;
  tono: 'danger' | 'warn' | 'info';
  icono: string;
  cantidad: number;
  texto: string;
  accion: string;
  enlace: string;
}

export function formatoDuracion(ms: number | null): string {
  if (ms === null) return '—';
  const horas = ms / 3_600_000;
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${(Math.round(horas * 10) / 10).toString().replace('.', ',')} h`;
  return `${(Math.round((horas / 24) * 10) / 10).toString().replace('.', ',')} días`;
}

const tiempo = (iso?: string) => (iso ? new Date(iso).getTime() : Number.NaN);
const hitos = (e: Envio) => e.historial ?? [];
const ultimoHito = (e: Envio, estado: Envio['estado']) => tiempo([...hitos(e)].reverse().find((h) => h.estado === estado)?.fecha);
const primerHito = (e: Envio, estado: Envio['estado']) => hitos(e).find((h) => h.estado === estado);
const promedio = (valores: number[]) => (valores.length ? valores.reduce((t, v) => t + v, 0) / valores.length : null);
const redondear = (n: number) => Math.round(n * 100) / 100;

function ranking(
  filas: Map<string, { cantidad: number; monto: number }>,
  nombre: (id: string) => string,
  orden: 'cantidad' | 'monto',
  tope = 5,
): FilaRanking[] {
  return [...filas.entries()]
    .map(([clave, v]) => ({ clave, nombre: nombre(clave), cantidad: v.cantidad, monto: redondear(v.monto) }))
    .sort((a, b) => b[orden] - a[orden] || b.cantidad - a.cantidad)
    .slice(0, tope);
}

export function calcularResumen(envios: Envio[], comisiones: Comision[], periodo: Periodo | Rango, ahora: Date, nombres: Nombres): ResumenNegocioDatos {
  const { desde, hasta } = aRango(periodo, ahora);
  const dentro = (t: number) => t >= desde && t < hasta;
  const reales = envios.filter((e) => e.estado !== 'Borrador');
  const solicitados = reales.filter((e) => dentro(tiempo(e.creadoEn)));
  const entregados = reales.filter((e) => e.estado === 'Entregado' && dentro(tiempo(e.entregadoEn)));
  const devueltos = reales.filter((e) => e.estado === 'Devuelto' && dentro(ultimoHito(e, 'Devuelto')));
  const cancelados = reales.filter((e) => e.estado === 'Cancelado' && dentro(ultimoHito(e, 'Cancelado')));
  const incidencias = reales.reduce((n, e) => n + hitos(e).filter((h) => h.estado === 'Incidencia' && dentro(tiempo(h.fecha))).length, 0);
  const cerrados = entregados.length + devueltos.length;

  const totales = entregados.map((e) => tiempo(e.entregadoEn) - tiempo(e.creadoEn)).filter(Number.isFinite);
  const servicios = entregados
    .map((e) => {
      const inicio = hitos(e).find((h) => h.estado === 'Retirado' || h.estado === 'En depósito');
      return inicio ? tiempo(e.entregadoEn) - tiempo(inicio.fecha) : Number.NaN;
    })
    .filter(Number.isFinite);

  const retiros = reales
    .filter((e) => e.retiro !== 'deposito' && e.fechaRetiro)
    .map((e) => ({ e, hito: primerHito(e, 'Retirado') }))
    .filter((r) => r.hito && dentro(tiempo(r.hito.fecha)));
  const puntuales = retiros.filter((r) => fechaLocal(r.hito!.fecha) <= r.e.fechaRetiro!).length;

  const ingresos = redondear(entregados.reduce((t, e) => t + e.importe, 0));
  const delPeriodo = comisiones.filter((c) => dentro(tiempo(c.fecha)));
  const totalComisiones = redondear(delPeriodo.reduce((t, c) => t + c.monto, 0));

  const porCliente = new Map<string, { cantidad: number; monto: number }>();
  const porZona = new Map<string, { cantidad: number; monto: number }>();
  for (const e of solicitados) {
    const entregado = e.estado === 'Entregado' ? e.importe : 0;
    const c = porCliente.get(e.clienteId) ?? { cantidad: 0, monto: 0 };
    porCliente.set(e.clienteId, { cantidad: c.cantidad + 1, monto: c.monto + entregado });
    const z = porZona.get(e.zonaId) ?? { cantidad: 0, monto: 0 };
    porZona.set(e.zonaId, { cantidad: z.cantidad + 1, monto: z.monto + entregado });
  }
  const porMensajero = new Map<string, { cantidad: number; monto: number }>();
  for (const c of delPeriodo) {
    const m = porMensajero.get(c.mensajeroId) ?? { cantidad: 0, monto: 0 };
    porMensajero.set(c.mensajeroId, { cantidad: m.cantidad + (c.concepto === 'ENTREGA' ? 1 : 0), monto: m.monto + c.monto });
  }

  return {
    solicitados: solicitados.length,
    entregados: entregados.length,
    devueltos: devueltos.length,
    cancelados: cancelados.length,
    incidencias,
    efectividad: cerrados ? Math.round((entregados.length / cerrados) * 100) : null,
    tiempoTotalMs: promedio(totales),
    tiempoServicioMs: promedio(servicios),
    puntualidad: retiros.length ? Math.round((puntuales / retiros.length) * 100) : null,
    retirosHechos: retiros.length,
    ingresos,
    comisiones: totalComisiones,
    margen: redondear(ingresos - totalComisiones),
    clientes: ranking(porCliente, nombres.cliente, 'cantidad'),
    mensajeros: ranking(porMensajero, nombres.mensajero, 'monto'),
    zonas: ranking(porZona, nombres.zona, 'cantidad'),
  };
}

export function calcularAlertas(
  envios: Envio[],
  comisiones: Comision[],
  liquidaciones: Liquidacion[],
  ahora: Date,
  puedeAsignarse: (e: Envio) => boolean,
): Alerta[] {
  const hoy = hoyISO(ahora);
  const reales = envios.filter((e) => e.estado !== 'Borrador');
  const retirosVencidos = reales.filter((e) => e.retiro !== 'deposito' && ['Pendiente', 'Retiro asignado', 'Retiro fallido'].includes(e.estado) && !!e.fechaRetiro && e.fechaRetiro < hoy);
  const llegadasAtrasadas = reales.filter((e) => e.retiro === 'deposito' && e.estado === 'Pendiente' && !!e.fechaRetiro && e.fechaRetiro < hoy);
  const porRecibir = reales.filter((e) => e.estado === 'Retirado' && e.retiro === 'recoleccion' && !!e.entregadoEnDepositoEn);
  const sinAsignar = reales.filter((e) => puedeAsignarse(e));
  const agotados = reales.filter((e) => e.estado === 'En depósito' && (e.intentos ?? 0) >= MAX_INTENTOS);
  const incidencias = reales.filter((e) => e.estado === 'Incidencia');
  const revisiones = reales.filter((e) => e.estado === 'En revisión');
  const devolucionesSinMensajero = reales.filter((e) => e.estado === 'En devolución' && !e.mensajeroId);
  const devolucionesSinConfirmar = reales.filter((e) => e.estado === 'En devolución' && !!e.devolucionEntregadaEn);
  const sinLiquidar = comisiones.filter((c) => !c.liquidacionId);
  const sinPagar = liquidaciones.filter((l) => l.estado === 'Generada');

  const pesos = (n: number) => `$ ${redondear(n).toLocaleString('es-AR')}`;
  const alertas: Alerta[] = [
    { id: 'retiros-vencidos', tono: 'danger', icono: 'alarm', cantidad: retirosVencidos.length, texto: retirosVencidos.length === 1 ? 'retiro con la fecha vencida' : 'retiros con la fecha vencida', accion: 'Ver envíos', enlace: '/admin/envios' },
    { id: 'llegadas-atrasadas', tono: 'warn', icono: 'hourglass-split', cantidad: llegadasAtrasadas.length, texto: llegadasAtrasadas.length === 1 ? 'paquete esperado en el depósito que no llegó' : 'paquetes esperados en el depósito que no llegaron', accion: 'Ver depósito', enlace: '/admin/deposito' },
    { id: 'por-recibir', tono: 'info', icono: 'inbox', cantidad: porRecibir.length, texto: porRecibir.length === 1 ? 'paquete que el mensajero entregó y esperan tu recepción' : 'paquetes que el mensajero entregó y esperan tu recepción', accion: 'Recepcionar', enlace: '/admin/deposito' },
    { id: 'sin-asignar', tono: 'info', icono: 'person-plus', cantidad: sinAsignar.length, texto: sinAsignar.length === 1 ? 'envío esperando mensajero' : 'envíos esperando mensajero', accion: 'Asignar', enlace: '/admin/envios' },
    { id: 'intentos-agotados', tono: 'danger', icono: 'x-octagon', cantidad: agotados.length, texto: agotados.length === 1 ? 'envío sin más intentos: hay que devolverlo' : 'envíos sin más intentos: hay que devolverlos', accion: 'Resolver', enlace: '/admin/deposito' },
    { id: 'incidencias', tono: 'warn', icono: 'exclamation-triangle', cantidad: incidencias.length, texto: incidencias.length === 1 ? 'incidencia esperando el reingreso al depósito' : 'incidencias esperando el reingreso al depósito', accion: 'Ver envíos', enlace: '/admin/envios' },
    { id: 'revisiones', tono: 'warn', icono: 'pause-circle', cantidad: revisiones.length, texto: revisiones.length === 1 ? 'envío en revisión por diferencias' : 'envíos en revisión por diferencias', accion: 'Ver depósito', enlace: '/admin/deposito' },
    { id: 'devoluciones-sin-mensajero', tono: 'info', icono: 'arrow-return-left', cantidad: devolucionesSinMensajero.length, texto: devolucionesSinMensajero.length === 1 ? 'devolución sin mensajero asignado' : 'devoluciones sin mensajero asignado', accion: 'Asignar', enlace: '/admin/envios' },
    { id: 'devoluciones-sin-confirmar', tono: 'info', icono: 'check2-circle', cantidad: devolucionesSinConfirmar.length, texto: devolucionesSinConfirmar.length === 1 ? 'devolución entregada que el cliente no confirmó' : 'devoluciones entregadas que el cliente no confirmó', accion: 'Ver envíos', enlace: '/admin/envios' },
    { id: 'sin-liquidar', tono: 'info', icono: 'receipt', cantidad: sinLiquidar.length, texto: `${sinLiquidar.length === 1 ? 'comisión sin liquidar' : 'comisiones sin liquidar'} (${pesos(sinLiquidar.reduce((t, c) => t + c.monto, 0))})`, accion: 'Liquidar', enlace: '/admin/pagos' },
    { id: 'sin-pagar', tono: 'warn', icono: 'cash-coin', cantidad: sinPagar.length, texto: `${sinPagar.length === 1 ? 'liquidación generada sin pagar' : 'liquidaciones generadas sin pagar'} (${pesos(sinPagar.reduce((t, l) => t + l.neto, 0))})`, accion: 'Pagar', enlace: '/admin/pagos' },
  ];
  return alertas.filter((a) => a.cantidad > 0);
}

@Component({
  selector: 'fx-alertas-admin',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fx-panel fx-alertas mb-4" aria-label="Requiere atención">
      <div class="fx-panel-head"><div class="fx-panel-title">Requiere atención</div></div>
      @if (alertas().length) {
        <ul class="fx-alertas-lista">
          @for (a of alertas(); track a.id) {
            <li [class]="'fx-alerta tono-' + a.tono">
              <i [class]="'bi bi-' + a.icono" aria-hidden="true"></i>
              <span><strong>{{ a.cantidad }}</strong> {{ a.texto }}</span>
              <a class="btn btn-sm btn-outline-secondary" [routerLink]="a.enlace">{{ a.accion }}</a>
            </li>
          }
        </ul>
      } @else {
        <p class="fx-muted mb-0 px-3 pb-3"><i class="bi bi-check-circle-fill text-success" aria-hidden="true"></i> Todo al día: no hay nada pendiente de tu decisión.</p>
      }
    </section>
  `,
})
export class AlertasAdmin {
  private readonly data = inject(DataService);
  protected readonly alertas = computed(() =>
    calcularAlertas(
      this.data.envios(),
      this.data.comisiones(),
      this.data.liquidaciones(),
      new Date(),
      (e) => this.data.puedeAsignarse(e),
    ),
  );
}

@Component({
  selector: 'fx-resumen-negocio',
  imports: [KpiCard, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mb-4" aria-label="Resumen del negocio">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 class="h6 mb-0">Resumen del negocio</h2>
      </div>

      <div class="fx-kpi-grid">
        <fx-kpi label="Envíos solicitados" [value]="r().solicitados" [foot]="r().cancelados + ' cancelados'" icon="box-seam" tone="blue" />
        <fx-kpi label="Entregados" [value]="r().entregados" [foot]="r().devueltos + ' devueltos'" icon="check2-circle" tone="teal" />
        <fx-kpi label="Efectividad" [value]="r().efectividad === null ? '—' : r().efectividad + '%'" foot="entregados sobre cerrados" icon="bullseye" tone="purple" />
        <fx-kpi label="Incidencias" [value]="r().incidencias" foot="en el período" icon="exclamation-triangle" tone="amber" />
        <fx-kpi label="Tiempo de entrega" [value]="duracion(r().tiempoTotalMs)" foot="desde que se pide" icon="clock-history" tone="blue" />
        <fx-kpi label="Tiempo de servicio" [value]="duracion(r().tiempoServicioMs)" foot="desde que Flexya lo recibe" icon="stopwatch" tone="teal" />
        <fx-kpi label="Retiros a tiempo" [value]="r().puntualidad === null ? '—' : r().puntualidad + '%'" [foot]="r().retirosHechos + ' retiros hechos'" icon="calendar-check" tone="purple" />
        <fx-kpi label="Margen de Flexya" [value]="(r().margen | currency: 'ARS' : 'symbol-narrow' : '1.0-0') ?? ''" [foot]="(r().ingresos | currency: 'ARS' : 'symbol-narrow' : '1.0-0') + ' de ingresos'" icon="graph-up-arrow" tone="amber" />
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-4">
          <section class="fx-panel h-100">
            <div class="fx-panel-head"><div class="fx-panel-title">Clientes con más envíos</div></div>
            <ul class="fx-bars">
              @for (f of r().clientes; track f.clave) {
                <li>
                  <div class="d-flex justify-content-between small"><span>{{ f.nombre }}</span><strong>{{ f.cantidad }}</strong></div>
                  <div class="fx-bar"><div [style.width.%]="pct(f.cantidad, r().clientes[0].cantidad)"></div></div>
                </li>
              } @empty {
                <li class="fx-muted small">Sin datos en este período.</li>
              }
            </ul>
          </section>
        </div>
        <div class="col-12 col-lg-4">
          <section class="fx-panel h-100">
            <div class="fx-panel-head"><div class="fx-panel-title">Mensajeros: lo ganado</div></div>
            <ul class="fx-bars">
              @for (f of r().mensajeros; track f.clave) {
                <li>
                  <div class="d-flex justify-content-between small"><span>{{ f.nombre }} · {{ f.cantidad }} {{ f.cantidad === 1 ? 'entrega' : 'entregas' }}</span><strong>{{ f.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</strong></div>
                  <div class="fx-bar"><div [style.width.%]="pct(f.monto, r().mensajeros[0].monto)"></div></div>
                </li>
              } @empty {
                <li class="fx-muted small">Sin entregas en este período.</li>
              }
            </ul>
          </section>
        </div>
        <div class="col-12 col-lg-4">
          <section class="fx-panel h-100">
            <div class="fx-panel-head"><div class="fx-panel-title">Zonas con más envíos</div></div>
            <ul class="fx-bars">
              @for (f of r().zonas; track f.clave) {
                <li>
                  <div class="d-flex justify-content-between small"><span>{{ f.nombre }}</span><strong>{{ f.cantidad }}</strong></div>
                  <div class="fx-bar"><div [style.width.%]="pct(f.cantidad, r().zonas[0].cantidad)"></div></div>
                </li>
              } @empty {
                <li class="fx-muted small">Sin datos en este período.</li>
              }
            </ul>
          </section>
        </div>
      </div>
    </section>
  `,
})
export class ResumenNegocio {
  private readonly data = inject(DataService);
  protected readonly periodo = inject(PeriodoService).rango;
  protected readonly duracion = formatoDuracion;

  protected readonly r = computed(() =>
    calcularResumen(this.data.envios(), this.data.comisiones(), this.periodo(), new Date(), {
      cliente: (id) => this.data.nombreCliente(id),
      mensajero: (id) => this.data.nombreMensajero(id),
      zona: (id) => this.data.nombreZona(id),
    }),
  );

  protected pct(valor: number, maximo: number): number {
    return maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
  }
}
