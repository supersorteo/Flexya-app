import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio } from '../../core/models';
import { QrEnvio } from '../../shared/ui/qr-envio';

/**
 * Solo el QR, grande y sin datos, para mostrarlo en la pantalla del celular cuando no hay impresora: el mensajero lo escanea
 * al retirar y ahí ve de quién es el paquete. Si el QR no se lee, también está el código para dictarlo o escribirlo a mano.
 */
@Component({
  selector: 'fx-qr-modal',
  imports: [QrEnvio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header fx-modal-head">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-qr-code-scan" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">QR del envío {{ envio.id }}</h2>
          <p class="fx-muted small mb-0">Mostráselo al mensajero para que lo escanee.</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
    </div>

    <div class="modal-body fx-modal-body">
      <div class="fx-qr-grande">
        <fx-qr [envio]="envio" />
        <strong class="fx-qr-numero">{{ envio.id }}</strong>
        <span class="fx-qr-codigo" aria-label="Código para escribir a mano">{{ codigoLegible() }}</span>
      </div>
      <div class="fx-verif info"><i class="bi bi-shield-check" aria-hidden="true"></i><div><strong>No muestra datos personales</strong><small>El QR solo abre el envío al escanearlo con la app de Flexya. Si no se lee, el mensajero puede escribir el código de arriba. Subí el brillo de la pantalla para que se lea mejor.</small></div></div>
    </div>

    <div class="modal-footer fx-modal-foot">
      <button type="button" class="btn btn-primary" (click)="modal.dismiss()">Listo</button>
    </div>
  `,
})
export class QrModal {
  protected readonly modal = inject(NgbActiveModal);

  envio!: Envio;

  protected codigoLegible(): string {
    return `${this.envio.codigo.slice(0, 4)}-${this.envio.codigo.slice(4)}`;
  }
}
