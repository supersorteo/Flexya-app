import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { actividadDelPeriodo } from '../../core/periodos';
import { slugEstado } from '../../shared/ui/ui';
import { DataService } from '../../core/services/data.service';
import { PeriodoService } from '../../core/services/periodo.service';
import { calcularResumen } from '../dashboard/resumen-negocio';
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
      <fx-kpi label="Envíos del período" [value]="total()" foot="abiertos y cerrados" icon="box-seam" tone="blue" />
      <fx-kpi label="Efectividad" [value]="efectividad() === null ? '—' : efectividad() + '%'" foot="entregados sobre cerrados" icon="check2-circle" tone="teal" />
      <fx-kpi label="Incidencias" [value]="incidencias()" foot="ocurridas en el período" icon="exclamation-triangle" tone="amber" />
      <fx-kpi label="Facturación" [value]="facturacion()" foot="entregados en el período" icon="cash-coin" tone="purple" />
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
                  <div class="fx-bar"><div [style.width.%]="b.pct" [style.background]="g.titulo === 'Envíos por estado' ? colorEstado(b.label) : null"></div></div>
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

  private readonly per = inject(PeriodoService);
  private readonly delPeriodo = computed(() => actividadDelPeriodo(this.data.envios(), this.per.rango(), new Date()));
  private readonly resumen = computed(() =>
    calcularResumen(this.data.envios(), [], this.per.rango(), new Date(), { cliente: () => '', mensajero: () => '', zona: () => '' }),
  );

  protected colorEstado(estado: string): string {
    return `var(--fx-st-${slugEstado(estado)}-fg)`;
  }

  protected readonly total = computed(() => this.delPeriodo().length);
  protected readonly incidencias = computed(() => this.resumen().incidencias);
  protected readonly efectividad = computed(() => this.resumen().efectividad);
  protected readonly facturacion = computed(() =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(this.resumen().ingresos),
  );

  protected readonly grupos = computed(() => {
    const por = (clave: (e: ReturnType<DataService['envios']>[number]) => string) => {
      const m = new Map<string, number>();
      this.delPeriodo().forEach((e) => m.set(clave(e), (m.get(clave(e)) ?? 0) + 1));
      return barras(m);
    };
    return [
      { titulo: 'Envíos por estado', items: por((e) => e.estado) },
      { titulo: 'Envíos por zona', items: por((e) => this.data.nombreZona(e.zonaId)) },
      { titulo: 'Envíos por cliente', items: por((e) => this.data.nombreCliente(e.clienteId)) },
    ];
  });
}
