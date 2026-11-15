import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { enCursoMensajero } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { CrearEnvio } from '../envios/crear-envio';
import { EnviosTable } from '../../shared/ui/envios-table';
import { Jornada } from '../../shared/ui/jornada';
import { ParadaCard } from '../../shared/ui/parada-card';
import { KpiCard, PageHeader } from '../../shared/ui/ui';
import { tarjetaGanancias } from '../pagos/tarjeta-ganancias';
import { AlertasAdmin, ResumenNegocio } from './resumen-negocio';

interface Kpi {
  label: string;
  value: string | number;
  foot: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'purple';
  enlace?: string;
}

@Component({
  selector: 'fx-dashboard',
  imports: [Jornada, KpiCard, PageHeader, EnviosTable, ParadaCard, RouterLink, DatePipe, AlertasAdmin, ResumenNegocio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [eyebrow]="eyebrow()" [title]="titulo()" [subtitle]="subtitulo()">
      @if (user()?.rol === 'cliente') {
        <button type="button" class="btn btn-primary" (click)="nuevoEnvio()"><i class="bi bi-plus-lg"></i>Nuevo envío</button>
      }
    </fx-page-header>

    @if (user()?.rol === 'mensajero') {
      <fx-jornada [envios]="envios()" />
    }

    @if (user()?.rol === 'admin' && !data.clientes().length) {
      <div class="fx-onboarding">
        <span class="fx-onboarding-icon"><i class="bi bi-rocket-takeoff" aria-hidden="true"></i></span>
        <div class="flex-grow-1">
          <strong>Empezá cargando tu primer cliente</strong>
          <p class="fx-muted small mb-0">Creá un cliente, sumá mensajeros por zona y desde ahí todo el flujo se va armando.</p>
        </div>
        <a class="btn btn-primary btn-sm" routerLink="/admin/clientes">Crear cliente</a>
      </div>
    }

    @if (user()?.rol === 'admin' && data.clientes().length) {
      <fx-resumen-negocio />
      <fx-alertas-admin />
      <div class="mb-3">
        <h2 class="h6 mb-0">Operación ahora</h2>
        <p class="fx-muted small mb-0">Lo que está pasando en este momento, no un período.</p>
      </div>
    }

    <div class="fx-kpi-grid">
      @for (k of kpis(); track k.label) {
        @if (k.enlace) {
          <a class="fx-kpi-link" [routerLink]="k.enlace" [attr.aria-label]="k.label + ': ver el detalle'">
            <fx-kpi [label]="k.label" [value]="k.value" [foot]="k.foot" [icon]="k.icon" [tone]="k.tone" />
          </a>
        } @else {
          <fx-kpi [label]="k.label" [value]="k.value" [foot]="k.foot" [icon]="k.icon" [tone]="k.tone" />
        }
      }
    </div>

    <div class="fx-dash-grid">
      <section class="fx-panel">
        <div class="fx-panel-head">
          <div>
            <div class="fx-panel-title">{{ user()?.rol === 'mensajero' ? 'Tus entregas' : 'Envíos recientes' }}</div>
            <div class="fx-muted small">Últimos movimientos</div>
          </div>
          <a class="small fw-bold text-decoration-none" [routerLink]="['/', user()?.rol, 'envios']">Ver todos →</a>
        </div>
        @if (user()?.rol === 'mensajero') {
          <div class="fx-paradas fx-paradas--panel">
            @for (e of recientes(); track e.id) {
              <fx-parada [envio]="e" />
            } @empty {
              <p class="fx-muted text-center py-4 mb-0">No tenés envíos asignados por ahora.</p>
            }
          </div>
        } @else {
          <fx-envios-table [envios]="recientes()" />
        }
      </section>

      <section class="fx-panel">
        <div class="fx-panel-head">
          <div>
            <div class="fx-panel-title">Actividad reciente</div>
            <div class="fx-muted small">Lo que acaba de pasar</div>
          </div>
        </div>
        <ul class="fx-activity">
          @for (a of actividades(); track a.id) {
            <li>
              <span [class]="'fx-dot dot-' + a.tono"></span>
              <div class="flex-grow-1">
                <strong>{{ a.titulo }}</strong>
                <p class="fx-muted small mb-0">{{ a.detalle }}</p>
              </div>
              <time class="fx-muted small">{{ a.fecha | date: 'd MMM, HH:mm' }}</time>
            </li>
          } @empty {
            <li class="fx-muted small">Todavía no hay actividad.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  protected readonly data = inject(DataService);
  private readonly crear = inject(CrearEnvio);
  private readonly currency = new CurrencyPipe('es-AR');

  protected readonly user = this.auth.user;
  protected readonly envios = computed(() => this.data.enviosDe(this.user()));
  protected readonly recientes = computed(() => {
    const lista = this.envios();
    return this.user()?.rol === 'mensajero'
      ? [...lista].sort((a, b) => Number(enCursoMensajero(b)) - Number(enCursoMensajero(a))).slice(0, 5)
      : lista.slice(0, 5);
  });
  protected readonly actividades = computed(() => {
    const u = this.user();
    const all = this.data.actividades();
    if (u?.rol !== 'cliente') return all.slice(0, 6);
    const nombre = this.data.nombreCliente(u.clienteId ?? '');
    return all.filter((a) => a.detalle.includes(nombre) || /Envío|entreg/i.test(a.titulo)).slice(0, 6);
  });

  protected nuevoEnvio() {
    this.crear.abrir();
  }

  protected readonly eyebrow = computed(
    () => ({ admin: 'OPERACIONES · HOY', cliente: 'CUENTA', mensajero: 'JORNADA · HOY' })[this.user()?.rol ?? 'cliente'],
  );
  protected readonly titulo = computed(() => {
    const u = this.user();
    if (u?.rol === 'admin') return 'Centro de operaciones';
    if (u?.rol === 'mensajero') return 'Tu jornada, en movimiento';
    return `Hola, ${u?.nombre}`;
  });
  protected readonly subtitulo = computed(
    () =>
      ({
        admin: 'Una vista clara de todo lo que se mueve hoy.',
        cliente: 'Gestioná tus envíos, retiros y stock desde un solo lugar.',
        mensajero: 'Revisá tu ruta y mantené cada entrega al día.',
      })[this.user()?.rol ?? 'cliente'],
  );

  protected readonly kpis = computed<Kpi[]>(() => {
    const e = this.envios();
    const count = (estado: string) => e.filter((x) => x.estado === estado).length;
    const enDeposito = e.filter((x) => x.estado === 'En depósito');
    const unidadesEnDeposito = enDeposito.reduce((s, x) => s + x.items.reduce((n, i) => n + i.cantidad, 0), 0);
    const stock = this.data.productosDe(this.user()).reduce((s, p) => s + p.stock, 0);
    const rol = this.user()?.rol;
    if (rol === 'admin') {
      return [
        { label: 'Con mensajeros', value: e.filter((x) => enCursoMensajero(x)).length, foot: 'retiros y entregas en la calle', icon: 'truck', tone: 'blue' },
        { label: 'Unidades en depósito', value: unidadesEnDeposito, foot: 'de paquetes recibidos', icon: 'boxes', tone: 'teal' },
      ];
    }
    if (rol === 'mensajero') {
      const g = this.data.gananciasDe(this.user()?.mensajeroId ?? '');
      const pesos = (n: number) => this.currency.transform(n, 'ARS', 'symbol-narrow', '1.0-2') ?? '';
      return [
        { label: 'Paradas en curso', value: e.filter((x) => enCursoMensajero(x)).length, foot: 'retiros y entregas de hoy', icon: 'geo-alt', tone: 'blue' },
        { label: 'Entregados', value: count('Entregado'), foot: 'completados', icon: 'check2-circle', tone: 'teal' },
        { label: 'Incidencias', value: count('Incidencia'), foot: 'con seguimiento', icon: 'exclamation-triangle', tone: 'amber' },
        { ...tarjetaGanancias(g, pesos), enlace: '/mensajero/ganancias' },
      ];
    }
    return [
      { label: 'Envíos activos', value: e.filter((x) => !['Entregado', 'Cancelado', 'Borrador', 'Devuelto'].includes(x.estado)).length, foot: `${count('En reparto')} en reparto`, icon: 'box-seam', tone: 'blue' },
      { label: 'Entregados', value: count('Entregado'), foot: 'completados', icon: 'check2-circle', tone: 'teal' },
      { label: 'Stock de productos', value: stock, foot: 'unidades disponibles', icon: 'boxes', tone: 'purple' },
      { label: 'En depósito', value: count('En depósito'), foot: 'paquetes recibidos', icon: 'building', tone: 'amber' },
    ];
  });
}
