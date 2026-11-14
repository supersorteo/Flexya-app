import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigPagos, Liquidacion, Mensajero, ZONAS } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { KpiCard, PageHeader } from '../../shared/ui/ui';
import { LiquidacionDetalleModal } from './liquidacion-detalle-modal';
import { LiquidacionModal } from './liquidacion-modal';

const OPCIONES_MODAL = { centered: true, scrollable: true, size: 'lg', backdrop: 'static', keyboard: false, modalDialogClass: 'fx-modal', backdropClass: 'fx-backdrop' } as const;

const porcentajeOpcional = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '').trim();
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? null : { porcentaje: true };
};

@Component({
  selector: 'fx-pagos',
  imports: [ReactiveFormsModule, PageHeader, KpiCard, DatePipe, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Pagos a mensajeros" subtitle="Comisiones por entrega, liquidaciones por período y porcentajes." />

    <div class="fx-kpi-grid">
      <fx-kpi label="Ingresos por entregas" [value]="moneda(resumen().ingresos)" foot="envíos entregados" icon="cash-coin" tone="teal" />
      <fx-kpi label="Comisiones" [value]="moneda(resumen().comisionado)" foot="generadas para mensajeros" icon="truck" tone="blue" />
      <fx-kpi label="Pendiente de pago" [value]="moneda(resumen().pendiente)" foot="sin liquidar o sin pagar" icon="hourglass-split" tone="amber" />
      <fx-kpi label="Margen de Flexya" [value]="moneda(resumen().margen)" foot="ingresos menos comisiones" icon="graph-up-arrow" tone="purple" />
    </div>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head"><div class="fx-panel-title">A liquidar</div><span class="fx-muted small">Comisiones sin liquidar, por mensajero</span></div>
      @if (porLiquidar().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Comisiones por liquidar">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Mensajero</th><th>Comisiones</th><th>Monto</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (f of porLiquidar(); track f.mensajero.id) {
                <tr>
                  <td data-label="Mensajero"><strong>{{ f.mensajero.nombre }}</strong></td>
                  <td data-label="Comisiones">{{ f.cantidad }}</td>
                  <td data-label="Monto"><strong>{{ f.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
                  <td data-label="Acciones" class="fx-actions">
                    <button type="button" class="btn btn-sm btn-primary" (click)="liquidar(f.mensajero)" [attr.aria-label]="'Liquidar a ' + f.mensajero.nombre" title="Generar liquidación">
                      <i class="bi bi-receipt"></i><span class="d-none d-xl-inline">Liquidar</span>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="text-center fx-muted py-4 px-3">No hay comisiones pendientes de liquidar.</div>
      }
    </section>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head"><div class="fx-panel-title">Liquidaciones</div><span class="fx-muted small">{{ liquidaciones().length }} en total</span></div>
      @if (liquidaciones().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Liquidaciones">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Liquidación</th><th>Mensajero</th><th>Período</th><th>Neto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (l of liquidaciones(); track l.id) {
                <tr>
                  <td data-label="Liquidación"><strong>{{ l.id }}</strong><span class="fx-sub">{{ l.creadaEn | date: 'dd/MM/yy' }}</span></td>
                  <td data-label="Mensajero">{{ data.nombreMensajero(l.mensajeroId) }}</td>
                  <td data-label="Período">{{ l.desde | date: 'dd/MM' }} al {{ l.hasta | date: 'dd/MM/yy' }}</td>
                  <td data-label="Neto"><strong>{{ l.neto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
                  <td data-label="Estado"><span [class]="'fx-status ' + (l.estado === 'Pagada' ? 'st-delivered' : l.estado === 'Anulada' ? 'st-incident' : 'st-pending')">{{ l.estado }}</span></td>
                  <td data-label="Acciones" class="fx-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" (click)="ver(l)" [attr.aria-label]="'Ver ' + l.id" title="Ver detalle"><i class="bi bi-eye"></i><span class="d-none d-xl-inline">Detalle</span></button>
                    @if (l.estado === 'Generada') {
                      <button type="button" class="btn btn-sm btn-primary" (click)="pagar(l)" [attr.aria-label]="'Marcar ' + l.id + ' como pagada'" title="Marcar como pagada"><i class="bi bi-check2-circle"></i><span class="d-none d-xl-inline">Pagar</span></button>
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="anular(l)" [attr.aria-label]="'Anular ' + l.id" title="Anular liquidación"><i class="bi bi-x-circle"></i><span class="d-none d-xl-inline">Anular</span></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="text-center fx-muted py-4 px-3">Todavía no generaste liquidaciones.</div>
      }
    </section>

    <section class="fx-panel fx-form-panel">
      <h2 class="h6 mb-1">Comisiones</h2>
      <p class="fx-muted small mb-3">Porcentaje de la tarifa de cada envío que cobra el mensajero. Se aplica el más específico: el del mensajero, si no el de la zona, si no el general. Los cambios valen para las entregas futuras: lo ya entregado conserva su porcentaje.</p>
      <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <label class="form-label" for="cf-general">General</label>
            <div class="input-group"><input id="cf-general" type="number" min="0" max="100" step="0.5" class="form-control" formControlName="general" [class.is-invalid]="invalido(form.controls.general)" /><span class="input-group-text">%</span></div>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" for="cf-fallido">Intento fallido</label>
            <div class="input-group"><input id="cf-fallido" type="number" min="0" max="100" step="5" class="form-control" formControlName="fallido" [class.is-invalid]="invalido(form.controls.fallido)" /><span class="input-group-text">%</span></div>
            <div class="form-text">De su comisión normal.</div>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" for="cf-devolucion">Devolución</label>
            <div class="input-group"><input id="cf-devolucion" type="number" min="0" max="100" step="5" class="form-control" formControlName="devolucion" [class.is-invalid]="invalido(form.controls.devolucion)" /><span class="input-group-text">%</span></div>
            <div class="form-text">De su comisión normal.</div>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" for="cf-retiro">Adicional por retiro</label>
            <div class="input-group"><span class="input-group-text">$</span><input id="cf-retiro" type="number" min="0" step="50" class="form-control" formControlName="adicionalRetiro" [class.is-invalid]="invalido(form.controls.adicionalRetiro)" /></div>
            <div class="form-text">Una vez por retiro directo.</div>
          </div>
        </div>

        <h3 class="fx-modal-section">Por zona (opcional)</h3>
        <div class="row g-3" formGroupName="zonas">
          @for (z of zonas; track z.id) {
            <div class="col-6 col-md-3">
              <label class="form-label" [for]="'cz-' + z.id">{{ z.nombre }}</label>
              <div class="input-group"><input [id]="'cz-' + z.id" type="number" min="0" max="100" step="0.5" class="form-control" [formControlName]="z.id" placeholder="General" [class.is-invalid]="invalido(form.controls.zonas.controls[z.id])" /><span class="input-group-text">%</span></div>
            </div>
          }
        </div>

        @if (mensajeros().length) {
          <h3 class="fx-modal-section">Por mensajero (opcional)</h3>
          <div class="row g-3" formGroupName="mensajeros">
            @for (m of mensajeros(); track m.id) {
              <div class="col-6 col-md-3">
                <label class="form-label" [for]="'cm-' + m.id">{{ m.nombre }}</label>
                <div class="input-group"><input [id]="'cm-' + m.id" type="number" min="0" max="100" step="0.5" class="form-control" [formControlName]="m.id" placeholder="Zona/General" [class.is-invalid]="invalido(form.controls.mensajeros.controls[m.id])" /><span class="input-group-text">%</span></div>
              </div>
            }
          </div>
        }

        <div class="fx-form-actions">
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2"></i>Guardar comisiones</button>
        </div>
      </form>
    </section>
  `,
})
export class Pagos {
  protected readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly modals = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pesos = new CurrencyPipe('es-AR');

  protected readonly zonas = ZONAS;
  protected readonly mensajeros = computed(() => this.data.mensajeros());
  protected readonly resumen = computed(() => this.data.resumenPagos());
  protected readonly liquidaciones = computed(() => this.data.liquidaciones());
  protected readonly porLiquidar = computed(() =>
    this.data
      .mensajeros()
      .map((mensajero) => {
        const pendientes = this.data.comisiones().filter((c) => c.mensajeroId === mensajero.id && !c.liquidacionId);
        return { mensajero, cantidad: pendientes.length, monto: Math.round(pendientes.reduce((t, c) => t + c.monto, 0) * 100) / 100 };
      })
      .filter((f) => f.cantidad > 0),
  );

  protected readonly form = this.construirForm();

  protected moneda(n: number): string {
    return this.pesos.transform(n, 'ARS', 'symbol-narrow', '1.0-2') ?? '';
  }

  protected invalido(c: AbstractControl | undefined): boolean {
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected liquidar(mensajero: Mensajero) {
    const ref = this.modals.open(LiquidacionModal, OPCIONES_MODAL);
    ref.componentInstance.mensajeroId = mensajero.id;
    ref.result.then(
      (r) => {
        const l = this.data.generarLiquidacion(mensajero.id, r.desde, r.hasta, r.ajuste);
        if (l) this.alert.exito(`Liquidación ${l.id} generada para ${mensajero.nombre}`);
        else this.alert.advertencia('No hay comisiones para liquidar en ese período.');
      },
      () => undefined,
    );
  }

  protected ver(l: Liquidacion) {
    const ref = this.modals.open(LiquidacionDetalleModal, { ...OPCIONES_MODAL, backdrop: true, keyboard: true });
    ref.componentInstance.liquidacion = l;
    ref.result.then(() => undefined, () => undefined);
  }

  protected async pagar(l: Liquidacion) {
    const pago = await this.alert.pedirTexto({
      titulo: `¿Marcar ${l.id} como pagada?`,
      mensaje: `Neto a pagar a ${this.data.nombreMensajero(l.mensajeroId)}: ${this.moneda(l.neto)}.`,
      etiqueta: 'Medio y referencia del pago',
      placeholder: 'Ej. Transferencia, operación 123456',
      confirmar: 'Sí, ya se pagó',
      multilinea: false,
      icono: 'question',
    });
    if (pago === null) return;
    if (this.data.pagarLiquidacion(l.id, pago)) this.alert.exito(`${l.id} marcada como pagada`);
    else this.alert.advertencia('Esta liquidación ya no se puede pagar.');
  }

  protected async anular(l: Liquidacion) {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Anular ${l.id}?`,
      mensaje: 'Las comisiones vuelven a quedar sin liquidar para incluirlas en otra liquidación.',
      confirmar: 'Sí, anular',
      cancelar: 'No',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    if (this.data.anularLiquidacion(l.id)) this.alert.exito(`${l.id} anulada`);
  }

  protected async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alert.advertencia('Revisá los porcentajes: tienen que estar entre 0 y 100.');
      return;
    }
    const confirmado = await this.alert.confirmar({
      titulo: '¿Guardar las comisiones?',
      mensaje: 'Valen para las entregas futuras. Lo que ya se entregó conserva su porcentaje.',
      confirmar: 'Sí, guardar',
      tipo: 'info',
    });
    if (!confirmado) return;
    this.data.guardarConfigPagos(this.armarConfig());
    this.form.markAsPristine();
    this.alert.exito('Comisiones guardadas');
  }

  private armarConfig(): ConfigPagos {
    const v = this.form.getRawValue();
    const num = (t: string | number) => Number(String(t).replace(',', '.'));
    const soloCargados = (g: Record<string, string>) =>
      Object.fromEntries(Object.entries(g).filter(([, t]) => String(t).trim() !== '').map(([k, t]) => [k, num(t)]));
    return {
      porcentajeGeneral: num(v.general),
      porcentajeIntentoFallido: num(v.fallido),
      porcentajeDevolucion: num(v.devolucion),
      adicionalRetiro: num(v.adicionalRetiro),
      porZona: soloCargados(v.zonas),
      porMensajero: soloCargados(v.mensajeros),
    };
  }

  private construirForm() {
    const cfg = this.data.configPagos();
    const requerido = (min: number, max: number) => [Validators.required, Validators.min(min), Validators.max(max)];
    const grupo = (ids: string[], valores: Record<string, number>) =>
      this.fb.group(Object.fromEntries(ids.map((id) => [id, new FormControl(valores[id] === undefined ? '' : String(valores[id]), { nonNullable: true, validators: [porcentajeOpcional] })]))) as FormGroup<Record<string, FormControl<string>>>;
    return this.fb.group({
      general: [cfg.porcentajeGeneral, requerido(0, 100)],
      fallido: [cfg.porcentajeIntentoFallido, requerido(0, 100)],
      devolucion: [cfg.porcentajeDevolucion, requerido(0, 100)],
      adicionalRetiro: [cfg.adicionalRetiro, requerido(0, 1_000_000)],
      zonas: grupo(ZONAS.map((z) => z.id), cfg.porZona),
      mensajeros: grupo(this.data.mensajeros().map((m) => m.id), cfg.porMensajero),
    });
  }
}
