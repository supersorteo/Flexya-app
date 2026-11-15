import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { etiquetaRango, Rango, subrangos } from '../../core/periodos';
import { Envio } from '../../core/models';
import { calcularResumen } from '../../features/dashboard/resumen-negocio';

@Component({
  selector: 'fx-desglose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filas().length) {
      <section class="fx-panel fx-desglose mb-4" aria-label="Cómo se compuso el período">
        <div class="fx-panel-head">
          <div>
            <div class="fx-panel-title">{{ rango().nivel === 'semana' ? 'Día por día' : 'Semana por semana' }}</div>
            <div class="fx-muted small">Entregados y solicitados; la suma de las filas es el total del período</div>
          </div>
        </div>
        <ul class="fx-bars">
          @for (f of filas(); track f.etiqueta) {
            <li>
              <span class="fx-desglose-et">{{ f.etiqueta }}</span>
              <span class="fx-bar"><span [style.width.%]="f.pct"></span></span>
              <span class="fx-desglose-n"><strong>{{ f.entregados }}</strong> / {{ f.solicitados }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class Desglose {
  readonly envios = input.required<Envio[]>();
  readonly rango = input.required<Rango>();

  protected readonly filas = computed(() => {
    const ahora = new Date();
    const nombres = { cliente: () => '', mensajero: () => '', zona: () => '' };
    const datos = subrangos(this.rango()).map((r) => {
      const c = calcularResumen(this.envios(), [], r, ahora, nombres);
      return { etiqueta: r.nivel === 'dia' ? etiquetaRango(r, ahora).replace(/^(Hoy|Ayer) · /, '') : etiquetaRango({ ...r, nivel: 'semana' }, ahora).replace(/^Esta semana · /, ''), entregados: c.entregados, solicitados: c.solicitados };
    });
    const max = Math.max(1, ...datos.map((d) => Math.max(d.entregados, d.solicitados)));
    return datos.map((d) => ({ ...d, pct: d.entregados ? Math.max(4, Math.round((d.entregados / max) * 100)) : 0 }));
  });
}
