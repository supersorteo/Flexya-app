import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Producto, ProductoInput, STOCK_MAXIMO, volumenProducto } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { MaskDirective } from '../../shared/forms/mask.directive';
import { aNumeroONulo, decimalValidator, enteroValidator, productoNombreValidator, unico } from '../../shared/forms/validators';
import { Mensajes, Paso, WizardModal } from '../../shared/forms/wizard-modal';

const LIMITES = { peso: [0.001, 100], medida: [0.1, 300], precio: [0.01, 100_000_000] } as const;

const PASOS: readonly Paso[] = [
  { titulo: 'Producto', campos: ['nombre', 'descripcion', 'precio', 'stock'] },
  { titulo: 'Medidas', campos: ['peso', 'alto', 'ancho', 'largo'] },
];

const MEDIDA = {
  decimal: 'Ingresá un número válido. Ej: 12,5.',
  rango: 'Tiene que estar entre 0,1 y 300 cm.',
};

const MENSAJES: Mensajes = {
  nombre: {
    required: 'Ingresá el nombre del producto.',
    minlength: 'Debe tener al menos 3 caracteres.',
    maxlength: 'Máximo 80 caracteres.',
    nombre: "Solo letras, números y los signos . , & ' - / ( ) + # %",
    duplicado: 'Ya tenés un producto con este nombre.',
  },
  descripcion: { maxlength: 'Máximo 300 caracteres.' },
  stock: {
    required: 'Ingresá cuántas unidades tenés (0 si todavía no hay).',
    entero: 'Solo números enteros, sin decimales.',
    rango: 'Tiene que estar entre 0 y 99.999 unidades.',
  },
  precio: {
    decimal: 'Ingresá un número válido. Ej: 15990,50.',
    rango: 'Tiene que estar entre $ 0,01 y $ 100.000.000.',
  },
  peso: {
    decimal: 'Ingresá un número válido. Ej: 0,75.',
    rango: 'Tiene que estar entre 0,001 y 100 kg.',
  },
  alto: MEDIDA,
  ancho: MEDIDA,
  largo: MEDIDA,
};

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const redondear = (texto: string, decimales: number) => {
  const n = aNumeroONulo(texto);
  return n === null ? null : Math.round(n * 10 ** decimales) / 10 ** decimales;
};

@Component({
  selector: 'fx-producto-modal',
  imports: [ReactiveFormsModule, MaskDirective, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i [class]="'bi ' + (producto ? 'bi-pencil-square' : 'bi-box-seam')" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">{{ producto ? 'Editar producto' : 'Nuevo producto' }}</h2>
            <p class="fx-muted small mb-0">{{ producto ? 'Actualizá los datos de ' + producto.nombre : 'Cargá lo que enviás: datos, precio y medidas.' }}</p>
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
          <h3 class="fx-modal-section">Datos del producto</h3>
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="p-nombre">Nombre</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-tag" aria-hidden="true"></i></span>
                <input id="p-nombre" class="form-control" formControlName="nombre" autocomplete="off" maxlength="80"
                  placeholder="Ej. Remera de algodón talle M" [class.is-invalid]="error('nombre')" />
              </div>
              @if (error('nombre'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12">
              <label class="form-label" for="p-descripcion">Descripción <span class="fx-muted fw-normal">(opcional)</span></label>
              <textarea id="p-descripcion" class="form-control fx-textarea" rows="3" formControlName="descripcion" maxlength="300"
                placeholder="Material, color, cuidados especiales…" [class.is-invalid]="error('descripcion')"></textarea>
              <div class="d-flex justify-content-between">
                @if (error('descripcion'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> } @else { <span></span> }
                <small class="fx-muted">{{ form.controls.descripcion.value.length }}/300</small>
              </div>
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="p-stock">Stock disponible</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-boxes" aria-hidden="true"></i></span>
                <input id="p-stock" class="form-control" formControlName="stock" fxMask="cantidad" inputmode="numeric" autocomplete="off"
                  placeholder="0" [class.is-invalid]="error('stock')" />
                <span class="input-group-text fx-suffix">u.</span>
              </div>
              @if (error('stock'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">Unidades listas para enviar. Baja solas con cada envío.</div> }
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="p-precio">Precio o costo <span class="fx-muted fw-normal">(opcional)</span></label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input id="p-precio" class="form-control" formControlName="precio" fxMask="precio" inputmode="decimal" autocomplete="off"
                  placeholder="15990,50" [class.is-invalid]="error('precio')" />
              </div>
              @if (error('precio'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">En pesos argentinos. Usá coma para los centavos.</div> }
            </div>
          </div>
        </section>
        }

        @if (paso() === 1) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Peso y dimensiones (opcionales)</h3>
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="p-peso">Peso <span class="fx-muted fw-normal">(opcional)</span></label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-speedometer" aria-hidden="true"></i></span>
                <input id="p-peso" class="form-control" formControlName="peso" fxMask="peso" inputmode="decimal" autocomplete="off"
                  placeholder="0,75" [class.is-invalid]="error('peso')" />
                <span class="input-group-text fx-suffix">kg</span>
              </div>
              @if (error('peso'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12 col-md-6"></div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="p-alto">Alto <span class="fx-muted fw-normal">(opc.)</span></label>
              <div class="input-group">
                <input id="p-alto" class="form-control fx-medida" formControlName="alto" fxMask="medida" inputmode="decimal" autocomplete="off"
                  placeholder="10" [class.is-invalid]="error('alto')" />
                <span class="input-group-text fx-suffix">cm</span>
              </div>
              @if (error('alto'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="p-ancho">Ancho <span class="fx-muted fw-normal">(opc.)</span></label>
              <div class="input-group">
                <input id="p-ancho" class="form-control fx-medida" formControlName="ancho" fxMask="medida" inputmode="decimal" autocomplete="off"
                  placeholder="20" [class.is-invalid]="error('ancho')" />
                <span class="input-group-text fx-suffix">cm</span>
              </div>
              @if (error('ancho'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="p-largo">Largo <span class="fx-muted fw-normal">(opc.)</span></label>
              <div class="input-group">
                <input id="p-largo" class="form-control fx-medida" formControlName="largo" fxMask="medida" inputmode="decimal" autocomplete="off"
                  placeholder="30" [class.is-invalid]="error('largo')" />
                <span class="input-group-text fx-suffix">cm</span>
              </div>
              @if (error('largo'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
          </div>

          @if (volumen(); as vol) {
            <div class="fx-zone-card">
              <span class="fx-zone-icon"><i class="bi bi-box" aria-hidden="true"></i></span>
              <div>
                <strong>{{ vol | number: '1.0-1' }} cm³</strong>
                <small>Volumen del paquete: {{ form.controls.alto.value }} × {{ form.controls.ancho.value }} × {{ form.controls.largo.value }} cm</small>
              </div>
            </div>
          } @else if (medidasParciales()) {
            <div class="form-text mt-3">Completá las tres medidas para ver el volumen del paquete.</div>
          }
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
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>{{ producto ? 'Guardar cambios' : 'Crear producto' }}</button>
        } @else {
          <button type="submit" class="btn btn-primary">Siguiente<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
        }
      </div>
    </form>
  `,
})
export class ProductoModal extends WizardModal implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);

  producto: Producto | null = null;
  clienteId = '';
  protected readonly pasos = PASOS;
  protected readonly mensajes = MENSAJES;

  protected readonly form = this.fb.group({
    nombre: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(80),
        productoNombreValidator,
        unico((v) => this.delCliente().some((p) => p.nombre.trim().toLowerCase() === v.trim().toLowerCase())),
      ],
    ],
    descripcion: ['', Validators.maxLength(300)],
    stock: ['', [Validators.required, enteroValidator(0, STOCK_MAXIMO)]],
    precio: ['', decimalValidator(...LIMITES.precio)],
    peso: ['', decimalValidator(...LIMITES.peso)],
    alto: ['', decimalValidator(...LIMITES.medida)],
    ancho: ['', decimalValidator(...LIMITES.medida)],
    largo: ['', decimalValidator(...LIMITES.medida)],
  });

  ngOnInit() {
    if (this.producto) {
      const p = this.producto;
      this.form.setValue({
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        stock: String(p.stock),
        precio: aTexto(p.precio),
        peso: aTexto(p.peso),
        alto: aTexto(p.alto),
        ancho: aTexto(p.ancho),
        largo: aTexto(p.largo),
      });
    }
  }

  protected volumen(): number | null {
    const { alto, ancho, largo } = this.form.getRawValue();
    return volumenProducto({ alto: aNumeroONulo(alto), ancho: aNumeroONulo(ancho), largo: aNumeroONulo(largo) });
  }

  protected medidasParciales(): boolean {
    const { alto, ancho, largo } = this.form.getRawValue();
    const cargadas = [alto, ancho, largo].map((t) => t.trim() !== '');
    return cargadas.some(Boolean) && !cargadas.every(Boolean);
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.irAlPrimerPasoConError();
      return;
    }
    const v = this.form.getRawValue();
    const resultado: ProductoInput = {
      nombre: v.nombre.trim().replace(/\s+/g, ' '),
      descripcion: v.descripcion.trim(),
      stock: Number(v.stock),
      precio: redondear(v.precio, 2),
      peso: redondear(v.peso, 3),
      alto: redondear(v.alto, 1),
      ancho: redondear(v.ancho, 1),
      largo: redondear(v.largo, 1),
    };
    const confirmado = await this.alert.confirmar({
      titulo: this.producto ? '¿Guardar los cambios?' : '¿Crear el producto?',
      mensaje: this.producto ? `Se actualizarán los datos de ${resultado.nombre}.` : `Se agregará ${resultado.nombre} a tus productos.`,
      confirmar: this.producto ? 'Sí, guardar' : 'Sí, crear',
      tipo: 'info',
    });
    if (confirmado) this.modal.close(resultado);
  }

  private delCliente(): Producto[] {
    const cliente = this.producto?.clienteId ?? this.clienteId;
    return this.data.productos().filter((p) => p.clienteId === cliente && p.id !== this.producto?.id);
  }
}
