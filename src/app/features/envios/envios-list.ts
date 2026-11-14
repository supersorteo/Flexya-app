import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { PageHeader } from '../../shared/ui/ui';

const ESTADOS = ['Todos', 'Pendiente', 'En depósito', 'En reparto', 'Entregado', 'Incidencia'];

@Component({
  selector: 'fx-envios-list',
  imports: [PageHeader, EnviosTable, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [title]="user()?.rol === 'admin' ? 'Envíos' : 'Mis envíos'" subtitle="Seguimiento de cada paquete, de la recepción a la entrega.">
      @if (user()?.rol === 'cliente') {
        <a class="btn btn-primary" routerLink="/cliente/envios/nuevo"><i class="bi bi-plus-lg"></i>Nuevo envío</a>
      }
    </fx-page-header>

    <section class="fx-panel">
      <div class="fx-panel-head flex-wrap gap-2">
        <div class="fx-muted small">{{ filtrados().length }} registros</div>
        <div class="d-flex gap-2 flex-grow-1 justify-content-end fx-filters">
          <input type="search" class="form-control" placeholder="Buscar envío, destinatario…" aria-label="Buscar"
            [value]="q()" (input)="q.set($any($event.target).value)" />
          <select class="form-select" aria-label="Filtrar por estado" (change)="estado.set($any($event.target).value)">
            @for (s of estados; track s) {
              <option [value]="s">{{ s === 'Todos' ? 'Todos los estados' : s }}</option>
            }
          </select>
        </div>
      </div>
      <fx-envios-table [envios]="filtrados()" [acciones]="true" />
    </section>
  `,
})
export class EnviosList {
  private readonly data = inject(DataService);
  protected readonly user = inject(AuthService).user;
  protected readonly estados = ESTADOS;
  protected readonly q = signal('');
  protected readonly estado = signal('Todos');

  protected readonly filtrados = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.data
      .enviosDe(this.user())
      .filter((e) => this.estado() === 'Todos' || e.estado === this.estado())
      .filter(
        (e) =>
          !q ||
          [e.id, e.destinatario, e.direccion, e.localidad, this.data.nombreCliente(e.clienteId)]
            .join(' ')
            .toLowerCase()
            .includes(q),
      );
  });
}
