import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ETIQUETA_FRANJA, Franja, NuevoPedidoRetiro, Producto, RetiroEnvio, ZONAS, direccionCompleta, sumarDiasISO, zonaDe } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { MaskDirective } from '../../shared/forms/mask.directive';
import {
  direccionEnvioValidator, enteroValidator, formatearTelefono, nombreValidator, telefonoValidator,
} from '../../shared/forms/validators';
import { Mensajes, Paso, WizardModal } from '../../shared/forms/wizard-modal';

type FilaForm = FormGroup<{ productoId: FormControl<string>; cantidad: FormControl<string> }>;
type DestinoForm = FormGroup<{
  destinatario: FormControl<string>;
  telefono: FormControl<string>;
  localidad: FormControl<string>;
  direccion: FormControl<string>;
  items: FormArray<FilaForm>;
}>;
type CampoDestino = 'destinatario' | 'telefono' | 'localidad' | 'direccion';

const PASOS: readonly Paso[] = [
  { titulo: 'Retiro', campos: ['retiro', 'programar', 'fechaRetiro', 'franja'] },
  { titulo: 'Destinatarios', campos: ['destinos'] },
  { titulo: 'Resumen', campos: [] },
];

const MENSAJES: Mensajes = {
  retiro: { required: 'Elegí cómo llegan los paquetes a Flexya.' },
  fechaRetiro: {
    required: 'Elegí la fecha.',
    fecha: 'Ingresá una fecha válida.',
    pasada: 'Elegí una fecha a partir de la próxima disponible.',
    lejana: 'Máximo 30 días desde hoy.',
    inhabil: 'Ese día no hay retiros (fin de semana o feriado).',
  },
  destinos: { stock: 'Entre todos los destinatarios superás el stock disponible de algún producto.' },
};

const MENSAJES_DESTINO: Record<CampoDestino, Record<string, string>> = {
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
};

const sinRepetidos = (control: AbstractControl): ValidationErrors | null => {
  const ids = (control.value as { productoId: string }[]).map((f) => f.productoId).filter(Boolean);
  return new Set(ids).size === ids.length ? null : { repetido: true };
};

@Component({
  selector: 'fx-retiro-modal',
  imports: [ReactiveFormsModule, MaskDirective, CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i class="bi bi-truck" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">Nuevo retiro</h2>
            <p class="fx-muted small mb-0">Un retiro puede llevar varios destinatarios, cada uno con sus productos.</p>
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
          <h3 class="fx-modal-section">¿Cómo llegan los paquetes a Flexya?</h3>
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
            <div class="fx-addr-preview"><i class="bi bi-house-door" aria-hidden="true"></i><span>El mensajero pasa a buscarlos por: <strong>{{ domicilioCliente() || 'tu domicilio registrado' }}</strong></span></div>
          }

          <h3 class="fx-modal-section">{{ form.controls.retiro.value === 'deposito' ? '¿Cuándo los llevás?' : '¿Cuándo pasamos?' }}</h3>
          <div class="fx-tipos" role="radiogroup" aria-label="Cuándo">
            <label class="fx-plan fx-tipo" [class.selected]="!form.controls.programar.value">
              <input type="radio" formControlName="programar" [value]="false" class="visually-hidden" />
              <span class="fx-tipo-icon"><i class="bi bi-lightning-charge" aria-hidden="true"></i></span>
              <span><strong>Lo antes posible</strong><small>{{ form.controls.retiro.value === 'deposito' ? 'Los llevás a más tardar el' : 'Pasamos a retirarlos el' }} {{ fechaMinima() | date: 'EEEE d/MM' }}</small></span>
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
                <label class="form-label" for="r-fecha">Fecha</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-calendar-event" aria-hidden="true"></i></span>
                  <input id="r-fecha" type="date" class="form-control" formControlName="fechaRetiro" [min]="fechaMinima()" [max]="fechaMaxima" [class.is-invalid]="error('fechaRetiro')" />
                </div>
                @if (error('fechaRetiro'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                @else { <div class="form-text">Solo días hábiles, hasta 30 días desde hoy.</div> }
              </div>
              @if (form.controls.retiro.value === 'domicilio') {
                <div class="col-12 col-md-6">
                  <label class="form-label" for="r-franja">Franja horaria</label>
                  <select id="r-franja" class="form-select" formControlName="franja">
                    @for (f of franjas; track f.id) { <option [value]="f.id">{{ f.etiqueta }}</option> }
                  </select>
                </div>
              }
            </div>
          }
        </section>
        }

        @if (paso() === 1) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Destinatarios y productos</h3>
          @if (!misProductos().length) {
            <div class="fx-empty-box">
              <i class="bi bi-box-seam" aria-hidden="true"></i>
              <p class="mb-3">Todavía no cargaste productos. Creá al menos uno para poder armar un retiro.</p>
              <button type="button" class="btn btn-primary" (click)="irAProductos()"><i class="bi bi-plus-lg"></i>Cargar mis productos</button>
            </div>
          } @else {
            @if (sinStockTotal()) {
              <div class="fx-verif warn mt-0 mb-3">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <div><strong>Todos tus productos están agotados</strong><small>Cargá stock desde Productos para poder armar un retiro.</small></div>
              </div>
            }
            <div class="fx-destinos" formArrayName="destinos">
              @for (d of destinos.controls; track d; let i = $index) {
                <div class="fx-destino" [class.abierto]="abierto() === i" [class.con-error]="d.invalid && d.touched" [formGroupName]="i">
                  <div class="fx-destino-head">
                    <button type="button" class="fx-destino-titulo" (click)="alternar(i)" [attr.aria-expanded]="abierto() === i">
                      <span class="fx-destino-num">{{ i + 1 }}</span>
                      <span class="fx-destino-resumen">
                        <strong>{{ d.controls.destinatario.value || 'Nuevo destinatario' }}</strong>
                        <small>{{ resumenDestino(d) }}</small>
                      </span>
                      @if (d.invalid && d.touched) { <i class="bi bi-exclamation-circle-fill text-danger" aria-label="Tiene datos por corregir"></i> }
                      <i [class]="'bi ' + (abierto() === i ? 'bi-chevron-up' : 'bi-chevron-down')" aria-hidden="true"></i>
                    </button>
                    @if (destinos.length > 1) {
                      <button type="button" class="btn btn-outline-danger btn-sm" (click)="quitarDestino(i)" aria-label="Quitar este destinatario" title="Quitar este destinatario"><i class="bi bi-trash3"></i></button>
                    }
                  </div>

                  @if (abierto() === i) {
                    <div class="fx-destino-body">
                      <div class="row g-3">
                        <div class="col-12 col-md-6">
                          <label class="form-label" [for]="'d' + i + '-nombre'">Destinatario</label>
                          <div class="input-group">
                            <span class="input-group-text"><i class="bi bi-person" aria-hidden="true"></i></span>
                            <input [id]="'d' + i + '-nombre'" class="form-control" formControlName="destinatario" autocomplete="off" maxlength="80" placeholder="Nombre y apellido" [class.is-invalid]="errorCampo(d, 'destinatario')" />
                          </div>
                          @if (errorCampo(d, 'destinatario'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                        </div>
                        <div class="col-12 col-md-6">
                          <label class="form-label" [for]="'d' + i + '-tel'">Teléfono</label>
                          <div class="fx-phone" [class.is-invalid]="errorCampo(d, 'telefono')">
                            <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
                            <input [id]="'d' + i + '-tel'" type="tel" inputmode="numeric" formControlName="telefono" fxMask="phone" autocomplete="off" placeholder="11 5555 0000" />
                            <span class="fx-phone-count" aria-hidden="true">{{ d.controls.telefono.value.length }}/10</span>
                          </div>
                          @if (errorCampo(d, 'telefono'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                        </div>
                        <div class="col-12 col-md-5">
                          <label class="form-label" [for]="'d' + i + '-loc'">Localidad</label>
                          <select [id]="'d' + i + '-loc'" class="form-select" formControlName="localidad" [class.is-invalid]="errorCampo(d, 'localidad')">
                            <option value="" disabled>Seleccioná una localidad…</option>
                            @for (z of zonas; track z.id) {
                              <optgroup [label]="z.nombre">
                                @for (l of z.localidades; track l) { <option [value]="l">{{ l }}</option> }
                              </optgroup>
                            }
                          </select>
                          @if (errorCampo(d, 'localidad'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                        </div>
                        <div class="col-12 col-md-7">
                          <label class="form-label" [for]="'d' + i + '-dir'">Dirección</label>
                          <input [id]="'d' + i + '-dir'" class="form-control" formControlName="direccion" autocomplete="off" maxlength="120" placeholder="Av. Cabildo 1840, 3° B" [class.is-invalid]="errorCampo(d, 'direccion')" />
                          @if (errorCampo(d, 'direccion'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                        </div>
                      </div>

                      <h4 class="fx-detalle-titulo mt-3">Productos de este destinatario</h4>
                      <div class="fx-lineas" formArrayName="items">
                        @for (fila of d.controls.items.controls; track fila; let j = $index) {
                          <div class="fx-linea" [formGroupName]="j">
                            <div class="fx-linea-producto">
                              <label class="form-label" [for]="'d' + i + '-p' + j">Producto</label>
                              <select [id]="'d' + i + '-p' + j" class="form-select" formControlName="productoId" [class.is-invalid]="errorFila(fila, 'productoId')">
                                <option value="" disabled>Elegí un producto…</option>
                                @for (p of opciones(d, fila); track p.id) {
                                  <option [value]="p.id" [disabled]="restante(p.id, fila) <= 0">{{ p.nombre }} · {{ restante(p.id, fila) > 0 ? restante(p.id, fila) + ' disponibles' : 'sin stock' }}</option>
                                }
                              </select>
                              @if (errorFila(fila, 'productoId'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                            </div>
                            <div class="fx-linea-cantidad">
                              <label class="form-label" [for]="'d' + i + '-c' + j">Cantidad</label>
                              <div class="input-group">
                                <button type="button" class="btn btn-outline-secondary" (click)="cambiarCantidad(fila, -1)" aria-label="Restar una unidad"><i class="bi bi-dash"></i></button>
                                <input [id]="'d' + i + '-c' + j" class="form-control text-center" formControlName="cantidad" fxMask="cantidad" inputmode="numeric" autocomplete="off" [class.is-invalid]="errorFila(fila, 'cantidad')" />
                                <button type="button" class="btn btn-outline-secondary" (click)="cambiarCantidad(fila, 1)" aria-label="Sumar una unidad"><i class="bi bi-plus"></i></button>
                              </div>
                              @if (errorFila(fila, 'cantidad'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                            </div>
                            @if (d.controls.items.length > 1 || fila.controls.productoId.value) {
                              <button type="button" class="btn btn-outline-danger fx-linea-quitar" (click)="quitarFila(d, j)" aria-label="Quitar este producto" title="Quitar este producto"><i class="bi bi-trash3"></i></button>
                            }
                          </div>
                        }
                      </div>
                      <div class="fx-agregar-fila">
                        <button type="button" class="btn btn-outline-primary" (click)="agregarFila(d)" [disabled]="!hayProductos(d)"><i class="bi bi-plus-lg"></i>Agregar otro producto</button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
            @if (error('destinos'); as msg) { <div class="invalid-feedback d-block mt-2">{{ msg }}</div> }
            <button type="button" class="btn btn-outline-primary mt-3" (click)="agregarDestino()"><i class="bi bi-person-plus"></i>Agregar destinatario</button>
          }
        </section>
        }

        @if (paso() === 2) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Resumen del retiro</h3>
          <dl class="fx-datos">
            <div><dt>Retiro</dt><dd>{{ form.controls.retiro.value === 'deposito' ? 'Los llevás al depósito' : 'Retiro en tu domicilio' }}</dd></div>
            <div><dt>{{ form.controls.retiro.value === 'deposito' ? 'Llegada' : 'Retiro' }}</dt><dd>{{ fechaEfectiva() | date: 'EEE dd/MM/yyyy' }}{{ form.controls.programar.value ? ' (programado)' : ' (lo antes posible)' }}</dd></div>
            <div><dt>Destinatarios</dt><dd>{{ destinos.length }}</dd></div>
            <div><dt>Unidades</dt><dd>{{ totalUnidades() }}</dd></div>
            <div><dt>Tarifa total</dt><dd><strong>{{ totalTarifa() | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</strong></dd></div>
          </dl>
          <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Destinatarios del retiro">
            <table class="fx-table fx-table--filas">
              <thead><tr><th>Destinatario</th><th>Destino</th><th>Productos</th><th>Tarifa</th></tr></thead>
              <tbody>
                @for (f of filasResumen(); track $index) {
                  <tr>
                    <td data-label="Destinatario"><strong>{{ f.nombre }}</strong></td>
                    <td data-label="Destino">{{ f.destino }}<span class="fx-sub">{{ f.zona }}</span></td>
                    <td data-label="Productos">{{ f.productos }}<span class="fx-sub">{{ f.unidades }} {{ f.unidades === 1 ? 'unidad' : 'unidades' }}</span></td>
                    <td data-label="Tarifa">{{ f.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
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
          <button type="button" class="btn btn-outline-secondary" (click)="guardarBorrador()"><i class="bi bi-file-earmark" aria-hidden="true"></i>Guardar borrador</button>
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>{{ destinos.length > 1 ? 'Solicitar retiro' : 'Solicitar envío' }}</button>
        } @else {
          <button type="submit" class="btn btn-primary" [disabled]="paso() === 1 && !misProductos().length">Siguiente<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
        }
      </div>
    </form>
  `,
})
export class RetiroModal extends WizardModal {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);

  clienteId = '';
  protected readonly abierto = signal(0);
  protected readonly pasos = PASOS;
  protected readonly mensajes = MENSAJES;
  protected readonly zonas = ZONAS;
  protected readonly retiros: { id: RetiroEnvio; etiqueta: string; detalle: string; icono: string }[] = [
    { id: 'domicilio', etiqueta: 'Retirar en mi domicilio', detalle: 'El mensajero pasa a buscar los paquetes por tu puerta', icono: 'house-door' },
    { id: 'deposito', etiqueta: 'Los llevo al depósito', detalle: 'Vos dejás los paquetes en el depósito de Flexya', icono: 'building' },
  ];
  protected readonly franjas = (Object.keys(ETIQUETA_FRANJA) as Franja[]).map((id) => ({ id, etiqueta: ETIQUETA_FRANJA[id] }));
  protected readonly fechaMaxima = sumarDiasISO(30);
  private borrador = false;

  private readonly fechaProgramadaValidator = (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent?.get('programar')?.value) return null;
    const v = String(control.value ?? '');
    if (!v) return { required: true };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { fecha: true };
    if (v < this.data.proximaFechaRetiro()) return { pasada: true };
    if (v > sumarDiasISO(30)) return { lejana: true };
    return this.data.esDiaHabil(v) ? null : { inhabil: true };
  };

  private readonly stockTotalValidator = (control: AbstractControl): ValidationErrors | null => {
    const destinos = control.value as { items: { productoId: string; cantidad: string }[] }[];
    const totales = new Map<string, number>();
    for (const d of destinos) for (const i of d.items) if (i.productoId) totales.set(i.productoId, (totales.get(i.productoId) ?? 0) + (Number(i.cantidad) || 0));
    for (const [id, total] of totales) {
      const producto = this.misProductos().find((p) => p.id === id);
      if (producto && total > producto.stock) return { stock: true };
    }
    return null;
  };

  protected readonly form = this.fb.group({
    retiro: ['' as RetiroEnvio | '', Validators.required],
    programar: [false],
    fechaRetiro: ['', this.fechaProgramadaValidator],
    franja: ['manana' as Franja],
    destinos: this.fb.array<DestinoForm>([this.nuevoDestino()], this.stockTotalValidator),
  });

  private readonly revalidarFecha = this.form.controls.programar.valueChanges
    .pipe(takeUntilDestroyed())
    .subscribe(() => this.form.controls.fechaRetiro.updateValueAndValidity());

  protected get destinos() {
    return this.form.controls.destinos;
  }

  protected misProductos(): Producto[] {
    return this.data.productos().filter((p) => p.clienteId === this.clienteId);
  }

  protected sinStockTotal(): boolean {
    return this.misProductos().every((p) => p.stock === 0);
  }

  protected fechaMinima(): string {
    return this.data.proximaFechaRetiro();
  }

  protected fechaEfectiva(): string {
    const v = this.form.getRawValue();
    return v.programar && v.fechaRetiro ? v.fechaRetiro : this.fechaMinima();
  }

  protected domicilioCliente(): string {
    const cliente = this.data.clientes().find((c) => c.id === this.clienteId);
    return cliente ? direccionCompleta(cliente) : '';
  }

  protected irAProductos() {
    this.modal.dismiss();
    void this.router.navigate(['/cliente/productos']);
  }

  protected nuevaFila(): FilaForm {
    return this.fb.group({
      productoId: ['', Validators.required],
      cantidad: ['1', [Validators.required, enteroValidator(1, 10000)]],
    });
  }

  protected nuevoDestino(): DestinoForm {
    return this.fb.group({
      destinatario: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80), nombreValidator]],
      telefono: ['', [Validators.required, telefonoValidator]],
      localidad: ['', Validators.required],
      direccion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(120), direccionEnvioValidator]],
      items: this.fb.array<FilaForm>([this.nuevaFila()], sinRepetidos),
    });
  }

  protected alternar(i: number) {
    this.abierto.set(this.abierto() === i ? -1 : i);
  }

  protected agregarDestino() {
    this.destinos.push(this.nuevoDestino());
    this.abierto.set(this.destinos.length - 1);
    this.form.markAsDirty();
  }

  protected async quitarDestino(i: number) {
    const d = this.destinos.at(i);
    const conDatos = !!d.controls.destinatario.value || d.controls.items.controls.some((f) => !!f.controls.productoId.value);
    if (conDatos) {
      const confirmado = await this.alert.confirmar({
        titulo: `¿Quitar a ${d.controls.destinatario.value || 'este destinatario'}?`,
        mensaje: 'Se quitan sus datos y sus productos del retiro.',
        confirmar: 'Sí, quitar',
        cancelar: 'No, dejarlo',
        tipo: 'peligro',
      });
      if (!confirmado) return;
    }
    this.destinos.removeAt(i);
    this.abierto.set(Math.min(this.abierto() >= i ? Math.max(0, this.abierto() - (this.abierto() === i ? 0 : 1)) : this.abierto(), this.destinos.length - 1));
    this.form.markAsDirty();
  }

  protected agregarFila(d: DestinoForm) {
    d.controls.items.push(this.nuevaFila());
    this.form.markAsDirty();
  }

  protected async quitarFila(d: DestinoForm, j: number) {
    const fila = d.controls.items.at(j);
    const producto = this.misProductos().find((p) => p.id === fila.controls.productoId.value);
    if (producto) {
      const confirmado = await this.alert.confirmar({
        titulo: `¿Quitar ${producto.nombre} de este destinatario?`,
        mensaje: 'Podés volver a agregarlo cuando quieras.',
        confirmar: 'Sí, quitar',
        cancelar: 'No, dejarlo',
        tipo: 'peligro',
      });
      if (!confirmado) return;
    }
    if (d.controls.items.length > 1) d.controls.items.removeAt(j);
    else fila.reset({ productoId: '', cantidad: '1' });
    this.form.markAsDirty();
  }

  private usado(productoId: string): number {
    return this.destinos.controls.reduce(
      (total, d) => total + d.controls.items.controls.reduce((n, f) => n + (f.controls.productoId.value === productoId ? Number(f.controls.cantidad.value) || 0 : 0), 0),
      0,
    );
  }

  protected restante(productoId: string, fila?: FilaForm): number {
    const producto = this.misProductos().find((p) => p.id === productoId);
    if (!producto) return 0;
    const propio = fila && fila.controls.productoId.value === productoId ? Number(fila.controls.cantidad.value) || 0 : 0;
    return producto.stock - this.usado(productoId) + propio;
  }

  protected opciones(d: DestinoForm, fila: FilaForm): Producto[] {
    const otros = d.controls.items.controls.filter((f) => f !== fila).map((f) => f.controls.productoId.value);
    return this.misProductos().filter((p) => !otros.includes(p.id));
  }

  protected hayProductos(d: DestinoForm): boolean {
    const usados = d.controls.items.controls.map((f) => f.controls.productoId.value);
    return this.misProductos().some((p) => !usados.includes(p.id) && this.restante(p.id) > 0);
  }

  protected cambiarCantidad(fila: FilaForm, delta: number) {
    const id = fila.controls.productoId.value;
    const actual = Number(fila.controls.cantidad.value) || 0;
    const tope = id ? Math.max(1, Math.min(10000, this.restante(id, fila))) : 10000;
    fila.controls.cantidad.setValue(String(Math.min(tope, Math.max(1, actual + delta))));
    fila.controls.cantidad.markAsDirty();
  }

  protected errorCampo(d: DestinoForm, campo: CampoDestino): string {
    const c = d.controls[campo];
    if (!c.invalid || !(c.touched || c.dirty)) return '';
    const key = Object.keys(c.errors ?? {})[0];
    return MENSAJES_DESTINO[campo][key] ?? 'Valor inválido.';
  }

  protected errorFila(fila: FilaForm, campo: 'productoId' | 'cantidad'): string {
    const c = fila.controls[campo];
    const id = fila.controls.productoId.value;
    if (campo === 'cantidad' && id && Number(c.value) > this.restante(id, fila)) return `Solo quedan ${Math.max(0, this.restante(id, fila))} en stock.`;
    if (!c.invalid || !(c.touched || c.dirty)) return '';
    if (campo === 'productoId') return 'Elegí un producto.';
    return c.hasError('required') ? 'Ingresá la cantidad.' : 'Entre 1 y 10.000 unidades.';
  }

  protected unidadesDe(d: DestinoForm): number {
    return d.controls.items.controls.reduce((n, f) => n + (f.controls.productoId.value ? Number(f.controls.cantidad.value) || 0 : 0), 0);
  }

  protected resumenDestino(d: DestinoForm): string {
    const partes: string[] = [];
    if (d.controls.localidad.value) partes.push(d.controls.localidad.value);
    const u = this.unidadesDe(d);
    partes.push(u ? `${u} ${u === 1 ? 'unidad' : 'unidades'}` : 'sin productos');
    return partes.join(' · ');
  }

  protected totalUnidades(): number {
    return this.destinos.controls.reduce((n, d) => n + this.unidadesDe(d), 0);
  }

  protected filasResumen() {
    return this.destinos.controls.map((d) => {
      const zona = zonaDe(d.controls.localidad.value);
      const productos = d.controls.items.controls
        .filter((f) => f.controls.productoId.value)
        .map((f) => `${f.controls.cantidad.value} × ${this.misProductos().find((p) => p.id === f.controls.productoId.value)?.nombre ?? ''}`)
        .join(', ');
      return {
        nombre: d.controls.destinatario.value,
        destino: `${d.controls.direccion.value}, ${d.controls.localidad.value}`,
        zona: zona?.nombre ?? '',
        productos,
        unidades: this.unidadesDe(d),
        tarifa: zona?.tarifa ?? 2200,
      };
    });
  }

  protected totalTarifa(): number {
    return this.filasResumen().reduce((t, f) => t + f.tarifa, 0);
  }

  protected override avisarErrores() {
    const malo = this.destinos.controls.findIndex((d) => d.invalid);
    if (this.paso() === 1 && malo >= 0) this.abierto.set(malo);
    super.avisarErrores();
  }

  protected async guardarBorrador(): Promise<void> {
    this.borrador = true;
    try {
      await this.guardar();
    } finally {
      this.borrador = false;
    }
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.irAlPrimerPasoConError();
      const malo = this.destinos.controls.findIndex((d) => d.invalid);
      if (this.paso() === 1 && malo >= 0) this.abierto.set(malo);
      return;
    }
    const v = this.form.getRawValue();
    const limpiar = (texto: string) => texto.trim().replace(/\s+/g, ' ');
    const pedido: NuevoPedidoRetiro = {
      retiro: v.retiro as RetiroEnvio,
      programado: v.programar,
      fechaRetiro: v.programar ? v.fechaRetiro : null,
      franja: v.programar && v.retiro === 'domicilio' ? v.franja : null,
      ...(this.borrador ? { borrador: true } : {}),
      destinos: v.destinos.map((d) => ({
        destinatario: limpiar(d.destinatario),
        telefono: formatearTelefono(d.telefono),
        direccion: limpiar(d.direccion),
        localidad: d.localidad,
        items: d.items.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
      })),
    };
    const n = pedido.destinos.length;
    const unidades = this.totalUnidades();
    const confirmado = await this.alert.confirmar({
      titulo: this.borrador ? '¿Guardar como borrador?' : n > 1 ? '¿Solicitar el retiro?' : '¿Solicitar el envío?',
      mensaje: `${n} ${n === 1 ? 'destinatario' : 'destinatarios'}, ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}, tarifa total $ ${this.totalTarifa().toLocaleString('es-AR')}.${this.borrador ? ' Todavía no se reserva stock ni se pide el servicio.' : ''}`,
      confirmar: this.borrador ? 'Sí, guardar borrador' : 'Sí, solicitar',
      tipo: 'info',
    });
    if (confirmado) this.modal.close(pedido);
  }
}
