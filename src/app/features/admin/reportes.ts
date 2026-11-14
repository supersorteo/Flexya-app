import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/services/data.service';
import { KpiCard, PageHeader } from '../../shared/ui/ui';

interface Barra {
  label: string;
  valor: number;
  pct: number;
}

function barras(conteo: Map<string, number>): Barra[] {
  const max = Math.max(1, ...conteo.values());
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, valor]) => ({ label, valor, pct: Math.round((valor / max) * 100) }));
}

@Component({
  selector: 'fx-reportes',
  imports: [PageHeader, KpiCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Reportes" subtitle="Métricas simples para tomar mejores decisiones." />

    <div class="fx-kpi-grid">
      <fx-kpi label="Envíos totales" [value]="total()" foot="registrados" icon="box-seam" tone="blue" />
      <fx-kpi label="Efectividad" [value]="efectividad() === null ? '—' : efectividad() + '%'" foot="entregados sobre cerrados" icon="check2-circle" tone="teal" />
      <fx-kpi label="Incidencias" [value]="incidencias()" foot="requieren seguimiento" icon="exclamation-triangle" tone="amber" />
      <fx-kpi label="Facturación" [value]="facturacion()" foot="envíos entregados" icon="cash-coin" tone="purple" />
    </div>

    <div class="row g-3">
      @for (g of grupos(); track g.titulo) {
        <div class="col-12 col-lg-4">
          <section class="fx-panel h-100">
            <div class="fx-panel-head"><div class="fx-panel-title">{{ g.titulo }}</div></div>
            <ul class="fx-bars">
              @for (b of g.items; track b.label) {
                <li>
                  <div class="d-flex justify-content-between small"><span>{{ b.label }}</span><strong>{{ b.valor }}</strong></div>
                  <div class="fx-bar"><div [style.width.%]="b.pct"></div></div>
                </li>
              } @empty {
                <li class="fx-muted small">Sin datos todavía.</li>
              }
            </ul>
          </section>
        </div>
      }
    </div>
  `,
})
export class Reportes {
  private readonly data = inject(DataService);

  protected readonly total = computed(() => this.data.envios().length);
  protected readonly incidencias = computed(() => this.data.envios().filter((e) => e.estado === 'Incidencia').length);
  protected readonly efectividad = computed(() => {
    const e = this.data.envios();
    const ok = e.filter((x) => x.estado === 'Entregado').length;
    const cerrados = ok + e.filter((x) => ['Incidencia', 'Cancelado'].includes(x.estado)).length;
    return cerrados ? Math.round((ok / cerrados) * 100) : null;
  });
  protected readonly facturacion = computed(() => {
    const suma = this.data.envios().filter((e) => e.estado === 'Entregado').reduce((s, e) => s + e.importe, 0);
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(suma);
  });

  protected readonly grupos = computed(() => {
    const por = (clave: (e: ReturnType<DataService['envios']>[number]) => string) => {
      const m = new Map<string, number>();
      this.data.envios().forEach((e) => m.set(clave(e), (m.get(clave(e)) ?? 0) + 1));
      return barras(m);
    };
    return [
      { titulo: 'Envíos por estado', items: por((e) => e.estado) },
      { titulo: 'Envíos por zona', items: por((e) => this.data.nombreZona(e.zonaId)) },
      { titulo: 'Envíos por cliente', items: por((e) => this.data.nombreCliente(e.clienteId)) },
    ];
  });
}
