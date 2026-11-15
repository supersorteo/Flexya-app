import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CONFIG } from '../../core/config';
import { AuthService, ResultadoLogin } from '../../core/services/auth.service';
import { emailValidator } from '../../shared/forms/validators';
import { AuthCard } from '../../shared/ui/auth-card';
import { ClaveField } from '../../shared/ui/clave-field';

function mensaje(r: Extract<ResultadoLogin, { ok: false }>): string {
  switch (r.motivo) {
    case 'suspendida':
      return 'Tu cuenta está suspendida. Comunicate con el administrador.';
    case 'bloqueada': {
      const minutos = Math.max(1, Math.ceil((new Date(r.hasta ?? Date.now()).getTime() - Date.now()) / 60_000));
      return `Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`;
    }
    default:
      return 'Correo o contraseña incorrectos. Si todavía no activaste tu cuenta, usá el enlace de tu invitación.';
  }
}

@Component({
  selector: 'fx-login',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, ClaveField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-auth-card titulo="Iniciá sesión" subtitulo="Ingresá con tu correo y tu contraseña.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mb-3">
          <label class="form-label" for="email">Correo electrónico</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-envelope" aria-hidden="true"></i></span>
            <input id="email" type="email" class="form-control" formControlName="email" autocomplete="username"
              inputmode="email" placeholder="tu@correo.com" [class.is-invalid]="invalido('email')" />
          </div>
          @if (invalido('email')) {
            <div class="invalid-feedback d-block">Ingresá un correo válido.</div>
          }
        </div>
        <fx-clave-field inputId="login-clave" etiqueta="Contraseña" autocompletar="current-password" [control]="form.controls.clave" />
        <div class="text-end mt-2 mb-3">
          <a routerLink="/olvide" class="small fw-bold text-decoration-none">¿Olvidaste tu contraseña?</a>
        </div>
        @if (error()) {
          <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
        }
        <button type="submit" class="btn btn-primary w-100" [disabled]="cargando()">
          @if (cargando()) {
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          } @else {
            <i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>
          }
          Ingresar
        </button>
      </form>
      @if (demo) {
        <p class="small fx-muted text-center mt-4 mb-0">
          ¿Te invitaron y todavía no activaste tu cuenta? <a routerLink="/correos" class="fw-bold">Ver correos de demostración</a>
        </p>
      }
    </fx-auth-card>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly demo = CONFIG.mostrarCorreosSimulados;
  protected readonly error = signal('');
  protected readonly cargando = signal(false);
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, emailValidator]],
    clave: ['', Validators.required],
  });

  protected invalido(nombre: 'email') {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.error.set('');
    const { email, clave } = this.form.getRawValue();
    const r = await this.auth.login(email, clave);
    this.cargando.set(false);
    if (r.ok) {
      void this.router.navigate([this.auth.homeFor(r.usuario.rol)]);
      return;
    }
    this.error.set(mensaje(r));
    this.form.controls.clave.reset('');
  }
}
