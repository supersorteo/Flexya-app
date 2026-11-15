import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { evaluarClave } from '../forms/validators';

const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];

@Component({
  selector: 'fx-clave-field',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="form-label" [for]="inputId()">{{ etiqueta() }}</label>
    <div class="input-group">
      <span class="input-group-text"><i class="bi bi-lock" aria-hidden="true"></i></span>
      <input [id]="inputId()" class="form-control" [type]="visible() ? 'text' : 'password'" [formControl]="control()"
        [attr.autocomplete]="autocompletar()" [class.is-invalid]="invalido()" [attr.aria-invalid]="invalido()"
        [attr.aria-describedby]="invalido() ? inputId() + '-ayuda' : null" />
      <button type="button" class="btn btn-outline-secondary fx-eye" (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'" [attr.aria-pressed]="visible()">
        <i [class]="'bi bi-' + (visible() ? 'eye-slash' : 'eye')" aria-hidden="true"></i>
      </button>
    </div>
    @if (medidor() && escribio()) {
      <div class="fx-fuerza" [attr.data-nivel]="evaluacion().fuerza" role="status">
        <span class="fx-fuerza-barras" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        <small>{{ niveles[evaluacion().fuerza] }}</small>
      </div>
    }
    @if (invalido()) {
      <div class="fx-ayuda-error" [id]="inputId() + '-ayuda'" role="alert">
        @if (mensaje(); as msg) {
          <div class="fx-ayuda-msg"><i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i>{{ msg }}</div>
        }
        @if (faltantes().length) {
          <ul class="fx-requisitos">
            @for (f of faltantes(); track f) {
              <li><i class="bi bi-x-circle-fill" aria-hidden="true"></i>{{ f }}</li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class ClaveField {
  readonly control = input.required<FormControl<string>>();
  readonly etiqueta = input('Contraseña');
  readonly inputId = input.required<string>();
  readonly autocompletar = input<'new-password' | 'current-password'>('new-password');
  readonly medidor = input(false);
  readonly error = input('');

  protected readonly niveles = NIVELES;
  protected readonly visible = signal(false);

  /** Cambia con cada evento del control (valor, foco, envío del formulario) para que la vista se entere. */
  private readonly revision = signal(0);

  constructor() {
    effect((limpiar) => {
      const suscripcion = this.control().events.subscribe(() => this.revision.update((n) => n + 1));
      limpiar(() => suscripcion.unsubscribe());
    });
  }

  protected readonly escribio = computed(() => (this.revision(), (this.control().value ?? '').length > 0));
  protected readonly evaluacion = computed(() => (this.revision(), evaluarClave(this.control().value ?? '')));

  /** Los errores recién se muestran cuando la persona salió del campo (o intentó enviar), no mientras escribe por primera vez. */
  private readonly saleDelCampo = computed(() => (this.revision(), this.control().touched));

  protected readonly faltantes = computed(() => {
    if (!this.medidor() || !this.saleDelCampo() || !this.control().hasError('clave')) return [];
    const e = this.evaluacion();
    return [!e.longitud && 'Al menos 8 caracteres', !e.letra && 'Una letra', !e.numero && 'Un número'].filter((x): x is string => !!x);
  });

  protected readonly mensaje = computed(() => {
    if (this.error()) return this.error();
    if (!this.saleDelCampo()) return '';
    const c = this.control();
    if (c.hasError('required')) return 'Ingresá la contraseña.';
    if (c.hasError('clave') && !this.medidor()) return 'Mínimo 8 caracteres, con letras y números.';
    return c.invalid && !c.hasError('clave') ? 'Valor inválido.' : '';
  });

  protected readonly invalido = computed(() => !!this.mensaje() || this.faltantes().length > 0);
}
