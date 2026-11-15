import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Logo } from './logo';

@Component({
  selector: 'fx-auth-card',
  imports: [Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-login">
      <aside class="fx-login-hero">
        <fx-logo [tamano]="34" />
        <div class="fx-login-claim">
          <h2>Cada envío, de punta a punta.</h2>
          <p>Retiros, depósito y reparto en un solo lugar.</p>
        </div>
        <ul class="fx-login-puntos">
          <li><i class="bi bi-geo-alt" aria-hidden="true"></i>Sabés dónde está cada paquete</li>
          <li><i class="bi bi-truck" aria-hidden="true"></i>El mensajero ve lo que le toca hoy</li>
          <li><i class="bi bi-cash-coin" aria-hidden="true"></i>Cobros y pagos claros</li>
        </ul>
        <svg class="fx-login-ruta" viewBox="0 0 400 220" aria-hidden="true" focusable="false">
          <path d="M16 196C120 196 110 96 200 108S330 40 384 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 9" stroke-linecap="round" />
          <circle cx="16" cy="196" r="6" fill="currentColor" />
          <circle cx="200" cy="108" r="6" fill="currentColor" />
          <circle cx="384" cy="24" r="8" class="fx-logo-destino" />
        </svg>
      </aside>
      <main class="fx-login-panel">
        <div class="fx-login-card">
          @if (titulo()) {
            <h1 class="h4 mb-1">{{ titulo() }}</h1>
          }
          @if (subtitulo()) {
            <p class="fx-muted">{{ subtitulo() }}</p>
          }
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthCard {
  readonly titulo = input('');
  readonly subtitulo = input('');
}
