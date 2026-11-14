import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

const DEMOS = [{ label: 'Superadmin', email: 'admin@flexya.com', icon: 'shield-check' }];

@Component({
  selector: 'fx-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-login">
      <div class="fx-login-card">
        <div class="fx-brand mb-4">
          <span class="fx-brand-mark"><i></i><i></i><i></i></span>
          <span class="fx-brand-name">flexya</span>
        </div>
        <h1 class="h4 mb-1">Iniciá sesión</h1>
        <p class="fx-muted">Operaciones que fluyen, de la recepción a la entrega.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="mb-3">
            <label class="form-label" for="email">Email</label>
            <input id="email" type="email" class="form-control" formControlName="email"
              autocomplete="username" inputmode="email" [class.is-invalid]="invalid('email')" />
            @if (invalid('email')) {
              <div class="invalid-feedback">Ingresá un email válido.</div>
            }
          </div>
          <div class="mb-3">
            <label class="form-label" for="password">Contraseña</label>
            <input id="password" type="password" class="form-control" formControlName="password"
              autocomplete="current-password" [class.is-invalid]="invalid('password')" />
            @if (invalid('password')) {
              <div class="invalid-feedback">Ingresá tu contraseña.</div>
            }
          </div>
          @if (error()) {
            <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
          }
          <button type="submit" class="btn btn-primary w-100">Ingresar</button>
        </form>

        <hr class="my-4" />
        <div class="fx-eyebrow">ACCESO RÁPIDO</div>
        <div class="d-grid gap-2">
          @for (d of demos; track d.email) {
            <button type="button" class="btn btn-outline-secondary" (click)="entrar(d.email)">
              <i [class]="'bi bi-' + d.icon" aria-hidden="true"></i>Entrar como {{ d.label }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly demos = DEMOS;
  protected readonly error = signal('');
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected invalid(name: 'email' | 'password') {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.ingresar(email, password);
  }

  protected entrar(email: string) {
    this.ingresar(email, '123456');
  }

  private ingresar(email: string, password: string) {
    const user = this.auth.login(email, password);
    if (!user) {
      this.error.set('Email o contraseña incorrectos.');
      return;
    }
    this.router.navigate([this.auth.homeFor(user.rol)]);
  }
}
