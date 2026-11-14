import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
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
        [attr.autocomplete]="autocompletar()" [class.is-invalid]="mensajeError()" />
      <button type="button" class="btn btn-outline-secondary fx-eye" (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'" [attr.aria-pressed]="visible()">
        <i [class]="'bi bi-' + (visible() ? 'eye-slash' : 'eye')" aria-hidden="true"></i>
      </button>
    </div>
    @if (mensajeError(); as msg) {
      <div class="invalid-feedback d-block">{{ msg }}</div>
    }
    @if (medidor()) {
      @let e = evaluar();
      <div class="fx-fuerza" [attr.data-nivel]="e.fuerza" role="status">
        <span class="fx-fuerza-barras" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        <small>{{ niveles[e.fuerza] }}</small>
      </div>
      <ul class="fx-requisitos">
        <li [class.ok]="e.longitud"><i [class]="'bi bi-' + (e.longitud ? 'check-circle-fill' : 'circle')" aria-hidden="true"></i>Al menos 8 caracteres</li>
        <li [class.ok]="e.letra"><i [class]="'bi bi-' + (e.letra ? 'check-circle-fill' : 'circle')" aria-hidden="true"></i>Una letra</li>
        <li [class.ok]="e.numero"><i [class]="'bi bi-' + (e.numero ? 'check-circle-fill' : 'circle')" aria-hidden="true"></i>Un número</li>
      </ul>
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

  protected evaluar() {
    return evaluarClave(this.control().value ?? '');
  }

  protected mensajeError(): string {
    if (this.error()) return this.error();
    const c = this.control();
    if (!c.invalid || !(c.touched || c.dirty)) return '';
    if (c.hasError('required')) return 'Ingresá la contraseña.';
    if (c.hasError('clave')) return 'Mínimo 8 caracteres, con letras y números.';
    return 'Valor inválido.';
  }
}
