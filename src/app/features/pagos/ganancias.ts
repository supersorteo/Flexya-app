import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ETIQUETA_COMISION } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { KpiCard, PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-ganancias',
  imports: [PageHeader, KpiCard, DatePipe, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Mis ganancias" subtitle="Lo que ganaste por tus entregas y lo que ya te pagamos." />

    <div class="fx-kpi-grid">
      <fx-kpi label="Hoy" [value]="moneda(g().hoy)" foot="ganado hoy" icon="sun" tone="blue" />
      <fx-kpi label="Esta semana" [value]="moneda(g().semana)" foot="desde el lunes" icon="calendar-week" tone="teal" />
      <fx-kpi label="A cobrar" [value]="moneda(g().pendiente)" foot="todavía no pagado" icon="hourglass-split" tone="amber" />
      <fx-kpi label="Cobrado" [value]="moneda(g().cobrado)" foot="liquidaciones pagadas" icon="cash-coin" tone="purple" />
    </div>

    <section class="fx-panel">
      <div class="fx-panel-head"><div class="fx-panel-title">Detalle</div><span class="fx-muted small">{{ filas().length }} movimientos</span></div>
      @if (filas().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Detalle de ganancias">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Envío</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>
              @for (c of filas(); track c.id) {
                <tr>
                  <td data-label="Fecha">{{ c.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                  <td data-label="Concepto">{{ etiqueta[c.concepto] }}</td>
                  <td data-label="Envío">{{ c.envioId }}</td>
                  <td data-label="Monto"><strong>{{ c.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
                  <td data-label="Estado"><span [class]="'fx-status ' + (data.estadoComision(c) === 'Pagada' ? 'st-delivered' : 'st-pending')">{{ data.estadoComision(c) }}</span></td>
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
  private readonly pesos = new CurrencyPipe('es-AR');
  protected readonly etiqueta = ETIQUETA_COMISION;

  protected readonly g = computed(() => this.data.gananciasDe(this.auth.user()?.mensajeroId ?? ''));
  protected readonly filas = computed(() => this.data.comisionesDe(this.auth.user()));

  protected moneda(n: number): string {
    return this.pesos.transform(n, 'ARS', 'symbol-narrow', '1.0-2') ?? '';
  }
}
