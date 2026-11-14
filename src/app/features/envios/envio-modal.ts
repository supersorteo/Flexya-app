import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Envio, NuevoEnvio, Producto, RetiroEnvio, ZONAS, direccionCompleta, ETIQUETA_FRANJA, Franja, resumenItems, sumarDiasISO, volumenProducto, zonaDe } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { MaskDirective } from '../../shared/forms/mask.directive';
import {
  direccionEnvioValidator, enteroValidator, formatearTelefono, nombreValidator, telefonoNacional, telefonoValidator,
} from '../../shared/forms/validators';
import { Mensajes, Paso, WizardModal } from '../../shared/forms/wizard-modal';

type FilaForm = FormGroup<{ productoId: FormControl<string>; cantidad: FormControl<string> }>;

const PASOS: readonly Paso[] = [
  { titulo: 'Productos', campos: ['items'] },
  { titulo: 'Destinatario', campos: ['destinatario', 'telefono', 'localidad', 'direccion'] },
  { titulo: 'Retiro', campos: ['retiro', 'programar', 'fechaRetiro', 'franja'] },
];

const MENSAJES: Mensajes = {
  items: {
    repetido: 'Un producto está repetido. Sumá las cantidades en una sola fila.',
    stock: 'Alguna cantidad supera el stock disponible.',
  },
  destinatario: {
    required: 'Ingresá el nombre del destinatario.',
    minlength: 'Debe tener al menos 3 caracteres.',
    maxlength: 'Máximo 80 caracteres.',
    nombre: "Solo letras, números y los signos . , & ' -",
  },
  telefono: {
    required: 'Ingresá el teléfono del destinatario.',
    telefono: 'Ingresá los 10 dígitos (código de área + número), sin 0 ni 15. Ej: 11 5555 0000.',
  },
  localidad: { required: 'Seleccioná la localidad del destinatario.' },
  direccion: {
    required: 'Ingresá la dirección de entrega.',
    minlength: 'Ingresá calle y número completos.',
    maxlength: 'Máximo 120 caracteres.',
    direccion: 'Incluí la calle y la altura. Ej: Av. Cabildo 1840, 3° B.',
  },
  retiro: { required: 'Elegí cómo llega el paquete a Flexya.' },
  fechaRetiro: {
    required: 'Elegí la fecha.',
    fecha: 'Ingresá una fecha válida.',
    pasada: 'Elegí una fecha a partir de la próxima disponible.',
    lejana: 'Máximo 30 días desde hoy.',
    inhabil: 'Ese día no hay retiros (fin de semana o feriado).',
  },
};

const sinRepetidos = (control: AbstractControl): ValidationErrors | null => {
  const ids = (control.value as { productoId: string }[]).map((f) => f.productoId).filter(Boolean);
  return new Set(ids).size === ids.length ? null : { repetido: true };
};

@Component({
  selector: 'fx-envio-modal',
  imports: [ReactiveFormsModule, MaskDirective, CurrencyPipe, DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i [class]="'bi ' + (envio ? 'bi-pencil-square' : 'bi-truck')" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">{{ envio ? 'Editar envío ' + envio.id : 'Nuevo envío' }}</h2>
            <p class="fx-muted small mb-0">{{ envio ? (envio.estado === 'Borrador' ? 'Todavía no pediste el servicio: podés editarlo o solicitarlo cuando quieras.' : envio.estado === 'En revisión' ? 'Corregí el contenido para que coincida con lo que enviaste realmente.' : 'Podés cambiarlo mientras no llegue a Flexya.') : 'Elegí qué mandás, a quién y cómo llega a Flexya.' }}</p>
          </div>
        </div>
        <button type="button" class="btn-close" aria-label="Cerrar" (click)="cancelar()"></button>
      </div>

      <div class="fx-stepper">
        <ol class="fx-steps" aria-label="Pasos del formulario">
          @for (p of pasos; track p.titulo; let i = $index) {
            <li [class.active]="paso() === i" [class.done]="i < paso()" [class.error]="pasoConError(i)">
              <button type="button" (click)="ir(i)" [attr.aria-current]="paso() === i ? 'step' : null">
                <span class="fx-step-dot">
                  @if (pasoConError(i)) { <i class="bi bi-exclamation-lg" aria-hidden="true"></i> }
                  @else if (i < paso()) { <i class="bi bi-check2" aria-hidden="true"></i> }
                  @else { {{ i + 1 }} }
                </span>
                <span class="fx-step-label">{{ p.titulo }}</span>
              </button>
            </li>
          }
        </ol>
        <div class="fx-step-bar" aria-hidden="true"><div [style.width.%]="((paso() + 1) / pasos.length) * 100"></div></div>
        <div class="fx-step-count">Paso {{ paso() + 1 }} de {{ pasos.length }} · {{ pasos[paso()].titulo }}</div>
      </div>

      <div class="modal-body fx-modal-body">
        @if (paso() === 0) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Productos del envío</h3>
          @if (productosFaltantes) {
            <div class="fx-verif warn mt-0 mb-3">
              <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              <div><strong>{{ productosFaltantes }} {{ productosFaltantes === 1 ? 'producto ya no existe' : 'productos ya no existen' }}</strong><small>No se incluyeron. Elegí otros para completar el envío.</small></div>
            </div>
          }
          @if (!misProductos().length) {
            <div class="fx-empty-box">
              <i class="bi bi-box-seam" aria-hidden="true"></i>
              <p class="mb-3">Todavía no cargaste productos. Creá al menos uno para poder armar un envío.</p>
              <button type="button" class="btn btn-primary" (click)="irAProductos()"><i class="bi bi-plus-lg"></i>Cargar mis productos</button>
            </div>
          } @else {
            @if (sinStockTotal()) {
              <div class="fx-verif warn mt-0 mb-3">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <div><strong>Todos tus productos están agotados</strong><small>Cargá stock desde Productos para poder armar un envío.</small></div>
              </div>
            }
            <div class="fx-lineas" formArrayName="items">
              @for (fila of filas.controls; track fila; let i = $index) {
                <div class="fx-linea" [formGroupName]="i">
                  <div class="fx-linea-producto">
                    <label class="form-label" [for]="'e-prod-' + i">Producto</label>
                    <select [id]="'e-prod-' + i" class="form-select" formControlName="productoId" [class.is-invalid]="errorFila(fila, 'productoId')">
                      <option value="" disabled>Elegí un producto…</option>
                      @for (p of disponibles(i); track p.id) { <option [value]="p.id" [disabled]="stockDe(p.id) === 0">{{ p.nombre }} · {{ stockDe(p.id) === 0 ? 'agotado' : stockDe(p.id) + ' en stock' }}</option> }
                    </select>
                    @if (detalleProducto(fila.controls.productoId.value); as info) { <div class="form-text">{{ info }}</div> }
                    @if (errorFila(fila, 'productoId'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                  </div>
                  <div class="fx-linea-cantidad">
                    <label class="form-label" [for]="'e-cant-' + i">Cantidad</label>
                    <div class="input-group">
                      <button type="button" class="btn btn-outline-secondary" (click)="cambiarCantidad(i, -1)" aria-label="Restar una unidad"><i class="bi bi-dash"></i></button>
                      <input [id]="'e-cant-' + i" class="form-control text-center" formControlName="cantidad" fxMask="cantidad" inputmode="numeric"
                        autocomplete="off" [class.is-invalid]="errorFila(fila, 'cantidad')" />
                      <button type="button" class="btn btn-outline-secondary" (click)="cambiarCantidad(i, 1)" aria-label="Sumar una unidad"><i class="bi bi-plus"></i></button>
                    </div>
                    @if (errorFila(fila, 'cantidad'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                  </div>
                  @if (filas.length > 1 || fila.controls.productoId.value) {
                    <button type="button" class="btn btn-outline-danger fx-linea-quitar" (click)="quitarFila(i)" aria-label="Quitar este producto" title="Quitar este producto"><i class="bi bi-trash3"></i></button>
                  }
                </div>
              }
            </div>
            @if (error('items'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            <div class="fx-agregar-fila">
              <button type="button" class="btn btn-outline-primary" (click)="agregarFila()" [disabled]="!quedanProductos()">
                <i class="bi bi-plus-lg"></i>Agregar otro producto
              </button>
              <small class="fx-muted">{{ avisoRestantes() }}</small>
            </div>

            @if (totales(); as t) {
              <div class="fx-zone-card">
                <span class="fx-zone-icon"><i class="bi bi-boxes" aria-hidden="true"></i></span>
                <div>
                  <strong>{{ t.unidades }} {{ t.unidades === 1 ? 'unidad' : 'unidades' }}@if (t.peso !== null) { · {{ t.peso | number: '1.0-3' }} kg{{ t.completo ? '' : '+' }} }</strong>
                  <small>{{ t.completo ? 'Peso total del envío.' : 'Algún producto no tiene peso cargado: el total es parcial.' }}</small>
                </div>
              </div>
            }
          }
        </section>
        }

        @if (paso() === 1) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Datos del destinatario</h3>
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="e-dest">Destinatario</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-person" aria-hidden="true"></i></span>
                <input id="e-dest" class="form-control" formControlName="destinatario" autocomplete="off" maxlength="80"
                  placeholder="Nombre y apellido" [class.is-invalid]="error('destinatario')" />
              </div>
              @if (error('destinatario'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="e-tel">Teléfono</label>
              <div class="fx-phone" [class.is-invalid]="error('telefono')">
                <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
                <input id="e-tel" type="tel" inputmode="numeric" formControlName="telefono" fxMask="phone" autocomplete="off" placeholder="11 5555 0000" />
                <span class="fx-phone-count" aria-hidden="true">{{ form.controls.telefono.value.length }}/10</span>
              </div>
              @if (error('telefono'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">Para que el mensajero lo pueda llamar.</div> }
            </div>
            <div class="col-12">
              <label class="form-label" for="e-loc">Localidad</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-geo-alt" aria-hidden="true"></i></span>
                <select id="e-loc" class="form-select" formControlName="localidad" [class.is-invalid]="error('localidad')">
                  <option value="" disabled>Seleccioná una localidad…</option>
                  @for (z of zonas; track z.id) {
                    <optgroup [label]="z.nombre">
                      @for (l of z.localidades; track l) { <option [value]="l">{{ l }}</option> }
                    </optgroup>
                  }
                </select>
              </div>
              @if (error('localidad'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12">
              <label class="form-label" for="e-dir">Dirección del destinatario</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-signpost-2" aria-hidden="true"></i></span>
                <input id="e-dir" class="form-control" formControlName="direccion" autocomplete="off" maxlength="120"
                  placeholder="Av. Cabildo 1840, 3° B" [class.is-invalid]="error('direccion')" />
              </div>
              @if (error('direccion'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">Calle, altura y, si corresponde, piso o departamento.</div> }
            </div>
          </div>

          @if (zona(); as z) {
            <div class="fx-zone-card">
              <span class="fx-zone-icon"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i></span>
              <div>
                <strong>{{ z.nombre }}</strong>
                <small>Tarifa de envío {{ z.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</small>
              </div>
            </div>
          }
        </section>
        }

        @if (paso() === 2) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">¿Cómo llega el paquete a Flexya?</h3>
          <div class="fx-tipos" role="radiogroup" aria-label="Retiro">
            @for (r of retiros; track r.id) {
              <label class="fx-plan fx-tipo" [class.selected]="form.controls.retiro.value === r.id">
                <input type="radio" formControlName="retiro" [value]="r.id" class="visually-hidden" />
                <span class="fx-tipo-icon"><i [class]="'bi bi-' + r.icono" aria-hidden="true"></i></span>
                <span><strong>{{ r.etiqueta }}</strong><small>{{ r.detalle }}</small></span>
              </label>
            }
          </div>
          @if (error('retiro'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
          @if (form.controls.retiro.value === 'domicilio') {
            <div class="fx-addr-preview"><i class="bi bi-house-door" aria-hidden="true"></i><span>El mensajero pasa a buscarlo por: <strong>{{ domicilioCliente() || 'tu domicilio registrado' }}</strong></span></div>
          }

          <h3 class="fx-modal-section">{{ form.controls.retiro.value === 'deposito' ? '¿Cuándo lo llevás?' : '¿Cuándo pasamos?' }}</h3>
          <div class="fx-tipos" role="radiogroup" aria-label="Cuándo">
            <label class="fx-plan fx-tipo" [class.selected]="!form.controls.programar.value">
              <input type="radio" formControlName="programar" [value]="false" class="visually-hidden" />
              <span class="fx-tipo-icon"><i class="bi bi-lightning-charge" aria-hidden="true"></i></span>
              <span><strong>Lo antes posible</strong><small>{{ form.controls.retiro.value === 'deposito' ? 'Lo llevás a más tardar el' : 'Pasamos a retirarlo el' }} {{ fechaMinima() | date: 'EEEE d/MM' }}</small></span>
            </label>
            <label class="fx-plan fx-tipo" [class.selected]="form.controls.programar.value">
              <input type="radio" formControlName="programar" [value]="true" class="visually-hidden" />
              <span class="fx-tipo-icon"><i class="bi bi-calendar-event" aria-hidden="true"></i></span>
              <span><strong>Programar otro día</strong><small>Elegí la fecha{{ form.controls.retiro.value === 'domicilio' ? ' y la franja horaria' : '' }}</small></span>
            </label>
          </div>
          @if (form.controls.programar.value) {
            <div class="row g-3 mt-1">
              <div class="col-12 col-md-6">
                <label class="form-label" for="e-fecha">Fecha</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-calendar-event" aria-hidden="true"></i></span>
                  <input id="e-fecha" type="date" class="form-control" formControlName="fechaRetiro" [min]="fechaMinima()" [max]="fechaMaxima" [class.is-invalid]="error('fechaRetiro')" />
                </div>
                @if (error('fechaRetiro'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                @else { <div class="form-text">Solo días hábiles, hasta 30 días desde hoy.</div> }
              </div>
              @if (form.controls.retiro.value === 'domicilio') {
                <div class="col-12 col-md-6">
                  <label class="form-label" for="e-franja">Franja horaria</label>
                  <select id="e-franja" class="form-select" formControlName="franja">
                    @for (f of franjas; track f.id) { <option [value]="f.id">{{ f.etiqueta }}</option> }
                  </select>
                </div>
              }
            </div>
          }

          <h3 class="fx-modal-section">Resumen</h3>
          <dl class="fx-datos">
            @if (totales(); as t) {
              <div><dt>Productos</dt><dd>{{ t.unidades }} {{ t.unidades === 1 ? 'unidad' : 'unidades' }}@if (t.peso !== null) { · {{ t.peso | number: '1.0-3' }} kg }</dd></div>
            }
            <div><dt>Destinatario</dt><dd>{{ form.controls.destinatario.value || '—' }}</dd></div>
            <div><dt>{{ form.controls.retiro.value === 'deposito' ? 'Llegada' : 'Retiro' }}</dt><dd>{{ fechaEfectiva() | date: 'EEE dd/MM/yyyy' }}{{ form.controls.programar.value ? ' (programado)' : '' }}</dd></div>
            <div><dt>Destino</dt><dd>{{ form.controls.direccion.value || '—' }}, {{ form.controls.localidad.value || '—' }}</dd></div>
            @if (zona(); as z) {
              <div><dt>Tarifa ({{ z.nombre }})</dt><dd>{{ z.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</dd></div>
            }
          </dl>
        </section>
        }
      </div>

      <div class="modal-footer fx-modal-foot">
        @if (paso() === 0) {
          <button type="button" class="btn btn-outline-secondary" (click)="cancelar()">Cancelar</button>
        } @else {
          <button type="button" class="btn btn-outline-secondary" (click)="anterior()"><i class="bi bi-arrow-left" aria-hidden="true"></i>Anterior</button>
        }
        @if (esUltimo()) {
          @if (esBorrador()) {
            <button type="button" class="btn btn-outline-secondary" (click)="guardarBorrador()"><i class="bi bi-file-earmark" aria-hidden="true"></i>Guardar borrador</button>
          }
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>{{ esBorrador() ? 'Solicitar envío' : 'Guardar cambios' }}</button>
        } @else {
          <button type="submit" class="btn btn-primary" [disabled]="paso() === 0 && !misProductos().length">Siguiente<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
        }
      </div>
    </form>
  `,
})
export class EnvioModal extends WizardModal implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  clienteId = '';
  envio: Envio | null = null;
  protected productosFaltantes = 0;
  protected readonly pasos = PASOS;
  protected readonly mensajes = MENSAJES;
  protected readonly zonas = ZONAS;
  protected readonly retiros: { id: RetiroEnvio; etiqueta: string; detalle: string; icono: string }[] = [
    { id: 'domicilio', etiqueta: 'Retirar en mi domicilio', detalle: 'El mensajero pasa a buscar el paquete por tu puerta', icono: 'house-door' },
    { id: 'deposito', etiqueta: 'Lo llevo al depósito', detalle: 'Vos dejás el paquete en el depósito de Flexya', icono: 'building' },
  ];

  private readonly stockValido = (control: AbstractControl): ValidationErrors | null => {
    const filas = control.value as { productoId: string; cantidad: string }[];
    return filas.some((f) => f.productoId && Number(f.cantidad) > this.stockDe(f.productoId)) ? { stock: true } : null;
  };

  private readonly fechaProgramadaValidator = (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent?.get('programar')?.value) return null;
    const v = String(control.value ?? '');
    if (!v) return { required: true };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { fecha: true };
    if (v < this.data.proximaFechaRetiro()) return { pasada: true };
    if (v > sumarDiasISO(30)) return { lejana: true };
    return this.data.esDiaHabil(v) ? null : { inhabil: true };
  };

  protected readonly form = this.fb.group({
    items: this.fb.array<FilaForm>([this.nuevaFila()], [sinRepetidos, this.stockValido]),
    destinatario: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80), nombreValidator]],
    telefono: ['', [Validators.required, telefonoValidator]],
    localidad: ['', Validators.required],
    direccion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120), direccionEnvioValidator]],
    retiro: ['' as RetiroEnvio | '', Validators.required],
    programar: [false],
    fechaRetiro: ['', this.fechaProgramadaValidator],
    franja: ['manana' as Franja],
  });

  private readonly revalidarFecha = this.form.controls.programar.valueChanges
    .pipe(takeUntilDestroyed())
    .subscribe(() => this.form.controls.fechaRetiro.updateValueAndValidity());

  protected readonly fechaMaxima = sumarDiasISO(30);
  protected readonly franjas = (Object.keys(ETIQUETA_FRANJA) as Franja[]).map((id) => ({ id, etiqueta: ETIQUETA_FRANJA[id] }));
  private borrador = false;

  protected fechaMinima(): string {
    return this.data.proximaFechaRetiro();
  }

  protected fechaEfectiva(): string {
    const v = this.form.getRawValue();
    return v.programar && v.fechaRetiro ? v.fechaRetiro : (this.envio && !this.envio.retiroProgramado && this.envio.fechaRetiro) || this.fechaMinima();
  }

  private readonly localidadSel = toSignal(this.form.controls.localidad.valueChanges, { initialValue: '' });
  protected readonly zona = computed(() => zonaDe(this.localidadSel()));

  ngOnInit() {
    const e = this.envio;
    if (!e) return;
    const existentes = new Set(this.misProductos().map((p) => p.id));
    const previos = e.items.filter((i) => existentes.has(i.productoId));
    this.productosFaltantes = e.items.length - previos.length;
    this.filas.clear();
    for (const item of previos.length ? previos : [null]) {
      const fila = this.nuevaFila();
      if (item) fila.patchValue({ productoId: item.productoId, cantidad: String(item.cantidad) });
      this.filas.push(fila);
    }
    this.form.patchValue({
      destinatario: e.destinatario,
      telefono: telefonoNacional(e.telefono),
      localidad: e.localidad,
      direccion: e.direccion,
      retiro: e.retiro,
      programar: e.retiroProgramado,
      fechaRetiro: e.retiroProgramado ? (e.fechaRetiro ?? '') : '',
      franja: e.franja ?? 'manana',
    });
  }

  protected esBorrador(): boolean {
    return !this.envio || this.envio.estado === 'Borrador';
  }

  protected async guardarBorrador(): Promise<void> {
    this.borrador = true;
    try {
      await this.guardar();
    } finally {
      this.borrador = false;
    }
  }

  protected get filas() {
    return this.form.controls.items;
  }

  protected misProductos(): Producto[] {
    return this.data.productos().filter((p) => p.clienteId === this.clienteId);
  }

  protected restantes(): Producto[] {
    const usados = this.filas.controls.map((f) => f.controls.productoId.value);
    return this.misProductos().filter((p) => !usados.includes(p.id) && this.stockDe(p.id) > 0);
  }

  protected stockDe(id: string): number {
    const producto = this.misProductos().find((p) => p.id === id);
    if (!producto) return 0;
    const reservado = this.envio && this.envio.estado !== 'Borrador' ? (this.envio.items.find((i) => i.productoId === id)?.cantidad ?? 0) : 0;
    return producto.stock + reservado;
  }

  protected sinStockTotal(): boolean {
    return this.misProductos().every((p) => this.stockDe(p.id) === 0);
  }

  protected avisoRestantes(): string {
    const n = this.restantes().length;
    if (n) return n + (n === 1 ? ' disponible' : ' disponibles');
    const usados = this.filas.controls.map((f) => f.controls.productoId.value);
    return this.misProductos().every((p) => usados.includes(p.id)) ? 'Ya agregaste todos tus productos' : 'El resto de tus productos está agotado';
  }

  protected quedanProductos(): boolean {
    return this.restantes().length > 0;
  }

  protected disponibles(indice: number): Producto[] {
    const otros = this.filas.controls.filter((_, i) => i !== indice).map((f) => f.controls.productoId.value);
    return this.misProductos().filter((p) => !otros.includes(p.id));
  }

  protected agregarFila() {
    this.filas.push(this.nuevaFila());
    this.form.markAsDirty();
  }

  protected async quitarFila(indice: number) {
    const fila = this.filas.at(indice);
    const producto = this.misProductos().find((p) => p.id === fila.controls.productoId.value);
    if (producto) {
      const confirmado = await this.alert.confirmar({
        titulo: `¿Quitar ${producto.nombre} del envío?`,
        mensaje: 'Podés volver a agregarlo cuando quieras.',
        confirmar: 'Sí, quitar',
        cancelar: 'No, dejarlo',
        tipo: 'peligro',
      });
      if (!confirmado) return;
    }
    if (this.filas.length > 1) this.filas.removeAt(indice);
    else fila.reset({ productoId: '', cantidad: '1' });
    this.form.markAsDirty();
    this.cdr.markForCheck();
  }

  protected cambiarCantidad(indice: number, delta: number) {
    const control = this.filas.at(indice).controls.cantidad;
    const actual = Number(control.value) || 0;
    const id = this.filas.at(indice).controls.productoId.value;
    const tope = id ? Math.max(1, Math.min(10000, this.stockDe(id))) : 10000;
    control.setValue(String(Math.min(tope, Math.max(1, actual + delta))));
    control.markAsDirty();
  }

  protected errorFila(fila: FilaForm, campo: 'productoId' | 'cantidad'): string {
    const c = fila.controls[campo];
    const id = fila.controls.productoId.value;
    if (campo === 'cantidad' && id && Number(c.value) > this.stockDe(id)) return `Solo hay ${this.stockDe(id)} en stock.`;
    if (!c.invalid || !(c.touched || c.dirty)) return '';
    if (campo === 'productoId') return 'Elegí un producto.';
    return c.hasError('required') ? 'Ingresá la cantidad.' : 'Entre 1 y 10.000 unidades.';
  }

  protected detalleProducto(id: string): string {
    const p = this.misProductos().find((x) => x.id === id);
    if (!p) return '';
    const partes: string[] = [];
    if (p.peso !== null) partes.push(`${p.peso.toLocaleString('es-AR')} kg`);
    if (volumenProducto(p) !== null) partes.push(`${p.alto} × ${p.ancho} × ${p.largo} cm`);
    return partes.join(' · ');
  }

  protected totales() {
    const lineas = this.filas.controls.flatMap((f) => {
      const p = this.misProductos().find((x) => x.id === f.controls.productoId.value);
      const cantidad = Number(f.controls.cantidad.value);
      return p && cantidad >= 1 ? [{ cantidad, peso: p.peso }] : [];
    });
    return lineas.length ? resumenItems(lineas) : null;
  }

  protected domicilioCliente(): string {
    const cliente = this.data.clientes().find((c) => c.id === this.clienteId);
    return cliente ? direccionCompleta(cliente) : '';
  }

  protected irAProductos() {
    this.modal.dismiss();
    void this.router.navigate(['/cliente/productos']);
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.irAlPrimerPasoConError();
      return;
    }
    const v = this.form.getRawValue();
    const limpiar = (texto: string) => texto.trim().replace(/\s+/g, ' ');
    const resultado: NuevoEnvio = {
      destinatario: limpiar(v.destinatario),
      telefono: formatearTelefono(v.telefono),
      direccion: limpiar(v.direccion),
      localidad: v.localidad,
      retiro: v.retiro as RetiroEnvio,
      programado: v.programar,
      fechaRetiro: v.programar ? v.fechaRetiro : null,
      franja: v.programar && v.retiro === 'domicilio' ? v.franja : null,
      ...(this.borrador ? { borrador: true } : {}),
      items: v.items.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
    };
    const unidades = resultado.items!.reduce((total, i) => total + i.cantidad, 0);
    const confirmado = await this.alert.confirmar({
      titulo: this.borrador ? '¿Guardar como borrador?' : this.esBorrador() ? '¿Solicitar el envío?' : '¿Guardar los cambios?',
      mensaje: `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} para ${resultado.destinatario} en ${resultado.localidad}.${this.borrador ? ' Todavía no se reserva stock ni se pide el servicio.' : ''}`,
      confirmar: this.borrador ? 'Sí, guardar borrador' : this.esBorrador() ? 'Sí, solicitar' : 'Sí, guardar',
      tipo: 'info',
    });
    if (confirmado) this.modal.close(resultado);
  }

  private nuevaFila(): FilaForm {
    return this.fb.group({
      productoId: ['', Validators.required],
      cantidad: ['1', [Validators.required, enteroValidator(1, 10000)]],
    });
  }
}
