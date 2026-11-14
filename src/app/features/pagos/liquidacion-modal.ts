import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { hoyISO } from '../../core/models';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'fx-liquidacion-modal',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header fx-modal-head">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-receipt" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">Generar liquidación</h2>
          <p class="fx-muted small mb-0">{{ data.nombreMensajero(mensajeroId) }}</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
    </div>
    <div class="modal-body fx-modal-body">
      <div class="row g-3">
        <div class="col-6">
          <label class="form-label" for="lq-desde">Desde</label>
          <input id="lq-desde" type="date" class="form-control" [ngModel]="desde()" (ngModelChange)="desde.set($event)" [max]="hasta()" />
        </div>
        <div class="col-6">
          <label class="form-label" for="lq-hasta">Hasta</label>
          <input id="lq-hasta" type="date" class="form-control" [ngModel]="hasta()" (ngModelChange)="hasta.set($event)" [min]="desde()" [max]="hoy" />
        </div>
      </div>

      <div class="fx-zone-card">
        <span class="fx-zone-icon"><i class="bi bi-cash-coin" aria-hidden="true"></i></span>
        <div>
          <strong>{{ moneda(bruto()) }}</strong>
          <small>{{ pendientes().length }} {{ pendientes().length === 1 ? 'comisión pendiente' : 'comisiones pendientes' }} en el período</small>
        </div>
      </div>

      <h3 class="fx-modal-section">Descuento (opcional)</h3>
      <div class="row g-3">
        <div class="col-12 col-md-7">
          <label class="form-label" for="lq-concepto">Concepto</label>
          <input id="lq-concepto" class="form-control" maxlength="60" placeholder="Ej. adelanto del 3/11" [ngModel]="concepto()" (ngModelChange)="concepto.set($event)" />
        </div>
        <div class="col-12 col-md-5">
          <label class="form-label" for="lq-monto">Monto</label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input id="lq-monto" type="number" min="0" step="1" class="form-control" [ngModel]="descuento()" (ngModelChange)="descuento.set($event)" />
          </div>
        </div>
      </div>
      @if (hayDescuento()) {
        <div class="form-text mt-2">A pagar: <strong>{{ moneda(neto()) }}</strong></div>
      }
    </div>
    <div class="modal-footer fx-modal-foot">
      <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">Cancelar</button>
      <button type="button" class="btn btn-primary" [disabled]="!pendientes().length || !valido()" (click)="generar()">
        <i class="bi bi-check2" aria-hidden="true"></i>Generar liquidación
      </button>
    </div>
  `,
})
export class LiquidacionModal {
  protected readonly modal = inject(NgbActiveModal);
  protected readonly data = inject(DataService);
  private readonly pesos = new CurrencyPipe('es-AR');

  mensajeroId = '';
  protected readonly hoy = hoyISO();
  protected readonly desde = signal(this.diasAtras(6));
  protected readonly hasta = signal(this.hoy);
  protected readonly concepto = signal('');
  protected readonly descuento = signal<number | null>(null);

  protected readonly pendientes = computed(() => this.data.pendientesDe(this.mensajeroId, this.desde(), this.hasta()));
  protected readonly bruto = computed(() => Math.round(this.pendientes().reduce((t, c) => t + c.monto, 0) * 100) / 100);
  protected readonly hayDescuento = computed(() => (this.descuento() ?? 0) > 0);
  protected readonly neto = computed(() => Math.round((this.bruto() - (this.descuento() ?? 0)) * 100) / 100);
  protected readonly valido = computed(() => {
    if (!this.desde() || !this.hasta() || this.desde() > this.hasta()) return false;
    if (!this.hayDescuento()) return true;
    return this.concepto().trim().length > 0 && (this.descuento() ?? 0) <= this.bruto();
  });

  protected moneda(n: number): string {
    return this.pesos.transform(n, 'ARS', 'symbol-narrow', '1.0-2') ?? '';
  }

  protected generar() {
    this.modal.close({
      desde: this.desde(),
      hasta: this.hasta(),
      ajuste: this.hayDescuento() ? { concepto: this.concepto().trim(), monto: this.descuento() ?? 0 } : undefined,
    });
  }

  private diasAtras(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return hoyISO(d);
  }
}
