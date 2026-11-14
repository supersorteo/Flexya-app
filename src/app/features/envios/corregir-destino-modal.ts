import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio, ZONAS } from '../../core/models';
import { MaskDirective } from '../../shared/forms/mask.directive';
import { direccionEnvioValidator, formatearTelefono, telefonoNacional, telefonoValidator } from '../../shared/forms/validators';

@Component({
  selector: 'fx-corregir-destino-modal',
  imports: [ReactiveFormsModule, MaskDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i class="bi bi-geo-alt" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">Corregir datos de entrega</h2>
            <p class="fx-muted small mb-0">{{ envio.id }} · {{ envio.destinatario }}</p>
          </div>
        </div>
        <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.dismiss()"></button>
      </div>
      <div class="modal-body fx-modal-body">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label" for="cd-tel">Teléfono</label>
            <div class="fx-phone" [class.is-invalid]="invalido('telefono')">
              <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
              <input id="cd-tel" type="tel" inputmode="numeric" formControlName="telefono" fxMask="phone" autocomplete="off" placeholder="11 5555 0000" />
              <span class="fx-phone-count" aria-hidden="true">{{ form.controls.telefono.value.length }}/10</span>
            </div>
            @if (invalido('telefono')) { <div class="invalid-feedback d-block">Ingresá los 10 dígitos, sin 0 ni 15.</div> }
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="cd-loc">Localidad</label>
            <select id="cd-loc" class="form-select" formControlName="localidad" [class.is-invalid]="invalido('localidad')">
              <option value="" disabled>Seleccioná una localidad…</option>
              @for (z of zonas; track z.id) {
                <optgroup [label]="z.nombre">
                  @for (l of z.localidades; track l) { <option [value]="l">{{ l }}</option> }
                </optgroup>
              }
            </select>
            @if (invalido('localidad')) { <div class="invalid-feedback d-block">Seleccioná la localidad.</div> }
          </div>
          <div class="col-12">
            <label class="form-label" for="cd-dir">Dirección</label>
            <input id="cd-dir" class="form-control" formControlName="direccion" autocomplete="off" maxlength="120"
              placeholder="Av. Cabildo 1840, 3° B" [class.is-invalid]="invalido('direccion')" />
            @if (invalido('direccion')) { <div class="invalid-feedback d-block">Incluí la calle y la altura. Ej: Av. Cabildo 1840, 3° B.</div> }
          </div>
        </div>
      </div>
      <div class="modal-footer fx-modal-foot">
        <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>Guardar datos</button>
      </div>
    </form>
  `,
})
export class CorregirDestinoModal implements OnInit {
  protected readonly modal = inject(NgbActiveModal);
  private readonly fb = inject(NonNullableFormBuilder);

  envio!: Envio;
  protected readonly zonas = ZONAS;

  protected readonly form = this.fb.group({
    telefono: ['', [Validators.required, telefonoValidator]],
    localidad: ['', Validators.required],
    direccion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120), direccionEnvioValidator]],
  });

  ngOnInit() {
    this.form.setValue({ telefono: telefonoNacional(this.envio.telefono), localidad: this.envio.localidad, direccion: this.envio.direccion });
  }

  protected invalido(campo: 'telefono' | 'localidad' | 'direccion'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.modal.close({ telefono: formatearTelefono(v.telefono), localidad: v.localidad, direccion: v.direccion.trim().replace(/\s+/g, ' ') });
  }
}
