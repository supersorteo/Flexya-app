import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { enCursoMensajero, Envio } from '../../core/models';
import { StatusPill } from './ui';

@Component({
  selector: 'fx-jornada',
  imports: [RouterLink, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fx-jornada" aria-label="Tu ruta de hoy">
      <div class="fx-jornada-top">
        <div>
          <div class="fx-jornada-titulo">Tu ruta de hoy</div>
          <div class="fx-jornada-sub">{{ pendientes() ? pendientes() + (pendientes() === 1 ? ' parada por hacer' : ' paradas por hacer') : 'Sin paradas pendientes' }}</div>
        </div>
        <div class="fx-jornada-cifra"><strong>{{ hechas() }}</strong><span> de {{ total() }}</span></div>
      </div>
      <div class="fx-ruta" role="progressbar" [attr.aria-valuenow]="hechas()" aria-valuemin="0" [attr.aria-valuemax]="total()" [attr.aria-label]="hechas() + ' de ' + total() + ' paradas'">
        <div class="fx-ruta-linea"><span [style.width.%]="porcentaje()"></span></div>
        <div class="fx-ruta-nodos">
          @for (n of nodos(); track $index) {
            <i [class.hecho]="n"></i>
          }
        </div>
      </div>
      @if (proxima(); as p) {
        <a class="fx-proxima" [routerLink]="['/mensajero', 'envios', p.id]">
          <span class="fx-proxima-label">Próxima parada</span>
          <span class="fx-proxima-nombre">{{ p.destinatario }}</span>
          <span class="fx-proxima-dir"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i>{{ p.direccion }} · {{ p.localidad }}</span>
          <span class="fx-proxima-pie"><fx-status [estado]="p.estado" /><span class="fx-proxima-ir">Abrir<i class="bi bi-arrow-right" aria-hidden="true"></i></span></span>
        </a>
      } @else {
        <p class="fx-jornada-libre"><i class="bi bi-check2-circle" aria-hidden="true"></i>Todo al día. Cuando te asignen un envío aparece acá.</p>
      }
    </section>
  `,
})
export class Jornada {
  readonly envios = input.required<Envio[]>();

  private readonly activos = computed(() => this.envios().filter((e) => enCursoMensajero(e)));
  protected readonly pendientes = computed(() => this.activos().length);
  protected readonly hechas = computed(() => {
    const hoy = new Date().toDateString();
    return this.envios().filter((e) => e.estado === 'Entregado' && e.entregadoEn && new Date(e.entregadoEn).toDateString() === hoy).length;
  });
  protected readonly total = computed(() => this.hechas() + this.pendientes());
  protected readonly porcentaje = computed(() => (this.total() ? Math.round((this.hechas() / this.total()) * 100) : 0));
  protected readonly nodos = computed(() => Array.from({ length: Math.min(this.total(), 12) }, (_, i) => i < this.hechas()));
  protected readonly proxima = computed(() => {
    const a = this.activos();
    return a.find((e) => e.estado === 'En reparto') ?? a[0] ?? null;
  });
}
