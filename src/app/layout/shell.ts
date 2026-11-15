import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Rol } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { DataService } from '../core/services/data.service';
import { AlertService } from '../core/services/alert.service';
import { ETIQUETA_TEMA, ICONO_TEMA, ThemeService } from '../core/services/theme.service';
import { PeriodoService } from '../core/services/periodo.service';
import { Logo } from '../shared/ui/logo';
import { PeriodoTabs } from '../shared/ui/periodo-tabs';
import { etiquetaRango } from '../core/periodos';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, PeriodoTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fx-shell">
      <aside class="fx-sidebar d-none d-lg-flex" aria-label="Navegación principal">
        <div class="fx-brand">
          <fx-logo />
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
            <fx-logo />
          </div>
          <div class="ms-auto d-flex align-items-center gap-3">
            <div class="fx-user d-none d-sm-block text-end">
              <strong>{{ user()?.nombre }}</strong>
              <small class="fx-muted d-block">{{ rolLabel() }}</small>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm fx-tema" (click)="tema.alternar()" [attr.aria-label]="'Tema: ' + etiquetaTema() + '. Tocá para cambiarlo.'" [title]="'Tema: ' + etiquetaTema()">
              <i [class]="'bi bi-' + iconoTema()" aria-hidden="true"></i>
            </button>
            @if (rol() === 'admin') {
              <button type="button" class="btn btn-outline-secondary btn-sm d-lg-none" (click)="reset()" aria-label="Borrar todos los datos"><i class="bi bi-trash3"></i></button>
            }
            <a class="fx-avatar" [routerLink]="['/', rol(), 'cuenta']" aria-label="Mi cuenta" title="Mi cuenta">{{ iniciales() }}</a>
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="logout()" aria-label="Cerrar sesión">
              <i class="bi bi-box-arrow-right"></i><span class="d-none d-md-inline">Salir</span>
            </button>
          </div>
        </header>
        @if (conPeriodo()) {
          <div class="fx-periodobar">
            <fx-periodo [(periodo)]="per.rango" />
            @if (!per.esActual()) {
              <div class="fx-viendo" role="status">
                <i class="bi bi-clock-history" aria-hidden="true"></i>
                <span>Estás viendo <strong>{{ etiquetaPeriodo() }}</strong>, no el día de hoy.</span>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="per.reiniciar(per.rango().nivel)">Volver a hoy</button>
              </div>
            }
          </div>
        }
        <main class="fx-page"><router-outlet /></main>
      </div>

      <nav class="fx-bottomnav d-lg-none" aria-label="Navegación principal">
        @for (n of navInferior(); track n.path) {
          <a [routerLink]="['/', rol(), n.path]" routerLinkActive="active">
            <i [class]="'bi bi-' + n.icon" aria-hidden="true"></i><span>{{ n.label }}</span>
          </a>
        }
        @if (hayMas()) {
          <button type="button" [class.active]="masActivo()" (click)="abrirMas()" aria-haspopup="dialog" [attr.aria-expanded]="mas()">
            <i class="bi bi-three-dots" aria-hidden="true"></i><span>Más</span>
          </button>
        }
      </nav>

      @if (mas()) {
        <div class="fx-sheet-fondo d-lg-none" (click)="cerrarMas()" aria-hidden="true"></div>
        <div class="fx-sheet d-lg-none" role="dialog" aria-modal="true" aria-label="Más opciones" tabindex="-1" (keydown.escape)="cerrarMas()">
          <span class="fx-sheet-asa" aria-hidden="true"></span>
          <ul class="fx-sheet-lista">
            @for (n of navMas(); track n.path) {
              <li>
                <a [routerLink]="['/', rol(), n.path]" routerLinkActive="active" (click)="cerrarMas()">
                  <i [class]="'bi bi-' + n.icon" aria-hidden="true"></i>{{ n.label }}
                </a>
              </li>
            }
            <li class="sep" aria-hidden="true"></li>
            <li>
              <a [routerLink]="['/', rol(), 'cuenta']" routerLinkActive="active" (click)="cerrarMas()">
                <i class="bi bi-person-gear" aria-hidden="true"></i>Mi cuenta
              </a>
            </li>
            <li>
              <button type="button" (click)="tema.alternar()">
                <i [class]="'bi bi-' + iconoTema()" aria-hidden="true"></i>Tema: {{ etiquetaTema() }}
              </button>
            </li>
            <li>
              <button type="button" (click)="cerrarMas(); logout()">
                <i class="bi bi-box-arrow-right" aria-hidden="true"></i>Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      }
    </div>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly alert = inject(AlertService);
  private readonly doc = inject(DOCUMENT);
  protected readonly per = inject(PeriodoService);
  protected readonly tema = inject(ThemeService);
  protected readonly etiquetaTema = computed(() => ETIQUETA_TEMA[this.tema.preferencia()]);
  protected readonly iconoTema = computed(() => ICONO_TEMA[this.tema.preferencia()]);

  protected readonly user = this.auth.user;
  protected readonly rol = computed(() => this.user()?.rol ?? 'cliente');
  protected readonly nav = computed(() => NAV[this.rol()]);
  protected readonly hayMas = computed(() => this.nav().length > 5);
  protected readonly navInferior = computed(() => (this.hayMas() ? this.nav().slice(0, 4) : this.nav()));
  protected readonly navMas = computed(() => (this.hayMas() ? this.nav().slice(4) : []));
  protected readonly mas = signal(false);
  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly masActivo = computed(() => {
    const actual = this.url();
    return this.navMas().some((n) => actual.startsWith(`/${this.rol()}/${n.path}`));
  });
  protected readonly conPeriodo = computed(() => /\/(inicio|envios|historial|deposito|pagos|ganancias|reportes)$/.test(this.url().split('?')[0]));
  protected readonly etiquetaPeriodo = computed(() => etiquetaRango(this.per.rango(), new Date()));
  protected readonly rolLabel = computed(() => ROL_LABEL[this.rol()]);

  protected abrirMas() {
    this.mas.set(true);
    setTimeout(() => this.doc.querySelector<HTMLElement>('.fx-sheet')?.focus());
  }

  protected cerrarMas() {
    this.mas.set(false);
  }
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
