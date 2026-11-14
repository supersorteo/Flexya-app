import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TipoToken, Usuario } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { claveValidator, coincidenValidator } from '../../shared/forms/validators';
import { AuthCard } from '../../shared/ui/auth-card';
import { ClaveField } from '../../shared/ui/clave-field';

const TEXTOS: Record<TipoToken, { titulo: string; subtitulo: string; boton: string; exito: string; invalido: string }> = {
  ACTIVACION: {
    titulo: 'Activá tu cuenta',
    subtitulo: 'Elegí la contraseña con la que vas a ingresar.',
    boton: 'Activar cuenta',
    exito: 'Cuenta activada. ¡Te damos la bienvenida a Flexya!',
    invalido: 'El enlace de la invitación venció o ya se usó. Pedile al administrador que te envíe una nueva.',
  },
  RECUPERACION: {
    titulo: 'Elegí una nueva contraseña',
    subtitulo: 'Escribí la contraseña nueva para tu cuenta.',
    boton: 'Guardar contraseña',
    exito: 'Contraseña actualizada. Ya podés ingresar.',
    invalido: 'El enlace venció o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña".',
  },
};

@Component({
  selector: 'fx-clave-enlace',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, ClaveField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-auth-card [titulo]="estado() === 'invalido' ? 'Enlace no válido' : textos().titulo" [subtitulo]="estado() === 'valido' ? textos().subtitulo : ''">
      @switch (estado()) {
        @case ('cargando') {
          <div class="text-center fx-muted py-4"><span class="spinner-border spinner-border-sm"></span> Verificando enlace…</div>
        }
        @case ('invalido') {
          <div class="alert alert-warning" role="alert">{{ textos().invalido }}</div>
          <a routerLink="/login" class="btn btn-outline-secondary w-100">Ir al inicio de sesión</a>
        }
        @case ('valido') {
          <div class="fx-cuenta-resumen"><i class="bi bi-person-circle" aria-hidden="true"></i><div><strong>{{ usuario()?.nombre }}</strong><small>{{ usuario()?.email }}</small></div></div>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="mb-3">
              <fx-clave-field inputId="enlace-clave" etiqueta="Contraseña nueva" [medidor]="true" [control]="form.controls.clave" />
            </div>
            <div class="mb-3">
              <fx-clave-field inputId="enlace-confirmar" etiqueta="Repetí la contraseña" [control]="form.controls.confirmar" [error]="errorConfirmar()" />
            </div>
            <button type="submit" class="btn btn-primary w-100" [disabled]="cargando()">
              @if (cargando()) {
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              }
              {{ textos().boton }}
            </button>
          </form>
        }
      }
    </fx-auth-card>
  `,
})
export class ClaveEnlace implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);

  readonly tipo = input.required<TipoToken>();
  readonly token = input.required<string>();
  protected readonly textos = computed(() => TEXTOS[this.tipo()]);
  protected readonly estado = signal<'cargando' | 'valido' | 'invalido'>('cargando');
  protected readonly usuario = signal<Usuario | null>(null);
  protected readonly cargando = signal(false);
  protected readonly form = this.fb.group(
    {
      clave: ['', [Validators.required, claveValidator]],
      confirmar: ['', Validators.required],
    },
    { validators: coincidenValidator('clave', 'confirmar') },
  );

  async ngOnInit() {
    const r = await this.auth.consultarToken(this.tipo(), this.token());
    this.usuario.set(r?.usuario ?? null);
    this.estado.set(r ? 'valido' : 'invalido');
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
    const { clave } = this.form.getRawValue();
    const r = this.tipo() === 'ACTIVACION' ? await this.auth.activar(this.token(), clave) : await this.auth.restablecer(this.token(), clave);
    this.cargando.set(false);
    if (r === 'invalido') {
      this.estado.set('invalido');
      return;
    }
    if (r === 'clave') return;
    this.alert.exito(this.textos().exito);
    const usuario = this.auth.user();
    void this.router.navigate([this.tipo() === 'ACTIVACION' && usuario ? this.auth.homeFor(usuario.rol) : '/login']);
  }
}
