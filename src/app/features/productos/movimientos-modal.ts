import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ETIQUETA_MOVIMIENTO, Producto } from '../../core/models';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'fx-movimientos-modal',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header fx-modal-head">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-clock-history" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">Movimientos de stock</h2>
          <p class="fx-muted small mb-0">{{ producto.nombre }} · {{ producto.stock }} en stock</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
    </div>
    <div class="modal-body fx-modal-body">
      @if (lista().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Movimientos de stock">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Saldo</th><th>Detalle</th></tr></thead>
            <tbody>
              @for (m of lista(); track m.id) {
                <tr>
                  <td data-label="Fecha">{{ m.creadoEn | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td data-label="Movimiento">{{ etiqueta[m.tipo] }}</td>
                  <td data-label="Cantidad"><strong [class.text-success]="m.cantidad > 0" [class.text-danger]="m.cantidad < 0">{{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}</strong></td>
                  <td data-label="Saldo">{{ m.saldo }}</td>
                  <td data-label="Detalle">
                    @if (m.envioId) { {{ m.envioId }} · {{ m.retiro === 'domicilio' ? 'retiro en domicilio' : 'vía depósito' }} } @else { <span class="fx-muted">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="fx-muted text-center py-4 mb-0">Todavía no hay movimientos de este producto.</p>
      }
    </div>
    <div class="modal-footer fx-modal-foot">
      <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">Cerrar</button>
    </div>
  `,
})
export class MovimientosModal {
  protected readonly modal = inject(NgbActiveModal);
  private readonly data = inject(DataService);
  protected readonly etiqueta = ETIQUETA_MOVIMIENTO;

  producto!: Producto;
  protected readonly lista = computed(() => this.data.movimientosDe(this.producto.id));
}
