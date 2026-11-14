import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CONFIG } from '../../core/config';
import { AuthService } from '../../core/services/auth.service';
import { emailValidator } from '../../shared/forms/validators';
import { AuthCard } from '../../shared/ui/auth-card';

@Component({
  selector: 'fx-olvide',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-auth-card titulo="Recuperá tu contraseña" [subtitulo]="enviado() ? '' : 'Ingresá tu correo y te enviamos un enlace para elegir una nueva.'">
      @if (enviado()) {
        <div class="fx-verif ok mt-0 mb-3">
          <i class="bi bi-envelope-check-fill" aria-hidden="true"></i>
          <div>
            <strong>Revisá tu correo</strong>
            <small>Si el correo está registrado, te enviamos un enlace para cambiar tu contraseña. Vence en {{ minutos }} minutos.</small>
          </div>
        </div>
        @if (demo) {
          <p class="small fx-muted">En esta demostración el correo no sale de la app: <a routerLink="/correos" class="fw-bold">abrí la bandeja de demostración</a>.</p>
        }
        <a routerLink="/login" class="btn btn-outline-secondary w-100">Volver al inicio de sesión</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="mb-3">
            <label class="form-label" for="olvide-email">Correo electrónico</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-envelope" aria-hidden="true"></i></span>
              <input id="olvide-email" type="email" class="form-control" formControlName="email" autocomplete="username"
                inputmode="email" placeholder="tu@correo.com" [class.is-invalid]="invalido()" />
            </div>
            @if (invalido()) {
              <div class="invalid-feedback d-block">Ingresá un correo válido.</div>
            }
          </div>
          <button type="submit" class="btn btn-primary w-100" [disabled]="cargando()">
            @if (cargando()) {
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            }
            Enviar enlace
          </button>
          <a routerLink="/login" class="btn btn-link w-100 mt-2 text-decoration-none">Volver al inicio de sesión</a>
        </form>
      }
    </fx-auth-card>
  `,
})
export class Olvide {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly demo = CONFIG.mostrarCorreosSimulados;
  protected readonly minutos = CONFIG.vigenciaRecuperacionMinutos;
  protected readonly enviado = signal(false);
  protected readonly cargando = signal(false);
  protected readonly form = this.fb.group({ email: ['', [Validators.required, emailValidator]] });

  protected invalido() {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || c.dirty);
  }

  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    await this.auth.solicitarRecuperacion(this.form.controls.email.value);
    this.cargando.set(false);
    this.enviado.set(true);
  }
}
