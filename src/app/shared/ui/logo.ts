import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** La marca: un recorrido que une dos paradas. La parada de destino lleva el naranja de acción. */
@Component({
  selector: 'fx-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="fx-logo">
      <svg [attr.width]="tamano()" [attr.height]="tamano()" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M7 25c0-9 18-6 18-17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        <circle cx="7" cy="25" r="3.2" fill="currentColor" />
        <circle cx="25" cy="7.5" r="4" class="fx-logo-destino" />
      </svg>
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
