import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Identidad Flexya: monograma de movimiento y nombre adaptable al tema. */
@Component({
  selector: 'fx-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="fx-logo">
      <img src="brand/flexya-icon-128.webp" [width]="tamano()" [height]="tamano()"
        [alt]="texto() ? '' : 'Flexya'" class="fx-logo-icon" />
      @if (texto()) {
        <span class="fx-brand-name">flexya</span>
      }
    </span>
  `,
})
export class Logo {
  readonly tamano = input(28);
  readonly texto = input(true);
}
