import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { EtiquetaEnvio } from '../../shared/ui/etiqueta-envio';
import { FORMATOS_ETIQUETA, FormatoEtiqueta, imprimirEtiquetas } from '../../shared/util/imprimir';

/** Vista previa e impresión de las etiquetas de uno o de todos los envíos de un retiro. */
@Component({
  selector: 'fx-etiquetas-modal',
  imports: [EtiquetaEnvio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header fx-modal-head fx-no-imprimir">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-qr-code" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">{{ titulo }}</h2>
          <p class="fx-muted small mb-0">{{ envios.length === 1 ? 'Imprimila y pegala en el paquete.' : 'Una etiqueta por paquete: imprimilas y pegá cada una en el suyo.' }}</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
    </div>

    <div class="modal-body fx-modal-body">
      <div class="fx-no-imprimir">
        <h3 class="fx-modal-section">Formato de impresión</h3>
        <div class="fx-plans fx-formatos" role="radiogroup" aria-label="Formato de impresión">
          @for (f of formatos; track f.id) {
            <label class="fx-plan" [class.selected]="formato() === f.id">
              <input type="radio" class="visually-hidden" name="formato" [checked]="formato() === f.id" (change)="formato.set(f.id)" />
              <strong>{{ f.nombre }}</strong>
              <small>{{ f.detalle }}</small>
            </label>
          }
        </div>
        <div class="fx-verif info mb-3"><i class="bi bi-info-circle" aria-hidden="true"></i><div><strong>Cómo se usa</strong><small>Quien retira o recibe el paquete escanea el QR con la app de Flexya y ve de quién es y sus datos. Si el QR no se lee, puede escribir el código que figura debajo.</small></div></div>
      </div>

      <div class="fx-etiquetas" [class.fx-etiquetas--a4]="formato() === 'a4'">
        @for (e of envios; track e.id) {
          <fx-etiqueta [envio]="e" [posicion]="posicion(e)" [total]="total(e)" />
        }
      </div>
    </div>

    <div class="modal-footer fx-modal-foot fx-no-imprimir">
      <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">Cerrar</button>
      <button type="button" class="btn btn-primary" (click)="imprimir()">
        <i class="bi bi-printer" aria-hidden="true"></i>Imprimir {{ envios.length === 1 ? 'la etiqueta' : envios.length + ' etiquetas' }}
      </button>
    </div>
  `,
})
export class EtiquetasModal {
  protected readonly modal = inject(NgbActiveModal);
  private readonly data = inject(DataService);

  envios: Envio[] = [];
  titulo = 'Etiqueta del envío';

  protected readonly formatos = FORMATOS_ETIQUETA;
  protected readonly formato = signal<FormatoEtiqueta>('a6');

  /** Los paquetes de un mismo retiro se numeran: "Paquete 2 de 3". */
  private delRetiro(e: Envio): Envio[] {
    return this.data
      .envios()
      .filter((x) => x.clienteId === e.clienteId && x.retiroId === e.retiroId && x.estado !== 'Borrador' && x.estado !== 'Cancelado')
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  protected total(e: Envio): number {
    return Math.max(1, this.delRetiro(e).length);
  }

  protected posicion(e: Envio): number {
    return Math.max(1, this.delRetiro(e).findIndex((x) => x.id === e.id) + 1);
  }

  protected imprimir() {
    imprimirEtiquetas(this.formato());
  }
}
