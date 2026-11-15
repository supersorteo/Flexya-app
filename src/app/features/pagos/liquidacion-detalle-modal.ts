import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ETIQUETA_COMISION, Liquidacion } from '../../core/models';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'fx-liquidacion-detalle-modal',
  imports: [DatePipe, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header fx-modal-head">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-receipt" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">{{ paraMensajero ? 'Recibo ' + liquidacion.id : liquidacion.id + ' · ' + liquidacion.estado }}</h2>
          <p class="fx-muted small mb-0">{{ paraMensajero ? 'Período' : data.nombreMensajero(liquidacion.mensajeroId) }} · {{ liquidacion.desde | date: 'dd/MM/yy' }} al {{ liquidacion.hasta | date: 'dd/MM/yy' }}</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
    </div>
    <div class="modal-body fx-modal-body">
      <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Comisiones de la liquidación">
        <table class="fx-table fx-table--filas">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Envío</th>@if (!paraMensajero) {<th>Base</th><th>%</th>}<th>Monto</th></tr></thead>
          <tbody>
            @for (c of comisiones(); track c.id) {
              <tr>
                <td data-label="Fecha">{{ c.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                <td data-label="Concepto">{{ etiqueta[c.concepto] }}</td>
                <td data-label="Envío">{{ c.envioId }}</td>
                @if (!paraMensajero) {
                  <td data-label="Base">{{ c.base | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</td>
                  <td data-label="%">{{ c.porcentaje }}%</td>
                }
                <td data-label="Monto"><strong>{{ c.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <dl class="fx-datos mt-3 mb-0">
        <div><dt>{{ paraMensajero ? 'Total de tus entregas' : 'Subtotal' }}</dt><dd>{{ liquidacion.bruto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</dd></div>
        @for (a of liquidacion.ajustes; track a.concepto) {
          <div><dt>{{ a.concepto }}</dt><dd>{{ a.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</dd></div>
        }
        <div><dt>{{ paraMensajero ? (liquidacion.estado === 'Pagada' ? 'Cobraste' : 'Vas a cobrar') : 'Neto a pagar' }}</dt><dd><strong>{{ liquidacion.neto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></dd></div>
        @if (liquidacion.pagadaEn) {
          <div><dt>Pagada</dt><dd>{{ liquidacion.pagadaEn | date: 'dd/MM/yy HH:mm' }} · {{ liquidacion.pago }}</dd></div>
        }
      </dl>
    </div>
    <div class="modal-footer fx-modal-foot">
      <button type="button" class="btn btn-primary" (click)="modal.dismiss()">Cerrar</button>
    </div>
  `,
})
export class LiquidacionDetalleModal {
  protected readonly modal = inject(NgbActiveModal);
  protected readonly data = inject(DataService);
  protected readonly etiqueta = ETIQUETA_COMISION;

  liquidacion!: Liquidacion;
  paraMensajero = false;
  protected readonly comisiones = computed(() => this.data.comisiones().filter((c) => this.liquidacion.comisionIds.includes(c.id)));
}
