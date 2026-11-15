import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Comision, ETIQUETA_COMISION, EstadoComision, Liquidacion } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { enRango } from '../../core/periodos';
import { DataService } from '../../core/services/data.service';
import { PeriodoService } from '../../core/services/periodo.service';
import { KpiCard, PageHeader } from '../../shared/ui/ui';
import { LiquidacionDetalleModal } from './liquidacion-detalle-modal';
import { detallePendiente } from './tarjeta-ganancias';

const ESTADO_PARA_MENSAJERO: Record<EstadoComision, string> = { Pendiente: 'Acumulado', Liquidada: 'Liquidado', Pagada: 'Cobrado' };

@Component({
  selector: 'fx-ganancias',
  imports: [PageHeader, KpiCard, DatePipe, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Mis ganancias" subtitle="Lo que vas a cobrar y lo que ya te pagaron." />

    <div class="fx-kpi-grid">
      <fx-kpi label="A cobrar" [value]="moneda(g().pendiente)" [foot]="detalle()" icon="hourglass-split" tone="amber" />
      <fx-kpi label="Ganado en el período" [value]="moneda(ganado())" [foot]="entregas() + (entregas() === 1 ? ' entrega' : ' entregas')" icon="graph-up-arrow" tone="blue" />
      <fx-kpi label="Cobrado en el período" [value]="moneda(cobradoPeriodo())" foot="pagos recibidos en el período" icon="wallet2" tone="teal" />
      <fx-kpi label="Ya cobrado en total" [value]="moneda(g().cobrado)" foot="todo lo que ya te pagaron" icon="check2-circle" tone="purple" />
    </div>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head">
        <div>
          <div class="fx-panel-title">Mis pagos</div>
          <div class="fx-muted small">Cada vez que Flexya te liquida lo acumulado, queda un recibo.</div>
        </div>
      </div>
      @if (pagos().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Mis pagos">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Pago</th><th>Período</th><th>Importe</th><th>Estado</th><th>Recibo</th></tr></thead>
            <tbody>
              @for (l of pagos(); track l.id) {
                <tr>
                  <td data-label="Pago"><strong>{{ l.id }}</strong>@if (l.pagadaEn) { <span class="fx-sub">Cobrado el {{ l.pagadaEn | date: 'dd/MM/yy' }}</span> }</td>
                  <td data-label="Período">{{ l.desde | date: 'dd/MM' }} al {{ l.hasta | date: 'dd/MM/yy' }}</td>
                  <td data-label="Importe"><strong>{{ l.neto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
                  <td data-label="Estado"><span [class]="'fx-status ' + (l.estado === 'Pagada' ? 'st-delivered' : 'st-pending')">{{ l.estado === 'Pagada' ? 'Cobrado' : 'Por cobrar' }}</span></td>
                  <td data-label="Recibo" class="fx-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" (click)="verRecibo(l)" [attr.aria-label]="'Ver el recibo de ' + l.id" title="Ver recibo"><i class="bi bi-receipt"></i><span class="d-none d-xl-inline">Ver recibo</span></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="text-center fx-muted py-4 px-3">Todavía no tenés pagos. Aparecen cuando Flexya te liquida lo acumulado.</div>
      }
    </section>

    <section class="fx-panel">
      <div class="fx-panel-head"><div class="fx-panel-title">Lo que ganaste en cada entrega</div><span class="fx-muted small">{{ filas().length }} movimientos</span></div>
      @if (filas().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Detalle de ganancias">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Envío</th><th>Ganaste</th><th>Estado</th></tr></thead>
            <tbody>
              @for (c of filas(); track c.id) {
                <tr>
                  <td data-label="Fecha">{{ c.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                  <td data-label="Concepto">{{ etiqueta[c.concepto] }}</td>
                  <td data-label="Envío">{{ c.envioId }}</td>
                  <td data-label="Ganaste"><strong>{{ c.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
                  <td data-label="Estado"><span [class]="'fx-status ' + (data.estadoComision(c) === 'Pagada' ? 'st-delivered' : 'st-pending')">{{ estado(c) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="text-center fx-muted py-5 px-3"><i class="bi bi-cash-coin fs-2 d-block mb-2"></i>Todavía no tenés ganancias. Aparecen cuando completás una entrega.</div>
      }
    </section>
  `,
})
export class Ganancias {
  protected readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly modals = inject(NgbModal);
  private readonly pesos = new CurrencyPipe('es-AR');
  protected readonly etiqueta = ETIQUETA_COMISION;

  protected readonly g = computed(() => this.data.gananciasDe(this.auth.user()?.mensajeroId ?? ''));
  private readonly per = inject(PeriodoService);
  protected readonly filas = computed(() => this.data.comisionesDe(this.auth.user()).filter((c) => enRango(c.fecha, this.per.rango())));
  protected readonly ganado = computed(() => Math.round(this.filas().reduce((t, c) => t + c.monto, 0) * 100) / 100);
  protected readonly entregas = computed(() => this.filas().filter((c) => c.concepto === 'ENTREGA').length);
  protected readonly pagos = computed(() =>
    this.data.liquidacionesDe(this.auth.user()).filter((l) => l.estado === 'Generada' || enRango(l.creadaEn, this.per.rango()) || enRango(l.pagadaEn, this.per.rango())),
  );
  protected readonly cobradoPeriodo = computed(() =>
    Math.round(this.data.liquidacionesDe(this.auth.user()).filter((l) => l.estado === 'Pagada' && enRango(l.pagadaEn, this.per.rango())).reduce((t, l) => t + l.neto, 0) * 100) / 100,
  );
  protected readonly detalle = computed(() => detallePendiente(this.g(), (n) => this.moneda(n)));

  protected moneda(n: number): string {
    return this.pesos.transform(n, 'ARS', 'symbol-narrow', '1.0-2') ?? '';
  }

  protected estado(c: Comision): string {
    return ESTADO_PARA_MENSAJERO[this.data.estadoComision(c)];
  }

  protected verRecibo(l: Liquidacion) {
    const ref = this.modals.open(LiquidacionDetalleModal, { centered: true, scrollable: true, size: 'lg', modalDialogClass: 'fx-modal', backdropClass: 'fx-backdrop' });
    ref.componentInstance.liquidacion = l;
    ref.componentInstance.paraMensajero = true;
    ref.result.then(() => undefined, () => undefined);
  }
}
