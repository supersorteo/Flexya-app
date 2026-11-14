import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'fx-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-login">
      <div class="fx-login-card">
        <div class="fx-brand mb-4">
          <span class="fx-brand-mark"><i></i><i></i><i></i></span>
          <span class="fx-brand-name">flexya</span>
        </div>
        @if (titulo()) {
          <h1 class="h4 mb-1">{{ titulo() }}</h1>
        }
        @if (subtitulo()) {
          <p class="fx-muted">{{ subtitulo() }}</p>
        }
        <ng-content />
      </div>
    </div>
  `,
})
export class AuthCard {
  readonly titulo = input('');
  readonly subtitulo = input('');
}
