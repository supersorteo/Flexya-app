import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CATEGORIAS, LoteDeposito } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AlertService } from '../../core/services/alert.service';
import { KpiCard, PageHeader } from '../../shared/ui/ui';

const VENTANAS = ['Mañana · 09:00 a 12:00', 'Mañana · 14:00 a 17:00', 'Viernes · 09:00 a 12:00'];

@Component({
  selector: 'fx-deposito',
  imports: [ReactiveFormsModule, PageHeader, KpiCard, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header [title]="esAdmin() ? 'Depósito central' : 'Mi depósito'" subtitle="Inventario, ubicaciones y movimientos de stock.">
      @if (esAdmin()) {
        <button type="button" class="btn btn-primary" (click)="mostrarLote.set(!mostrarLote())">
          <i class="bi bi-plus-lg"></i>Ingresar lote
        </button>
      }
    </fx-page-header>

    <div class="fx-kpi-grid">
      <fx-kpi label="Unidades totales" [value]="unidades()" foot="en ubicaciones activas" icon="boxes" tone="purple" />
      <fx-kpi label="Lotes activos" [value]="lotes().length" foot="con trazabilidad" icon="layers" tone="blue" />
      <fx-kpi label="Retiros pendientes" [value]="pendientes()" foot="requieren coordinación" icon="arrow-up-right" tone="teal" />
    </div>

    @if (esAdmin() && mostrarLote()) {
      <section class="fx-panel fx-form-panel mb-4">
        <h2 class="h6 mb-3">Ingresar lote al depósito</h2>
        @if (!data.clientes().length) {
          <div class="alert alert-warning py-2 small">Primero creá un cliente para poder ingresar lotes.</div>
        }
        <form [formGroup]="loteForm" (ngSubmit)="guardarLote()" novalidate>
          <div class="row g-3">
            <div class="col-12 col-md-3">
              <label class="form-label" for="lc">Cliente</label>
              <select id="lc" class="form-select" formControlName="clienteId">
                <option value="" disabled>Seleccioná un cliente…</option>
                @for (c of data.clientes(); track c.id) {
                  <option [value]="c.id">{{ c.nombre }}</option>
                }
              </select>
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label" for="lcat">Categoría</label>
              <select id="lcat" class="form-select" formControlName="categoria">
                @for (c of categorias; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="lu">Unidades</label>
              <input id="lu" type="number" inputmode="numeric" min="1" class="form-control" formControlName="unidades" />
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="lub">Ubicación</label>
              <input id="lub" class="form-control" formControlName="ubicacion" [class.is-invalid]="loteForm.controls.ubicacion.touched && loteForm.controls.ubicacion.invalid" />
            </div>
          </div>
          <div class="fx-form-actions">
            <button type="button" class="btn btn-outline-secondary" (click)="mostrarLote.set(false)">Cancelar</button>
            <button type="submit" class="btn btn-primary">Ingresar lote</button>
          </div>
        </form>
      </section>
    }

    @if (!esAdmin() && lote(); as l) {
      <section class="fx-panel fx-form-panel mb-4">
        <h2 class="h6 mb-3">Solicitar retiro · {{ l.id }} <span class="fx-muted fw-normal">({{ l.unidades }} disponibles)</span></h2>
        <form [formGroup]="retiroForm" (ngSubmit)="guardarRetiro(l)" novalidate>
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label class="form-label" for="ru">Unidades a retirar</label>
              <input id="ru" type="number" inputmode="numeric" min="1" [max]="l.unidades" class="form-control" formControlName="unidades"
                [class.is-invalid]="retiroForm.controls.unidades.invalid && retiroForm.controls.unidades.touched" />
              <div class="invalid-feedback">Entre 1 y {{ l.unidades }} unidades.</div>
            </div>
            <div class="col-12 col-md-8">
              <label class="form-label" for="rv">Fecha preferida</label>
              <select id="rv" class="form-select" formControlName="ventana">
                @for (v of ventanas; track v) {
                  <option [value]="v">{{ v }}</option>
                }
              </select>
            </div>
            <div class="col-12">
              <label class="form-label" for="rn">Observaciones</label>
              <input id="rn" class="form-control" formControlName="notas" placeholder="Ej. preparar cajas del lote" />
            </div>
          </div>
          <div class="fx-form-actions">
            <button type="button" class="btn btn-outline-secondary" (click)="lote.set(null)">Cancelar</button>
            <button type="submit" class="btn btn-primary">Solicitar retiro</button>
          </div>
        </form>
      </section>
    }

    <section class="fx-panel mb-4">
      <div class="fx-panel-head"><div class="fx-panel-title">Stock disponible</div></div>
      <table class="fx-table">
        <thead>
          <tr>
            <th>Lote</th>
            @if (esAdmin()) { <th>Cliente</th> }
            <th>Categoría</th><th>Unidades</th><th>Ubicación</th><th>Ingreso</th>
            @if (!esAdmin()) { <th>Acción</th> }
          </tr>
        </thead>
        <tbody>
          @for (l of lotes(); track l.id) {
            <tr>
              <td data-label="Lote"><strong>{{ l.id }}</strong></td>
              @if (esAdmin()) { <td data-label="Cliente">{{ data.nombreCliente(l.clienteId) }}</td> }
              <td data-label="Categoría">{{ l.categoria }}</td>
              <td data-label="Unidades"><strong>{{ l.unidades }}</strong></td>
              <td data-label="Ubicación"><span class="fx-status st-deposit">{{ l.ubicacion }}</span></td>
              <td data-label="Ingreso" class="fx-muted">{{ l.recibidoEn | date: 'd MMM y' }}</td>
              @if (!esAdmin()) {
                <td data-label="Acción" class="fx-actions">
                  <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="l.unidades === 0" (click)="abrirRetiro(l)">Solicitar retiro</button>
                </td>
              }
            </tr>
          } @empty {
            <tr class="fx-empty"><td colspan="7"><div class="text-center fx-muted py-4">Sin lotes en depósito.</div></td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (retiros().length) {
      <section class="fx-panel">
        <div class="fx-panel-head"><div class="fx-panel-title">Solicitudes de retiro</div></div>
        <table class="fx-table">
          <thead>
            <tr>
              <th>Solicitud</th>
              @if (esAdmin()) { <th>Cliente</th> }
              <th>Lote</th><th>Unidades</th><th>Ventana</th><th>Estado</th>
              @if (esAdmin()) { <th>Acción</th> }
            </tr>
          </thead>
          <tbody>
            @for (r of retiros(); track r.id) {
              <tr>
                <td data-label="Solicitud"><strong>{{ r.id }}</strong></td>
                @if (esAdmin()) { <td data-label="Cliente">{{ data.nombreCliente(r.clienteId) }}</td> }
                <td data-label="Lote">{{ r.loteId }}</td>
                <td data-label="Unidades">{{ r.unidades }}</td>
                <td data-label="Ventana">{{ r.ventana }}</td>
                <td data-label="Estado"><span [class]="'fx-status ' + (r.estado === 'Aprobado' ? 'st-delivered' : 'st-pending')">{{ r.estado }}</span></td>
                @if (esAdmin()) {
                  <td data-label="Acción" class="fx-actions">
                    @if (r.estado === 'Pendiente') {
                      <button type="button" class="btn btn-sm btn-primary" (click)="aprobar(r.id)">Aprobar</button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
})
export class Deposito {
  protected readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly categorias = CATEGORIAS;
  protected readonly ventanas = VENTANAS;
  protected readonly esAdmin = computed(() => this.auth.user()?.rol === 'admin');
  protected readonly lotes = computed(() => this.data.lotesDe(this.auth.user()));
  protected readonly retiros = computed(() => this.data.retirosDe(this.auth.user()));
  protected readonly unidades = computed(() => this.lotes().reduce((s, l) => s + l.unidades, 0));
  protected readonly pendientes = computed(() => this.retiros().filter((r) => r.estado === 'Pendiente').length);

  protected readonly mostrarLote = signal(false);
  protected readonly lote = signal<LoteDeposito | null>(null);

  protected readonly loteForm = this.fb.group({
    clienteId: ['', Validators.required],
    categoria: [CATEGORIAS[0] as string, Validators.required],
    unidades: [10, [Validators.required, Validators.min(1)]],
    ubicacion: ['A-09', Validators.required],
  });

  protected readonly retiroForm = this.fb.group({
    unidades: [1, [Validators.required, Validators.min(1)]],
    ventana: [VENTANAS[0], Validators.required],
    notas: [''],
  });

  protected abrirRetiro(l: LoteDeposito) {
    this.retiroForm.controls.unidades.setValidators([Validators.required, Validators.min(1), Validators.max(l.unidades)]);
    this.retiroForm.patchValue({ unidades: Math.min(5, l.unidades) });
    this.retiroForm.controls.unidades.updateValueAndValidity();
    this.lote.set(l);
  }

  protected guardarLote() {
    if (this.loteForm.invalid) {
      this.loteForm.markAllAsTouched();
      return;
    }
    this.data.ingresarLote(this.loteForm.getRawValue());
    this.alert.exito('Lote ingresado al depósito');
    this.mostrarLote.set(false);
  }

  protected guardarRetiro(l: LoteDeposito) {
    if (this.retiroForm.invalid) {
      this.retiroForm.markAllAsTouched();
      return;
    }
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return;
    this.data.solicitarRetiro({ ...this.retiroForm.getRawValue(), loteId: l.id }, clienteId);
    this.alert.exito('Solicitud enviada. Te confirmaremos la ventana de retiro.');
    this.lote.set(null);
  }

  protected async aprobar(id: string) {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Aprobar el retiro ${id}?`,
      mensaje: 'Se descontarán las unidades del lote.',
      confirmar: 'Sí, aprobar',
      tipo: 'info',
    });
    if (!confirmado) return;
    this.data.aprobarRetiro(id);
    this.alert.exito(`Retiro ${id} aprobado`);
  }
}
