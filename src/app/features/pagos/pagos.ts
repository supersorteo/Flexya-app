import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
    <fx-page-header title="Pagos a mensajeros" subtitle="Cuánto gana cada mensajero y cómo se le paga." />

    <ol class="fx-pasos-pago" aria-label="Cómo funciona">
      <li><span class="fx-paso-num">1</span><div><strong>Definís cuánto gana</strong><small>Un porcentaje de cada envío que entrega</small></div></li>
      <li><span class="fx-paso-num">2</span><div><strong>El sistema lo va sumando</strong><small>Cada vez que un mensajero entrega</small></div></li>
      <li><span class="fx-paso-num">3</span><div><strong>Le pagás y lo marcás</strong><small>Una vez por semana o quincena</small></div></li>
    </ol>

    <div class="fx-kpi-grid">
      <fx-kpi label="Ingresos por entregas" [value]="moneda(resumen().ingresos)" foot="lo que cobraste por envíos entregados" icon="cash-coin" tone="teal" />
      <fx-kpi label="Para los mensajeros" [value]="moneda(resumen().comisionado)" foot="lo que ganaron en total" icon="truck" tone="blue" />
      <fx-kpi label="Falta pagar" [value]="moneda(resumen().pendiente)" foot="ganado y todavía no cobrado" icon="hourglass-split" tone="amber" />
      <fx-kpi label="Te queda a vos" [value]="moneda(resumen().margen)" foot="ingresos menos lo de los mensajeros" icon="graph-up-arrow" tone="purple" />
    </div>

    <section class="fx-panel fx-form-panel mb-4">
      <h2 class="h6 mb-3"><span class="fx-paso-num">1</span> ¿Cuánto gana el mensajero por cada envío?</h2>
      <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <div class="row g-3 align-items-center">
          <div class="col-12 col-md-4">
            <label class="form-label" for="cf-general">Porcentaje de la tarifa</label>
            <div class="input-group">
              <input id="cf-general" type="number" min="0" max="100" step="0.5" class="form-control form-control-lg" formControlName="general" [class.is-invalid]="invalido(form.controls.general)" />
              <span class="input-group-text">%</span>
            </div>
            <div class="form-text">Es lo que gana por cada envío que entrega.</div>
          </div>
          <div class="col-12 col-md-8">
            <div class="fx-ejemplo" aria-live="polite">
              <small>Ejemplo con un envío de {{ moneda(muestra) }}</small>
              <div class="fx-ejemplo-fila">
                <span><i class="bi bi-truck" aria-hidden="true"></i> El mensajero gana <strong>{{ moneda(ganaGeneral()) }}</strong></span>
                <span><i class="bi bi-building" aria-hidden="true"></i> Flexya se queda con <strong>{{ moneda(muestra - ganaGeneral()) }}</strong></span>
              </div>
            </div>
          </div>
        </div>
        <p class="small fx-muted mt-3 mb-3">{{ resumenReglas() }}</p>

        @if (mensajeros().length) {
          <h3 class="fx-modal-section">Porcentaje de cada mensajero</h3>
          <p class="small fx-muted">Si lo dejás vacío, cobra el porcentaje de arriba. Si escribís un número, ese manda.</p>
          <div class="fx-excepciones mb-3" formGroupName="mensajeros">
            @for (m of mensajeros(); track m.id) {
              <div class="fx-excepcion">
                <label [for]="'cm-' + m.id"><strong>{{ m.nombre }}</strong><small>{{ data.nombreZona(m.zonaId) }}</small></label>
                <div class="input-group input-group-sm">
                  <input [id]="'cm-' + m.id" type="number" min="0" max="100" step="0.5" class="form-control" [formControlName]="m.id" [placeholder]="'Igual (' + pctGeneral() + '%)'" [class.is-invalid]="invalido(form.controls.mensajeros.controls[m.id])" />
                  <span class="input-group-text">%</span>
                </div>
                <small class="fx-muted">De un envío de {{ moneda(muestra) }}, gana {{ moneda(gananciaMensajero(m.id)) }}</small>
              </div>
            }
          </div>
        }

        <details class="fx-opcional">
          <summary>Pagar distinto en algunas zonas <span class="fx-muted">(opcional)</span></summary>
          <p class="small fx-muted mt-2">Dejá vacío lo que quieras que siga el porcentaje de arriba. Si completás un número, ese manda.</p>
          <div class="fx-excepciones" formGroupName="zonas">
            @for (z of zonas; track z.id) {
              <div class="fx-excepcion">
                <label [for]="'cz-' + z.id"><strong>{{ z.nombre }}</strong><small>Tarifa {{ moneda(z.tarifa) }}</small></label>
                <div class="input-group input-group-sm">
                  <input [id]="'cz-' + z.id" type="number" min="0" max="100" step="0.5" class="form-control" [formControlName]="z.id" placeholder="Igual" [class.is-invalid]="invalido(form.controls.zonas.controls[z.id])" />
                  <span class="input-group-text">%</span>
                </div>
                <small class="fx-muted">Gana {{ moneda(gananciaZona(z.id, z.tarifa)) }} por envío</small>
              </div>
            }
          </div>
        </details>

        <details class="fx-opcional">
          <summary>Si no se puede entregar, y extras <span class="fx-muted">(opcional)</span></summary>
          <div class="row g-3 mt-1">
            <div class="col-12 col-md-4">
              <label class="form-label" for="cf-fallido">Si fue a entregar y no había nadie</label>
              <div class="input-group"><input id="cf-fallido" type="number" min="0" max="100" step="5" class="form-control" formControlName="fallido" [class.is-invalid]="invalido(form.controls.fallido)" /><span class="input-group-text">%</span></div>
              <div class="form-text">Cobra ese porcentaje de lo que habría ganado. Con 0 no cobra nada.</div>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="cf-devolucion">Si lleva un paquete de vuelta al cliente</label>
              <div class="input-group"><input id="cf-devolucion" type="number" min="0" max="100" step="5" class="form-control" formControlName="devolucion" [class.is-invalid]="invalido(form.controls.devolucion)" /><span class="input-group-text">%</span></div>
              <div class="form-text">Cobra ese porcentaje de lo que habría ganado. Con 0 no cobra nada.</div>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="cf-retiro">Por ir a buscar al domicilio</label>
              <div class="input-group"><span class="input-group-text">$</span><input id="cf-retiro" type="number" min="0" step="50" class="form-control" formControlName="adicionalRetiro" [class.is-invalid]="invalido(form.controls.adicionalRetiro)" /></div>
              <div class="form-text">Monto fijo que cobra de más, una sola vez por retiro.</div>
            </div>
          </div>
        </details>

        <div class="fx-form-actions">
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2"></i>Guardar</button>
        </div>
      </form>
    </section>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head">
        <div>
          <div class="fx-panel-title"><span class="fx-paso-num">2</span> Lo que cada mensajero ya ganó</div>
          <div class="fx-muted small">Todavía no se le pagó. Tocá "Liquidar" para pagarle lo acumulado.</div>
        </div>
      </div>
      @if (porLiquidar().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Comisiones por liquidar">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Mensajero</th><th>Entregas y extras</th><th>Acumulado</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (f of porLiquidar(); track f.mensajero.id) {
                <tr>
                  <td data-label="Mensajero"><strong>{{ f.mensajero.nombre }}</strong></td>
                  <td data-label="Entregas y extras">{{ f.cantidad }}</td>
                  <td data-label="Acumulado"><strong>{{ f.monto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
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
        <div class="text-center fx-muted py-4 px-3">Nadie tiene nada acumulado. Cuando un mensajero entregue un envío, aparece acá.</div>
      }
    </section>

    <section class="fx-panel mb-4">
      <div class="fx-panel-head">
        <div>
          <div class="fx-panel-title"><span class="fx-paso-num">3</span> Pagos</div>
          <div class="fx-muted small">"Generada" quiere decir que falta pagarla. "Pagada", que ya le pagaste.</div>
        </div>
        <span class="fx-muted small">{{ liquidaciones().length }} en total</span>
      </div>
      @if (liquidaciones().length) {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Liquidaciones">
          <table class="fx-table fx-table--filas">
            <thead><tr><th>Liquidación</th><th>Mensajero</th><th>Período</th><th>A pagar</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (l of liquidaciones(); track l.id) {
                <tr>
                  <td data-label="Liquidación"><strong>{{ l.id }}</strong><span class="fx-sub">{{ l.creadaEn | date: 'dd/MM/yy' }}</span></td>
                  <td data-label="Mensajero">{{ data.nombreMensajero(l.mensajeroId) }}</td>
                  <td data-label="Período">{{ l.desde | date: 'dd/MM' }} al {{ l.hasta | date: 'dd/MM/yy' }}</td>
                  <td data-label="A pagar"><strong>{{ l.neto | currency: 'ARS' : 'symbol-narrow' : '1.0-2' }}</strong></td>
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
        <div class="text-center fx-muted py-4 px-3">Todavía no generaste ningún pago.</div>
      }
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

  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly actual = computed(() => {
    this.valores();
    return this.form.getRawValue();
  });
  protected readonly muestra = ZONAS[0]?.tarifa ?? 2200;
  protected readonly pctGeneral = computed(() => this.pct(this.actual().general));
  protected readonly ganaGeneral = computed(() => this.ganancia(this.muestra, this.pctGeneral()));
  protected readonly resumenReglas = computed(() => {
    const v = this.actual();
    const cargados = (g: Record<string, string>) => Object.values(g).filter((t) => String(t).trim() !== '').length;
    const zonas = cargados(v.zonas);
    const mensajeros = cargados(v.mensajeros);
    const partes = [`Hoy se paga el ${this.pctGeneral()}% por cada envío entregado`];
    if (zonas) partes.push(`${zonas} ${zonas === 1 ? 'zona' : 'zonas'} con otro porcentaje`);
    if (mensajeros) partes.push(`${mensajeros} ${mensajeros === 1 ? 'mensajero' : 'mensajeros'} con otro porcentaje`);
    if (this.pct(v.fallido) > 0) partes.push(`${this.pct(v.fallido)}% si no se puede entregar`);
    return partes.join(', ') + '.';
  });

  private pct(texto: string | number): number {
    const n = Number(String(texto).replace(',', '.'));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }

  private ganancia(base: number, porcentaje: number): number {
    return Math.round(base * porcentaje) / 100;
  }

  protected gananciaZona(zonaId: string, tarifa: number): number {
    const texto = this.actual().zonas[zonaId];
    return this.ganancia(tarifa, String(texto ?? '').trim() === '' ? this.pctGeneral() : this.pct(texto));
  }

  protected gananciaMensajero(mensajeroId: string): number {
    const texto = this.actual().mensajeros[mensajeroId];
    return this.ganancia(this.muestra, String(texto ?? '').trim() === '' ? this.pctGeneral() : this.pct(texto));
  }

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
    this.data.guardarConfigPagos(this.armarConfig());
    this.form.markAsPristine();
    this.alert.exito('Comisiones guardadas. Valen para las próximas entregas.');
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
