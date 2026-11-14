import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { claveValidator, coincidenValidator, emailValidator, personaValidator } from '../../shared/forms/validators';
import { AuthCard } from '../../shared/ui/auth-card';
import { ClaveField } from '../../shared/ui/clave-field';

@Component({
  selector: 'fx-configuracion-inicial',
  imports: [ReactiveFormsModule, AuthCard, ClaveField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-auth-card titulo="Configuración inicial" subtitulo="Creá la cuenta del superadministrador. Desde ahí vas a manejar clientes, mensajeros y todo el negocio.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mb-3">
          <label class="form-label" for="cfg-nombre">Nombre y apellido</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-person" aria-hidden="true"></i></span>
            <input id="cfg-nombre" class="form-control" formControlName="nombre" autocomplete="name" placeholder="Ej. Marina Ríos"
              [class.is-invalid]="invalido('nombre')" />
          </div>
          @if (invalido('nombre')) {
            <div class="invalid-feedback d-block">Ingresá nombre y apellido, solo con letras.</div>
          }
        </div>
        <div class="mb-3">
          <label class="form-label" for="cfg-email">Correo electrónico</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-envelope" aria-hidden="true"></i></span>
            <input id="cfg-email" type="email" class="form-control" formControlName="email" autocomplete="username"
              inputmode="email" placeholder="tu@correo.com" [class.is-invalid]="invalido('email')" />
          </div>
          @if (invalido('email')) {
            <div class="invalid-feedback d-block">Ingresá un correo válido.</div>
          }
        </div>
        <div class="mb-3">
          <fx-clave-field inputId="cfg-clave" etiqueta="Contraseña" [medidor]="true" [control]="form.controls.clave" />
        </div>
        <div class="mb-3">
          <fx-clave-field inputId="cfg-confirmar" etiqueta="Repetí la contraseña" [control]="form.controls.confirmar" [error]="errorConfirmar()" />
        </div>
        @if (error()) {
          <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
        }
        <button type="submit" class="btn btn-primary w-100" [disabled]="cargando()">
          @if (cargando()) {
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          }
          Crear cuenta y entrar
        </button>
      </form>
    </fx-auth-card>
  `,
})
export class ConfiguracionInicial {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly error = signal('');
  protected readonly cargando = signal(false);
  protected readonly form = this.fb.group(
    {
      nombre: ['', [Validators.required, personaValidator]],
      email: ['', [Validators.required, emailValidator]],
      clave: ['', [Validators.required, claveValidator]],
      confirmar: ['', Validators.required],
    },
    { validators: coincidenValidator('clave', 'confirmar') },
  );

  protected invalido(nombre: 'nombre' | 'email') {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected errorConfirmar() {
    const c = this.form.controls.confirmar;
    if (this.form.hasError('noCoinciden') && (c.touched || c.dirty)) return 'Las contraseñas no coinciden.';
    return c.hasError('required') && c.touched ? 'Repetí la contraseña.' : '';
  }

  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    const { nombre, email, clave } = this.form.getRawValue();
    const usuario = await this.auth.configurarSuperadmin({ nombre, email, clave });
    this.cargando.set(false);
    if (!usuario) {
      this.error.set('No se pudo crear la cuenta. Revisá los datos e intentá de nuevo.');
      return;
    }
    void this.router.navigate([this.auth.homeFor(usuario.rol)]);
  }
}
