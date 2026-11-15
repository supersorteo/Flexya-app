import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoCuenta, EstadoEnvio } from '../../core/models';

@Component({
  selector: 'fx-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="fx-kpi">
      <div class="d-flex justify-content-between align-items-center fx-muted fw-semibold small">
        <span>{{ label() }}</span>
        <span [class]="'fx-kpi-icon tone-' + tone()"><i [class]="'bi bi-' + icon()" aria-hidden="true"></i></span>
      </div>
      <div class="fx-kpi-value">{{ value() }}</div>
      <div class="small fx-muted">{{ foot() }}</div>
    </article>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly foot = input('');
  readonly icon = input('box-seam');
  readonly tone = input<'blue' | 'teal' | 'amber' | 'purple'>('blue');
}

const ESTADO_PILL: Record<EstadoEnvio, { slug: string; icono: string }> = {
  Borrador: { slug: 'borrador', icono: 'pencil-square' },
  Pendiente: { slug: 'pendiente', icono: 'clock' },
  'Retiro asignado': { slug: 'retiro-asignado', icono: 'person-check' },
  Retirado: { slug: 'retirado', icono: 'box-seam' },
  'Retiro fallido': { slug: 'retiro-fallido', icono: 'x-octagon' },
  'En depósito': { slug: 'en-deposito', icono: 'building' },
  'En revisión': { slug: 'en-revision', icono: 'pause-circle' },
  'En reparto': { slug: 'en-reparto', icono: 'truck' },
  Incidencia: { slug: 'incidencia', icono: 'exclamation-triangle' },
  'En devolución': { slug: 'en-devolucion', icono: 'arrow-return-left' },
  Devuelto: { slug: 'devuelto', icono: 'check2-all' },
  Entregado: { slug: 'entregado', icono: 'check-circle' },
  Cancelado: { slug: 'cancelado', icono: 'x-circle' },
};

export const slugEstado = (estado: string) => ESTADO_PILL[estado as EstadoEnvio]?.slug ?? 'pendiente';

@Component({
  selector: 'fx-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'fx-status st-' + info().slug"><i [class]="'bi bi-' + info().icono" aria-hidden="true"></i>{{ estado() }}</span>`,
})
export class StatusPill {
  readonly estado = input.required<string>();
  protected readonly info = computed(() => ESTADO_PILL[this.estado() as EstadoEnvio] ?? { slug: 'pendiente', icono: 'circle' });
}

@Component({
  selector: 'fx-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-page-header">
      <div>
        @if (eyebrow()) {
          <div class="fx-eyebrow">{{ eyebrow() }}</div>
        }
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="fx-muted mb-0">{{ subtitle() }}</p>
        }
      </div>
      <div class="fx-page-actions"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly eyebrow = input('');
}

const CUENTA: Record<EstadoCuenta, { etiqueta: string; clase: string }> = {
  PENDIENTE: { etiqueta: 'Pendiente', clase: 'st-pending' },
  ACTIVO: { etiqueta: 'Activa', clase: 'st-delivered' },
  SUSPENDIDO: { etiqueta: 'Suspendida', clase: 'st-incident' },
};

@Component({
  selector: 'fx-cuenta-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'fx-status ' + datos().clase">{{ datos().etiqueta }}</span>`,
})
export class CuentaEstado {
  readonly estado = input.required<EstadoCuenta>();
  protected readonly datos = computed(() => CUENTA[this.estado()]);
}
