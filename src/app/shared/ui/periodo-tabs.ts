import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { etiquetaRango, incluyeAhora, mover, NIVELES, Nivel, Rango, rangoDe } from '../../core/periodos';

@Component({
  selector: 'fx-periodo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-periodo">
      <div class="fx-tabs fx-tabs--periodo" role="tablist" aria-label="Tipo de período">
        @for (n of niveles; track n.id) {
          <button type="button" role="tab" [class.active]="periodo().nivel === n.id" [attr.aria-selected]="periodo().nivel === n.id" (click)="elegir(n.id)">{{ n.etiqueta }}</button>
        }
      </div>
      <div class="fx-periodo-nav">
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Período anterior" title="Anterior" (click)="ir(-1)"><i class="bi bi-chevron-left"></i></button>
        <span class="fx-periodo-etiqueta" aria-live="polite">{{ etiqueta() }}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Período siguiente" title="Siguiente" [disabled]="esActual()" (click)="ir(1)"><i class="bi bi-chevron-right"></i></button>
        @if (!esActual()) {
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="hoy()">Hoy</button>
        }
      </div>
    </div>
  `,
})
export class PeriodoTabs {
  protected readonly niveles = NIVELES;
  readonly periodo = model<Rango>(rangoDe('dia', new Date()));

  protected readonly etiqueta = computed(() => etiquetaRango(this.periodo(), new Date()));
  protected readonly esActual = computed(() => incluyeAhora(this.periodo(), new Date()));

  protected elegir(nivel: Nivel) {
    const actual = this.periodo();
    if (actual.nivel === nivel) return;
    this.periodo.set(rangoDe(nivel, incluyeAhora(actual, new Date()) ? new Date() : actual.desde));
  }

  protected ir(pasos: number) {
    this.periodo.set(mover(this.periodo(), pasos));
  }

  protected hoy() {
    this.periodo.set(rangoDe(this.periodo().nivel, new Date()));
  }
}
