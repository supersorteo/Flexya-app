import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'fx-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-empty">
      <span class="fx-empty-icono"><i [class]="'bi bi-' + icono()" aria-hidden="true"></i></span>
      <strong class="fx-empty-titulo">{{ titulo() }}</strong>
      @if (descripcion()) {
        <p>{{ descripcion() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class Empty {
  readonly icono = input('inbox');
  readonly titulo = input.required<string>();
  readonly descripcion = input('');
}
