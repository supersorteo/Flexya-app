import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LOCALIDADES, ZONAS, zonaDe } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AlertService } from '../../core/services/alert.service';
import { PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-nuevo-envio',
  imports: [ReactiveFormsModule, PageHeader, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Nuevo envío" subtitle="Completá los datos del destinatario. Lo recepcionamos en depósito y lo asignamos a un mensajero." />

    <section class="fx-panel fx-form-panel">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label" for="destinatario">Destinatario</label>
            <input id="destinatario" class="form-control" formControlName="destinatario" autocomplete="name"
              placeholder="Nombre y apellido" [class.is-invalid]="invalid('destinatario')" />
            @if (invalid('destinatario')) {
              <div class="invalid-feedback">Ingresá el nombre del destinatario.</div>
            }
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="telefono">Teléfono</label>
            <input id="telefono" type="tel" inputmode="tel" class="form-control" formControlName="telefono"
              autocomplete="tel" placeholder="11 5555 0000" [class.is-invalid]="invalid('telefono')" />
            @if (invalid('telefono')) {
              <div class="invalid-feedback">Ingresá un teléfono de al menos 8 dígitos.</div>
            }
          </div>
          <div class="col-12 col-md-8">
            <label class="form-label" for="direccion">Dirección de destino</label>
            <input id="direccion" class="form-control" formControlName="direccion" autocomplete="street-address"
              placeholder="Av. Corrientes 1234" [class.is-invalid]="invalid('direccion')" />
            @if (invalid('direccion')) {
              <div class="invalid-feedback">Ingresá la dirección.</div>
            }
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label" for="localidad">Localidad</label>
            <select id="localidad" class="form-select" formControlName="localidad">
              @for (z of zonas; track z.id) {
                <optgroup [label]="z.nombre">
                  @for (l of z.localidades; track l) {
                    <option [value]="l">{{ l }}</option>
                  }
                </optgroup>
              }
            </select>
            @if (zona(); as z) {
              <div class="form-text">{{ z.nombre }} · tarifa {{ z.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</div>
            }
          </div>
        </div>
        <div class="fx-form-actions">
          <a class="btn btn-outline-secondary" routerLink="/cliente/envios">Cancelar</a>
          <button type="submit" class="btn btn-primary">Crear envío</button>
        </div>
      </form>
    </section>
  `,
})
export class NuevoEnvio {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);

  protected readonly zonas = ZONAS;
  protected readonly form = this.fb.group({
    destinatario: ['', [Validators.required, Validators.minLength(3)]],
    telefono: ['', [Validators.required, Validators.pattern(/^[\d\s+()-]{8,}$/)]],
    direccion: ['', [Validators.required, Validators.minLength(4)]],
    localidad: ['Palermo', Validators.required],
  });
  private readonly localidad = toSignal(this.form.controls.localidad.valueChanges, { initialValue: 'Palermo' });
  protected readonly zona = computed(() => zonaDe(this.localidad()));

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return;
    const envio = this.data.crearEnvio(this.form.getRawValue(), clienteId);
    this.alert.exito(`Envío ${envio.id} creado correctamente`);
    this.router.navigate(['/cliente/envios']);
  }
}
