import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CONFIG } from '../../core/config';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { claveValidator, coincidenValidator } from '../../shared/forms/validators';
import { ClaveField } from '../../shared/ui/clave-field';
import { PageHeader } from '../../shared/ui/ui';

const ROLES = { admin: 'Superadministrador', cliente: 'Cliente', mensajero: 'Mensajero' } as const;

@Component({
  selector: 'fx-cuenta',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, PageHeader, ClaveField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Mi cuenta" subtitle="Tus datos de acceso y la seguridad de tu cuenta." />

    @if (auth.user(); as u) {
      <div class="fx-detalle-grid fx-cuenta-grid">
        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Perfil</h2>
          <div class="fx-cuenta-resumen"><i class="bi bi-person-circle" aria-hidden="true"></i><div><strong>{{ u.nombre }}</strong><small>{{ u.email }}</small></div></div>
          <dl class="fx-datos">
            <div><dt>Rol</dt><dd>{{ roles[u.rol] }}</dd></div>
            <div><dt>Estado</dt><dd>Activa</dd></div>
            <div><dt>Miembro desde</dt><dd>{{ u.creadoEn | date: 'd MMM y' }}</dd></div>
            <div><dt>Último acceso</dt><dd>{{ u.ultimoAcceso ? (u.ultimoAcceso | date: 'd MMM, HH:mm') : '—' }}</dd></div>
          </dl>
          @if (u.rol === 'admin' && demo) {
            <a routerLink="/correos" class="btn btn-outline-secondary w-100 mt-3"><i class="bi bi-envelope"></i>Ver correos de demostración</a>
          }
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Cambiar contraseña</h2>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="mt-3">
            <div class="mb-3">
              <fx-clave-field inputId="cuenta-actual" etiqueta="Contraseña actual" autocompletar="current-password" [control]="form.controls.actual" [error]="errorActual()" />
            </div>
            <div class="mb-3">
              <fx-clave-field inputId="cuenta-nueva" etiqueta="Contraseña nueva" [medidor]="true" [control]="form.controls.nueva" [error]="errorNueva()" />
            </div>
            <div class="mb-3">
              <fx-clave-field inputId="cuenta-confirmar" etiqueta="Repetí la contraseña nueva" [control]="form.controls.confirmar" [error]="errorConfirmar()" />
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="cargando()">
              @if (cargando()) {
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              }
              Guardar contraseña
            </button>
          </form>
        </section>
      </div>
    }
  `,
})
export class Cuenta {
  protected readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly roles = ROLES;
  protected readonly demo = CONFIG.mostrarCorreosSimulados;
  protected readonly cargando = signal(false);
  private readonly externo = signal<{ campo: 'actual' | 'nueva'; texto: string } | null>(null);
  protected readonly form = this.fb.group(
    {
      actual: ['', Validators.required],
      nueva: ['', [Validators.required, claveValidator]],
      confirmar: ['', Validators.required],
    },
    { validators: coincidenValidator('nueva', 'confirmar') },
  );

  protected errorActual() {
    return this.externo()?.campo === 'actual' ? this.externo()!.texto : '';
  }

  protected errorNueva() {
    return this.externo()?.campo === 'nueva' ? this.externo()!.texto : '';
  }

  protected errorConfirmar() {
    const c = this.form.controls.confirmar;
    if (this.form.hasError('noCoinciden') && (c.touched || c.dirty)) return 'Las contraseñas no coinciden.';
    return c.hasError('required') && c.touched ? 'Repetí la contraseña.' : '';
  }

  protected async submit() {
    this.externo.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    const { actual, nueva } = this.form.getRawValue();
    const r = await this.auth.cambiarClave(actual, nueva);
    this.cargando.set(false);
    if (r === 'ok') {
      this.form.reset();
      this.alert.exito('Contraseña actualizada.');
    } else if (r === 'actual') {
      this.externo.set({ campo: 'actual', texto: 'La contraseña actual no es correcta.' });
    } else if (r === 'igual') {
      this.externo.set({ campo: 'nueva', texto: 'La nueva contraseña tiene que ser distinta de la actual.' });
    } else if (r === 'clave') {
      this.externo.set({ campo: 'nueva', texto: 'Mínimo 8 caracteres, con letras y números.' });
    }
  }
}
