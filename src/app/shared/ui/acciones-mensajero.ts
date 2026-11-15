import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Envio } from '../../core/models';
import { AccionesEnvio } from '../../core/services/envio-acciones';

@Component({
  selector: 'fx-acciones-mensajero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let e = envio();
    @switch (e.estado) {
      @case ('Retiro asignado') {
        <div [class]="clase()">
          <button type="button" class="btn btn-outline-secondary" (click)="diferencia()"><i class="bi bi-exclamation-triangle"></i>Diferencia</button>
          <button type="button" class="btn btn-outline-secondary" (click)="fallido()"><i class="bi bi-x-circle"></i>No pude retirar</button>
          <button type="button" class="btn btn-primary" (click)="retirar()"><i class="bi bi-box-seam"></i>Retiré</button>
        </div>
      }
      @case ('Retirado') {
        @if (e.retiro === 'recoleccion') {
          @if (!e.entregadoEnDepositoEn) {
            <div [class]="clase()">
              <button type="button" class="btn btn-primary" (click)="aDeposito()"><i class="bi bi-building"></i>Entregué en el depósito</button>
            </div>
          }
        } @else {
          <div [class]="clase()">
            <button type="button" class="btn btn-primary" (click)="salir()"><i class="bi bi-truck"></i>Salir a entregar</button>
          </div>
        }
      }
      @case ('En devolución') {
        @if (e.mensajeroId && !e.devolucionEntregadaEn) {
          <div [class]="clase()">
            <button type="button" class="btn btn-primary" (click)="devolucion()"><i class="bi bi-arrow-return-left"></i>Entregué la devolución</button>
          </div>
        }
      }
      @case ('En reparto') {
        <div [class]="clase()">
          <button type="button" class="btn btn-outline-secondary" (click)="incidencia()"><i class="bi bi-exclamation-triangle"></i>Incidencia</button>
          <button type="button" class="btn btn-primary" (click)="entregar()"><i class="bi bi-check2-circle"></i>{{ clase() === 'fx-barra-acciones' ? 'Marcar entregado' : 'Entregado' }}</button>
        </div>
      }
    }
  `,
})
export class AccionesMensajero {
  private readonly acciones = inject(AccionesEnvio);

  readonly envio = input.required<Envio>();
  readonly clase = input('fx-parada-acciones');

  protected retirar() {
    void this.acciones.retirar(this.envio());
  }

  protected aDeposito() {
    void this.acciones.entregarEnDeposito(this.envio());
  }

  protected salir() {
    this.acciones.salirAEntregar(this.envio());
  }

  protected fallido() {
    void this.acciones.retiroFallido(this.envio());
  }

  protected diferencia() {
    void this.acciones.diferenciaEnRetiro(this.envio());
  }

  protected devolucion() {
    void this.acciones.entregarDevolucion(this.envio());
  }

  protected entregar() {
    void this.acciones.entregar(this.envio());
  }

  protected incidencia() {
    void this.acciones.incidencia(this.envio());
  }
}
