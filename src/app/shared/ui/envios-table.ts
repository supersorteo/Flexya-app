import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Envio } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AlertService } from '../../core/services/alert.service';
import { AccionesEnvio } from '../../core/services/envio-acciones';
import { StatusPill } from './ui';

@Component({
  selector: 'fx-envios-table',
  imports: [StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="fx-table">
      <thead>
        <tr>
          <th>Envío</th>
          @if (rol() !== 'cliente') {
            <th>Cliente</th>
          }
          <th>Destinatario</th>
          <th>Destino</th>
          @if (rol() === 'admin') {
            <th>Mensajero</th>
          }
          <th>Estado</th>
          @if (acciones()) {
            <th>Acciones</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (e of envios(); track e.id) {
          <tr>
            <td data-label="Envío"><strong>{{ e.id }}</strong></td>
            @if (rol() !== 'cliente') {
              <td data-label="Cliente">{{ data.nombreCliente(e.clienteId) }}</td>
            }
            <td data-label="Destinatario">{{ e.destinatario }}</td>
            <td data-label="Destino">{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></td>
            @if (rol() === 'admin') {
              <td data-label="Mensajero">{{ data.nombreMensajero(e.mensajeroId) }}</td>
            }
            <td data-label="Estado"><fx-status [estado]="e.estado" /></td>
            @if (acciones()) {
              <td data-label="Acciones" class="fx-actions">
                @if (rol() === 'admin' && e.estado === 'Pendiente') {
                  <button type="button" class="btn btn-sm btn-primary" (click)="recepcionar(e)">Recepcionar</button>
                }
                @if (rol() === 'admin' && e.estado === 'En depósito') {
                  @if (!data.mensajeros().length) {
                    <small class="fx-muted">Primero creá un mensajero.</small>
                  } @else {
                  <select #sel class="form-select form-select-sm" [attr.aria-label]="'Mensajero para ' + e.id">
                    @for (m of mensajerosPara(e); track m.id) {
                      <option [value]="m.id">{{ m.nombre }} · {{ data.nombreZona(m.zonaId) }}{{ m.zonaId === e.zonaId ? ' (zona)' : '' }}</option>
                    }
                  </select>
                  <button type="button" class="btn btn-sm btn-primary" (click)="asignar(e, sel.value)">Asignar</button>
                  }
                }
                @if (rol() === 'mensajero' && e.estado === 'En reparto') {
                  <button type="button" class="btn btn-sm btn-primary" (click)="entregar(e)">Entregado</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="incidencia(e)">Incidencia</button>
                }
              </td>
            }
          </tr>
        } @empty {
          <tr class="fx-empty">
            <td colspan="7">
              <div class="text-center fx-muted py-4">
                <i class="bi bi-inbox fs-2 d-block mb-2"></i>No hay envíos para mostrar.
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class EnviosTable {
  protected readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly accionesEnvio = inject(AccionesEnvio);
  private readonly auth = inject(AuthService);

  readonly envios = input.required<Envio[]>();
  readonly acciones = input(false);
  protected readonly rol = () => this.auth.user()?.rol;

  protected mensajerosPara(e: Envio) {
    const todos = this.data.mensajeros();
    return [...todos.filter((m) => m.zonaId === e.zonaId), ...todos.filter((m) => m.zonaId !== e.zonaId)];
  }

  protected recepcionar(e: Envio) {
    this.data.recepcionar(e.id);
    this.alert.exito(`${e.id} recepcionado en depósito`);
  }

  protected asignar(e: Envio, mensajeroId: string) {
    this.data.asignar(e.id, mensajeroId);
    this.alert.exito(`${e.id} asignado a ${this.data.nombreMensajero(mensajeroId)}`);
  }

  protected entregar(e: Envio) {
    void this.accionesEnvio.entregar(e);
  }

  protected incidencia(e: Envio) {
    void this.accionesEnvio.incidencia(e);
  }
}
