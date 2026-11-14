import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Rol } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { DataService } from '../core/services/data.service';
import { AlertService } from '../core/services/alert.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV: Record<Rol, NavItem[]> = {
  admin: [
    { path: 'inicio', label: 'Resumen', icon: 'grid-1x2' },
    { path: 'envios', label: 'Envíos', icon: 'box-seam' },
    { path: 'deposito', label: 'Depósito', icon: 'building' },
    { path: 'clientes', label: 'Clientes', icon: 'people' },
    { path: 'mensajeros', label: 'Mensajeros', icon: 'truck' },
    { path: 'pagos', label: 'Pagos', icon: 'cash-coin' },
    { path: 'reportes', label: 'Reportes', icon: 'bar-chart' },
  ],
  cliente: [
    { path: 'inicio', label: 'Resumen', icon: 'grid-1x2' },
    { path: 'productos', label: 'Productos', icon: 'box' },
    { path: 'envios', label: 'Mis envíos', icon: 'truck' },
    { path: 'deposito', label: 'Mi depósito', icon: 'building' },
    { path: 'historial', label: 'Historial', icon: 'clock-history' },
  ],
  mensajero: [
    { path: 'inicio', label: 'Mi jornada', icon: 'grid-1x2' },
    { path: 'envios', label: 'Mis envíos', icon: 'truck' },
    { path: 'ganancias', label: 'Ganancias', icon: 'cash-coin' },
    { path: 'historial', label: 'Historial', icon: 'clock-history' },
  ],
};

const ROL_LABEL: Record<Rol, string> = {
  admin: 'Superadministrador',
  cliente: 'Cliente',
  mensajero: 'Mensajero',
};

@Component({
  selector: 'fx-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-shell">
      <aside class="fx-sidebar d-none d-lg-flex" aria-label="Navegación principal">
        <div class="fx-brand">
          <span class="fx-brand-mark"><i></i><i></i><i></i></span>
          <span class="fx-brand-name">flexya</span>
        </div>
        <div class="fx-eyebrow px-2">{{ rolLabel() }}</div>
        <nav class="fx-nav">
          @for (n of nav(); track n.path) {
            <a [routerLink]="['/', rol(), n.path]" routerLinkActive="active">
              <i [class]="'bi bi-' + n.icon" aria-hidden="true"></i>{{ n.label }}
            </a>
          }
          <a [routerLink]="['/', rol(), 'cuenta']" routerLinkActive="active">
            <i class="bi bi-person-gear" aria-hidden="true"></i>Mi cuenta
          </a>
        </nav>
        @if (rol() === 'admin') {
          <div class="mt-auto px-2">
            <button type="button" class="btn btn-link btn-sm text-decoration-none p-0 fx-muted" (click)="reset()">
              <i class="bi bi-trash3"></i> Borrar todos los datos
            </button>
          </div>
        }
      </aside>

      <div class="fx-main">
        <header class="fx-topbar">
          <div class="fx-brand d-lg-none">
            <span class="fx-brand-mark"><i></i><i></i><i></i></span>
            <span class="fx-brand-name">flexya</span>
          </div>
          <div class="ms-auto d-flex align-items-center gap-3">
            <div class="fx-user d-none d-sm-block text-end">
              <strong>{{ user()?.nombre }}</strong>
              <small class="fx-muted d-block">{{ rolLabel() }}</small>
            </div>
            @if (rol() === 'admin') {
              <button type="button" class="btn btn-outline-secondary btn-sm d-lg-none" (click)="reset()" aria-label="Borrar todos los datos"><i class="bi bi-trash3"></i></button>
            }
            <a class="fx-avatar" [routerLink]="['/', rol(), 'cuenta']" aria-label="Mi cuenta" title="Mi cuenta">{{ iniciales() }}</a>
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="logout()" aria-label="Cerrar sesión">
              <i class="bi bi-box-arrow-right"></i><span class="d-none d-md-inline">Salir</span>
            </button>
          </div>
        </header>
        <main class="fx-page"><router-outlet /></main>
      </div>

      <nav class="fx-bottomnav d-lg-none" aria-label="Navegación principal">
        @for (n of nav(); track n.path) {
          <a [routerLink]="['/', rol(), n.path]" routerLinkActive="active">
            <i [class]="'bi bi-' + n.icon" aria-hidden="true"></i><span>{{ n.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly alert = inject(AlertService);

  protected readonly user = this.auth.user;
  protected readonly rol = computed(() => this.user()?.rol ?? 'cliente');
  protected readonly nav = computed(() => NAV[this.rol()]);
  protected readonly rolLabel = computed(() => ROL_LABEL[this.rol()]);
  protected readonly iniciales = computed(() =>
    (this.user()?.nombre ?? '')
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase(),
  );

  constructor() {
    effect(() => {
      if (!this.auth.user()) void this.router.navigate(['/login']);
    });
  }

  protected logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  protected async reset() {
    const confirmado = await this.alert.confirmar({
      titulo: '¿Borrar todos los datos?',
      mensaje: 'Se eliminan clientes, mensajeros, envíos y depósito. Queda solo el superadministrador.',
      confirmar: 'Sí, borrar todo',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    this.data.reset();
    this.alert.exito('Se borraron todos los datos');
  }
}
