import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Mensajero, MensajeroInput, TipoDocumento, ZONAS } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { MaskDirective } from '../../shared/forms/mask.directive';
import {
  documentoValidator, emailValidator, formatearTelefono, personaValidator, telefonoDistintoValidator, telefonoNacional,
  telefonoValidator, unico,
} from '../../shared/forms/validators';
import { Mensajes, Paso, WizardModal } from '../../shared/forms/wizard-modal';

const PASOS: readonly Paso[] = [
  { titulo: 'Identidad', campos: ['nombre', 'tipoDocumento', 'numeroDocumento'] },
  { titulo: 'Contacto', campos: ['telefono', 'telefonoEmergencia', 'email'] },
  { titulo: 'Zona', campos: ['zonaId'] },
];

const MENSAJES: Mensajes = {
  nombre: {
    required: 'Ingresá nombre y apellido.',
    maxlength: 'Máximo 80 caracteres.',
    persona: 'Ingresá nombre y apellido, solo con letras. Ej: Santiago Pereyra.',
  },
  numeroDocumento: {
    required: 'Ingresá el número de documento.',
    dni: 'El DNI debe tener 7 u 8 dígitos, sin puntos.',
    pasaporte: 'El pasaporte debe tener de 6 a 9 caracteres (letras y números) con al menos un número.',
    duplicado: 'Ya existe un mensajero con este documento.',
  },
  telefono: {
    required: 'Ingresá un teléfono de contacto.',
    telefono: 'Ingresá los 10 dígitos (código de área + número), sin 0 ni 15. Ej: 11 5555 0000.',
  },
  telefonoEmergencia: {
    telefono: 'Ingresá los 10 dígitos (código de área + número), sin 0 ni 15.',
    mismoTelefono: 'Tiene que ser distinto del teléfono del mensajero.',
  },
  email: {
    required: 'Ingresá un correo electrónico.',
    email: 'Correo inválido. Ej: nombre@dominio.com',
    duplicado: 'Este correo ya está en uso por otro usuario.',
  },
  zonaId: { required: 'Elegí la zona de reparto.' },
};

@Component({
  selector: 'fx-mensajero-modal',
  imports: [ReactiveFormsModule, MaskDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i [class]="'bi ' + (mensajero ? 'bi-pencil-square' : 'bi-person-plus')" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">{{ mensajero ? 'Editar mensajero' : 'Nuevo mensajero' }}</h2>
            <p class="fx-muted small mb-0">{{ mensajero ? 'Actualizá los datos de ' + mensajero.nombre : 'Cargá los datos para identificar al mensajero.' }}</p>
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
          <h3 class="fx-modal-section">Datos personales</h3>
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="m-nombre">Nombre y apellido</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-person" aria-hidden="true"></i></span>
                <input id="m-nombre" class="form-control" formControlName="nombre" autocomplete="off" maxlength="80"
                  placeholder="Ej. Santiago Pereyra" [class.is-invalid]="error('nombre')" />
              </div>
              @if (error('nombre'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-12 col-md-5">
              <span class="form-label d-block" id="m-lbl-tipo">Tipo de documento</span>
              <div class="btn-group w-100" role="group" aria-labelledby="m-lbl-tipo">
                @for (t of tipos; track t) {
                  <input type="radio" class="btn-check" formControlName="tipoDocumento" [value]="t" [id]="'mtd-' + t" autocomplete="off" />
                  <label class="btn btn-outline-primary" [for]="'mtd-' + t">{{ t }}</label>
                }
              </div>
            </div>
            <div class="col-12 col-md-7">
              <label class="form-label" for="m-doc">{{ esDni() ? 'Número de DNI' : 'Número de pasaporte' }}</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-person-vcard" aria-hidden="true"></i></span>
                <input id="m-doc" class="form-control" formControlName="numeroDocumento" [fxMask]="esDni() ? 'dni' : 'pasaporte'"
                  [attr.inputmode]="esDni() ? 'numeric' : 'text'" autocomplete="off"
                  [placeholder]="esDni() ? '28456123' : 'AAB123456'" [class.is-invalid]="error('numeroDocumento')" />
              </div>
              @if (error('numeroDocumento'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
          </div>
        </section>
        }

        @if (paso() === 1) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Contacto</h3>
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="m-telefono">Teléfono móvil</label>
              <div class="fx-phone" [class.is-invalid]="error('telefono')">
                <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
                <input id="m-telefono" type="tel" inputmode="numeric" formControlName="telefono" fxMask="phone"
                  autocomplete="off" placeholder="11 5555 0000" />
                <span class="fx-phone-count" aria-hidden="true">{{ form.controls.telefono.value.length }}/10</span>
              </div>
              @if (error('telefono'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">Código de área + número, sin 0 ni 15.</div> }
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="m-emergencia">Contacto de emergencia <span class="fx-muted fw-normal">(opcional)</span></label>
              <div class="fx-phone" [class.is-invalid]="error('telefonoEmergencia')">
                <span class="fx-phone-prefix fx-phone-prefix--alerta"><i class="bi bi-heart-pulse-fill" aria-hidden="true"></i>+54 9</span>
                <input id="m-emergencia" type="tel" inputmode="numeric" formControlName="telefonoEmergencia" fxMask="phone"
                  autocomplete="off" placeholder="11 5555 0000" aria-describedby="m-emergencia-ayuda" />
                <span class="fx-phone-count" aria-hidden="true">{{ form.controls.telefonoEmergencia.value.length }}/10</span>
              </div>
              @if (error('telefonoEmergencia'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text" id="m-emergencia-ayuda">Un familiar o allegado a quien llamar si al mensajero le pasa algo.</div> }
            </div>
            <div class="col-12">
              <label class="form-label" for="m-email">Correo electrónico</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-envelope" aria-hidden="true"></i></span>
                <input id="m-email" type="email" inputmode="email" class="form-control" formControlName="email" autocomplete="off"
                  placeholder="mensajero@correo.com" [class.is-invalid]="error('email')" />
              </div>
              @if (error('email'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text">Con este correo ingresa a la app.</div> }
            </div>
          </div>
        </section>
        }

        @if (paso() === 2) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Zona de reparto</h3>
          <div class="fx-zonas" role="radiogroup" aria-label="Zona de reparto">
            @for (z of zonas; track z.id) {
              <label class="fx-plan" [class.selected]="form.controls.zonaId.value === z.id">
                <input type="radio" formControlName="zonaId" [value]="z.id" class="visually-hidden" />
                <strong>{{ z.nombre }}</strong>
                <small>{{ z.localidades.length }} localidades</small>
              </label>
            }
          </div>
          @if (error('zonaId'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
          @if (zonaElegida(); as z) {
            <div class="fx-zone-card">
              <span class="fx-zone-icon"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i></span>
              <div>
                <strong>{{ z.nombre }}</strong>
                <small>Cubre {{ z.localidades.length }} localidades: {{ resumenLocalidades(z.localidades) }}</small>
              </div>
            </div>
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
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>{{ mensajero ? 'Guardar cambios' : 'Crear mensajero' }}</button>
        } @else {
          <button type="submit" class="btn btn-primary">Siguiente<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
        }
      </div>
    </form>
  `,
})
export class MensajeroModal extends WizardModal implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);

  mensajero: Mensajero | null = null;
  protected readonly pasos = PASOS;
  protected readonly mensajes = MENSAJES;
  protected readonly zonas = ZONAS;
  protected readonly tipos: TipoDocumento[] = ['DNI', 'Pasaporte'];

  protected readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(80), personaValidator]],
    tipoDocumento: ['DNI' as TipoDocumento, Validators.required],
    numeroDocumento: [
      '',
      [
        Validators.required,
        documentoValidator,
        unico((v, ctl) => this.otros().some((m) => m.tipoDocumento === ctl.parent?.get('tipoDocumento')?.value && m.numeroDocumento === v)),
      ],
    ],
    telefono: ['', [Validators.required, telefonoValidator]],
    telefonoEmergencia: ['', [telefonoValidator, telefonoDistintoValidator]],
    email: [
      '',
      [
        Validators.required,
        emailValidator,
        unico((v) => this.data.usuarios().some((u) => u.email.toLowerCase() === v.toLowerCase() && (!u.mensajeroId || u.mensajeroId !== this.mensajero?.id))),
      ],
    ],
    zonaId: ['', Validators.required],
  });

  constructor() {
    super();
    this.form.controls.tipoDocumento.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.numeroDocumento.setValue('');
    });
    this.form.controls.telefono.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.telefonoEmergencia.updateValueAndValidity();
    });
  }

  ngOnInit() {
    if (this.mensajero) {
      const m = this.mensajero;
      this.form.setValue({
        nombre: m.nombre,
        tipoDocumento: m.tipoDocumento,
        numeroDocumento: m.numeroDocumento,
        telefono: telefonoNacional(m.telefono),
        telefonoEmergencia: telefonoNacional(m.telefonoEmergencia ?? ''),
        email: m.email,
        zonaId: m.zonaId,
      });
    }
  }

  protected esDni() {
    return this.form.controls.tipoDocumento.value === 'DNI';
  }

  protected zonaElegida() {
    return this.zonas.find((z) => z.id === this.form.controls.zonaId.value) ?? null;
  }

  protected resumenLocalidades(localidades: readonly string[]) {
    return localidades.length > 6 ? `${localidades.slice(0, 6).join(', ')}…` : localidades.join(', ');
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.irAlPrimerPasoConError();
      return;
    }
    const v = this.form.getRawValue();
    const resultado: MensajeroInput = {
      ...v,
      nombre: v.nombre.trim().replace(/\s+/g, ' '),
      telefono: formatearTelefono(v.telefono),
      telefonoEmergencia: v.telefonoEmergencia ? formatearTelefono(v.telefonoEmergencia) : '',
      email: v.email.trim().toLowerCase(),
    };
    const confirmado = await this.alert.confirmar({
      titulo: this.mensajero ? '¿Guardar los cambios?' : '¿Crear el mensajero?',
      mensaje: this.mensajero
        ? `Se actualizarán los datos de ${resultado.nombre}.`
        : `Se dará de alta a ${resultado.nombre} y se le generará un acceso con ${resultado.email}.`,
      confirmar: this.mensajero ? 'Sí, guardar' : 'Sí, crear',
      tipo: 'info',
    });
    if (confirmado) this.modal.close(resultado);
  }

  private otros(): Mensajero[] {
    return this.data.mensajeros().filter((m) => m.id !== this.mensajero?.id);
  }
}
