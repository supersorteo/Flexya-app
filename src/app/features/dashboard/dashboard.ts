import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { ParadaCard } from '../../shared/ui/parada-card';
import { KpiCard, PageHeader } from '../../shared/ui/ui';

interface Kpi {
  label: string;
  value: string | number;
  foot: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'purple';
}

@Component({
  selector: 'fx-dashboard',
  imports: [KpiCard, PageHeader, EnviosTable, ParadaCard, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [eyebrow]="eyebrow()" [title]="titulo()" [subtitle]="subtitulo()">
      @if (user()?.rol === 'cliente') {
        <a class="btn btn-primary" routerLink="/cliente/envios/nuevo"><i class="bi bi-plus-lg"></i>Nuevo envío</a>
      }
    </fx-page-header>

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

    <div class="fx-kpi-grid">
      @for (k of kpis(); track k.label) {
        <fx-kpi [label]="k.label" [value]="k.value" [foot]="k.foot" [icon]="k.icon" [tone]="k.tone" />
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
  private readonly currency = new CurrencyPipe('es-AR');

  protected readonly user = this.auth.user;
  protected readonly envios = computed(() => this.data.enviosDe(this.user()));
  protected readonly recientes = computed(() => {
    const lista = this.envios();
    return this.user()?.rol === 'mensajero'
      ? [...lista].sort((a, b) => Number(b.estado === 'En reparto') - Number(a.estado === 'En reparto')).slice(0, 5)
      : lista.slice(0, 5);
  });
  protected readonly actividades = computed(() => {
    const u = this.user();
    const all = this.data.actividades();
    if (u?.rol !== 'cliente') return all.slice(0, 6);
    const nombre = this.data.nombreCliente(u.clienteId ?? '');
    return all.filter((a) => a.detalle.includes(nombre) || /Envío|entreg/i.test(a.titulo)).slice(0, 6);
  });

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
    const stock = this.data.lotesDe(this.user()).reduce((s, l) => s + l.unidades, 0);
    const rol = this.user()?.rol;
    if (rol === 'admin') {
      return [
        { label: 'Por recepcionar', value: count('Pendiente'), foot: 'esperan llegar al depósito', icon: 'inbox', tone: 'amber' },
        { label: 'En depósito', value: count('En depósito'), foot: 'listos para asignar', icon: 'building', tone: 'purple' },
        { label: 'En reparto', value: count('En reparto'), foot: 'con mensajeros', icon: 'truck', tone: 'blue' },
        { label: 'Stock total', value: stock, foot: 'unidades almacenadas', icon: 'boxes', tone: 'teal' },
      ];
    }
    if (rol === 'mensajero') {
      const total = e.filter((x) => x.estado === 'En reparto').reduce((s, x) => s + x.importe, 0);
      return [
        { label: 'Paradas pendientes', value: count('En reparto'), foot: 'por entregar hoy', icon: 'geo-alt', tone: 'blue' },
        { label: 'Entregados', value: count('Entregado'), foot: 'completados', icon: 'check2-circle', tone: 'teal' },
        { label: 'Incidencias', value: count('Incidencia'), foot: 'con seguimiento', icon: 'exclamation-triangle', tone: 'amber' },
        { label: 'En ruta', value: this.currency.transform(total, 'ARS', 'symbol-narrow', '1.0-0') ?? '', foot: 'valor de la carga', icon: 'cash-coin', tone: 'purple' },
      ];
    }
    return [
      { label: 'Envíos activos', value: e.filter((x) => !['Entregado', 'Cancelado'].includes(x.estado)).length, foot: `${count('En reparto')} en reparto`, icon: 'box-seam', tone: 'blue' },
      { label: 'Entregados', value: count('Entregado'), foot: 'completados', icon: 'check2-circle', tone: 'teal' },
      { label: 'Stock en depósito', value: stock, foot: 'unidades disponibles', icon: 'building', tone: 'purple' },
      { label: 'Retiros pendientes', value: this.data.retirosDe(this.user()).filter((r) => r.estado === 'Pendiente').length, foot: 'en revisión', icon: 'arrow-up-right', tone: 'amber' },
    ];
  });
}
