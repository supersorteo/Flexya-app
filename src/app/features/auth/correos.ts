import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'fx-correos',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-bandeja">
      <header class="fx-bandeja-head">
        <div class="fx-brand">
          <span class="fx-brand-mark"><i></i><i></i><i></i></span>
          <span class="fx-brand-name">flexya</span>
        </div>
        <a routerLink="/login" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left"></i>Volver</a>
      </header>
      <h1 class="h4 mb-1">Bandeja de demostración</h1>
      <p class="fx-muted">Acá se ven los correos que el sistema enviaría. En producción llegan al correo real de cada persona.</p>

      @for (c of data.correos(); track c.id) {
        <article class="fx-panel fx-correo">
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <strong>{{ c.asunto }}</strong>
            <span [class]="'fx-status ' + (c.tipo === 'ACTIVACION' ? 'st-route' : 'st-deposit')">{{ c.tipo === 'ACTIVACION' ? 'Invitación' : 'Nueva contraseña' }}</span>
          </div>
          <small class="fx-muted d-block mb-2">Para: {{ c.nombre }} &lt;{{ c.para }}&gt; · {{ c.fecha | date: "d MMM y, HH:mm" }}</small>
          <p class="mb-3">{{ c.texto }}</p>
          <div class="d-flex gap-2 flex-wrap">
            <a class="btn btn-primary btn-sm" [href]="c.enlace"><i class="bi bi-box-arrow-up-right"></i>Abrir enlace</a>
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="copiar(c.id, c.enlace)">
              <i [class]="'bi bi-' + (copiado() === c.id ? 'check2' : 'clipboard')"></i>{{ copiado() === c.id ? 'Copiado' : 'Copiar enlace' }}
            </button>
          </div>
        </article>
      } @empty {
        <div class="fx-panel text-center fx-muted py-5 px-3">
          <i class="bi bi-envelope fs-2 d-block mb-2"></i>Todavía no se envió ningún correo.
        </div>
      }
    </div>
  `,
})
export class Correos {
  protected readonly data = inject(DataService);
  protected readonly copiado = signal('');

  protected async copiar(id: string, enlace: string) {
    try {
      await navigator.clipboard.writeText(enlace);
      this.copiado.set(id);
      setTimeout(() => this.copiado.set(''), 1500);
    } catch {
      /* el navegador no permitió copiar */
    }
  }
}
