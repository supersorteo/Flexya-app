import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { KpiCard, PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-deposito',
  imports: [PageHeader, KpiCard, EnviosTable, FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [title]="esAdmin() ? 'Depósito central' : 'Mi depósito'"
      [subtitle]="esAdmin() ? 'Paquetes que los clientes llevan al depósito y salen a reparto.' : 'Tus paquetes que pasan por el depósito de Flexya.'" />

    <div class="fx-kpi-grid">
      <fx-kpi label="En depósito" [value]="enDeposito().length" foot="listos para asignar" icon="building" tone="purple" />
      <fx-kpi label="Por recibir" [value]="porRecibir().length" foot="el cliente todavía no los entregó" icon="inbox" tone="amber" />
      <fx-kpi label="Unidades en depósito" [value]="unidades()" foot="de paquetes recibidos" icon="boxes" tone="teal" />
    </div>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head"><div class="fx-panel-title">En depósito</div><span class="fx-muted small">{{ enDeposito().length }} paquetes</span></div>
      <fx-envios-table [envios]="enDeposito()" [acciones]="true" />
    </section>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head"><div class="fx-panel-title">Por recibir</div><span class="fx-muted small">{{ porRecibir().length }} paquetes</span></div>
      <fx-envios-table [envios]="porRecibir()" [acciones]="true" />
    </section>

    @if (esAdmin()) {
      <section class="fx-panel fx-form-panel mb-4">
        <h2 class="h6 mb-1">Horario de retiros</h2>
        <p class="fx-muted small mb-3">Los pedidos que entran antes de la hora de corte, en un día hábil, se retiran ese mismo día; los demás, el próximo día hábil. Sábados, domingos y feriados no son hábiles.</p>
        <div class="row g-3 align-items-end">
          <div class="col-6 col-md-3">
            <label class="form-label" for="op-corte">Hora de corte</label>
            <select id="op-corte" class="form-select" [ngModel]="corte()" (ngModelChange)="cambiarCorte($event)">
              @for (h of horas; track h) { <option [ngValue]="h">{{ h }}:00</option> }
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" for="op-recargo">Recargo "Retiro y depósito"</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input id="op-recargo" type="number" min="0" step="50" class="form-control" [value]="recargo()" (change)="cambiarRecargo($any($event.target).value)" />
            </div>
            <div class="form-text">Se suma a la tarifa de cada envío con este servicio.</div>
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="op-feriado">Agregar feriado</label>
            <div class="input-group">
              <input id="op-feriado" type="date" class="form-control" [ngModel]="nuevoFeriado()" (ngModelChange)="nuevoFeriado.set($event)" />
              <button type="button" class="btn btn-outline-primary" (click)="agregarFeriado()" [disabled]="!nuevoFeriado()">Agregar</button>
            </div>
          </div>
        </div>
        @if (feriados().length) {
          <div class="d-flex flex-wrap gap-2 mt-3">
            @for (f of feriados(); track f) {
              <span class="badge text-bg-light border d-inline-flex align-items-center gap-2">{{ f | date: 'dd/MM/yyyy' }}
                <button type="button" class="btn-close" style="font-size: 0.55rem" (click)="quitarFeriado(f)" [attr.aria-label]="'Quitar el feriado ' + f"></button>
              </span>
            }
          </div>
        }
        <p class="small mt-3 mb-0">Un pedido que entra ahora se retira el <strong>{{ proxima() | date: 'EEEE d/MM' }}</strong>.</p>
      </section>
    }

    @if (enRevision().length) {
      <section class="fx-panel mb-4">
        <div class="fx-panel-head"><div class="fx-panel-title">En revisión</div><span class="fx-muted small">{{ enRevision().length }} en pausa</span></div>
        <fx-envios-table [envios]="enRevision()" [acciones]="true" />
      </section>
    }
  `,
})
export class Deposito {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);

  protected readonly horas = Array.from({ length: 13 }, (_, i) => i + 8);
  protected readonly corte = computed(() => this.data.configOperacion().horaCorte);
  protected readonly feriados = computed(() => [...this.data.configOperacion().feriados].sort());
  protected readonly nuevoFeriado = signal('');
  protected readonly proxima = computed(() => this.data.proximaFechaRetiro());

  protected readonly recargo = computed(() => this.data.configOperacion().recargoRecoleccion);

  protected cambiarRecargo(valor: string) {
    const monto = Number(valor);
    if (!Number.isFinite(monto) || monto < 0) {
      this.alert.advertencia('Ingresá un monto válido (0 o más).');
      return;
    }
    this.data.guardarConfigOperacion({ ...this.data.configOperacion(), recargoRecoleccion: Math.round(monto) });
    this.alert.exito(`Recargo: $ ${Math.round(monto)}`);
  }

  protected cambiarCorte(hora: number) {
    this.data.guardarConfigOperacion({ ...this.data.configOperacion(), horaCorte: Number(hora) });
    this.alert.exito(`Hora de corte: ${hora}:00`);
  }

  protected agregarFeriado() {
    const fecha = this.nuevoFeriado();
    if (!fecha) return;
    const cfg = this.data.configOperacion();
    if (cfg.feriados.includes(fecha)) {
      this.alert.advertencia('Ese feriado ya está cargado.');
      return;
    }
    this.data.guardarConfigOperacion({ ...cfg, feriados: [...cfg.feriados, fecha] });
    this.nuevoFeriado.set('');
    this.alert.exito('Feriado agregado');
  }

  protected quitarFeriado(fecha: string) {
    const cfg = this.data.configOperacion();
    this.data.guardarConfigOperacion({ ...cfg, feriados: cfg.feriados.filter((f) => f !== fecha) });
  }

  protected readonly esAdmin = computed(() => this.auth.user()?.rol === 'admin');
  private readonly propios = computed(() => this.data.enviosDe(this.auth.user()));
  protected readonly enDeposito = computed(() => this.propios().filter((e) => e.estado === 'En depósito'));
  protected readonly enRevision = computed(() => this.propios().filter((e) => e.estado === 'En revisión'));
  protected readonly porRecibir = computed(() => this.propios().filter((e) => this.data.puedeRecepcionar(e)));
  protected readonly unidades = computed(() => this.enDeposito().reduce((total, e) => total + e.items.reduce((n, i) => n + i.cantidad, 0), 0));
}
