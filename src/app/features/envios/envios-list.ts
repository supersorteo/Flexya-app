import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { CrearEnvio } from './crear-envio';
import { PageHeader } from '../../shared/ui/ui';

const ESTADOS = ['Todos', 'Borrador', 'Pendiente', 'Retiro asignado', 'Retirado', 'Retiro fallido', 'En depósito', 'En revisión', 'En reparto', 'Entregado', 'Incidencia', 'En devolución', 'Devuelto'];

@Component({
  selector: 'fx-envios-list',
  imports: [PageHeader, EnviosTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [title]="user()?.rol === 'admin' ? 'Envíos' : 'Mis envíos'" subtitle="Seguimiento de cada paquete, de la recepción a la entrega.">
      @if (user()?.rol === 'cliente') {
        <button type="button" class="btn btn-primary" (click)="nuevoEnvio()"><i class="bi bi-plus-lg"></i>Nuevo envío</button>
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
      @if (user()?.rol === 'cliente' && enRevision() > 0) {
        <div class="fx-verif warn mx-3 mt-3 mb-0">
          <i class="bi bi-pause-circle-fill" aria-hidden="true"></i>
          <div>
            <strong>{{ enRevision() }} {{ enRevision() === 1 ? 'envío en pausa' : 'envíos en pausa' }}</strong>
            <small>Lo que llegó a Flexya no coincide con lo declarado. Abrí el detalle para ver el motivo y corregilo o cancelalo.</small>
          </div>
        </div>
      }
      @if (user()?.rol === 'cliente' && porConfirmar() > 0) {
        <div class="fx-verif ok mx-3 mt-3 mb-0">
          <i class="bi bi-arrow-return-left" aria-hidden="true"></i>
          <div>
            <strong>{{ porConfirmar() }} {{ porConfirmar() === 1 ? 'paquete devuelto' : 'paquetes devueltos' }} esperando tu confirmación</strong>
            <small>Cuando lo tengas en tus manos, tocá "Recibí" para cerrarlo y recuperar las unidades en tu stock.</small>
          </div>
        </div>
      }
      <fx-envios-table [envios]="filtrados()" [acciones]="true" />
    </section>
  `,
})
export class EnviosList {
  private readonly data = inject(DataService);
  private readonly crear = inject(CrearEnvio);
  protected readonly user = inject(AuthService).user;
  protected readonly estados = ESTADOS;
  protected readonly q = signal('');
  protected readonly estado = signal('Todos');

  protected readonly enRevision = computed(() => this.data.enviosDe(this.user()).filter((e) => e.estado === 'En revisión').length);

  protected readonly porConfirmar = computed(() => this.data.enviosDe(this.user()).filter((e) => e.estado === 'En devolución' && !!e.devolucionEntregadaEn).length);

  protected nuevoEnvio() {
    this.crear.abrir();
  }

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
