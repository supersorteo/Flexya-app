import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoEnvio } from '../../core/models';

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

const ESTADO_CLASE: Record<EstadoEnvio, string> = {
  Entregado: 'st-delivered',
  'En reparto': 'st-route',
  Pendiente: 'st-pending',
  'En depósito': 'st-deposit',
  Incidencia: 'st-incident',
  Cancelado: 'st-incident',
};

@Component({
  selector: 'fx-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'fx-status ' + clase()">{{ estado() }}</span>`,
})
export class StatusPill {
  readonly estado = input.required<string>();
  protected readonly clase = computed(() => ESTADO_CLASE[this.estado() as EstadoEnvio] ?? 'st-pending');
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
