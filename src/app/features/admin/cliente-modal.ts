import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CONDICIONES_IVA, Cliente, ClienteInput, PLANES, TipoCliente, TipoDocumento, ZONAS, direccionCompleta, zonaDe } from '../../core/models';
import { georefDe } from '../../core/models/geo';
import { CallesService, CalleGeo, coincide, filtrarCalles } from '../../core/services/calles.service';
import { DataService } from '../../core/services/data.service';
import { MaskDirective } from '../../shared/forms/mask.directive';
import {
  alturaValidator, calleValidator, cuitValidator, documentoValidator, emailValidator, localidadValidator, nombreClienteValidator, nombreValidator,
  personaValidator, pisoValidator,
  formatearTelefono, soloDigitos, telefonoNacional, telefonoValidator, unico,
} from '../../shared/forms/validators';
import { Paso, WizardModal } from '../../shared/forms/wizard-modal';

const PASOS: readonly Paso[] = [
  { titulo: 'Datos', campos: ['tipoCliente', 'nombre', 'nombreComercial', 'plan'] },
  { titulo: 'Identificación', campos: ['tipoDocumento', 'numeroDocumento', 'cuit', 'condicionIva'] },
  { titulo: 'Contacto', campos: ['telefono', 'email', 'responsableNombre', 'responsableTelefono'] },
  { titulo: 'Domicilio', campos: ['calle', 'altura', 'pisoDepto', 'localidad'] },
];

const MENSAJES: Record<string, Record<string, string>> = {
  nombre: {
    required: 'Ingresá el nombre y apellido, o la razón social si es una empresa.',
    persona: 'Ingresá nombre y apellido, solo con letras.',
    minlength: 'Debe tener al menos 3 caracteres.',
    maxlength: 'Máximo 80 caracteres.',
    nombre: "Solo letras, números y los signos . , & ' -",
  },
  telefono: {
    required: 'Ingresá un teléfono de contacto.',
    telefono: 'Ingresá los 10 dígitos (código de área + número), sin 0 ni 15. Ej: 11 5555 0000.',
  },
  numeroDocumento: {
    required: 'Ingresá el número de documento.',
    dni: 'El DNI debe tener 7 u 8 dígitos, sin puntos.',
    pasaporte: 'El pasaporte debe tener de 6 a 9 caracteres (letras y números) con al menos un número.',
    duplicado: 'Ya existe un cliente con este documento.',
  },
  email: {
    required: 'Ingresá un correo electrónico.',
    email: 'Correo inválido. Ej: nombre@dominio.com',
    duplicado: 'Ya existe un cliente con este correo.',
  },
  calle: {
    required: 'Ingresá el nombre de la calle.',
    minlength: 'Debe tener al menos 3 caracteres.',
    calle: "Solo letras, números y los signos . , ' ° - / & #",
  },
  altura: {
    required: 'Ingresá la altura.',
    altura: 'Solo números, de 1 a 5 dígitos y sin ceros a la izquierda.',
  },
  pisoDepto: { piso: 'Hasta 12 caracteres. Ej: 3° B, PB, 4 C.' },
  localidad: {
    required: 'Seleccioná una localidad.',
    localidad: 'Elegí una localidad de la lista.',
  },
  cuit: {
    required: 'Ingresá el CUIT de la empresa.',
    cuil: 'Número inválido: revisá el prefijo y el dígito verificador.',
    cuitEmpresa: 'El CUIT de una empresa empieza con 30, 33 o 34.',
    cuilPersona: 'El CUIL o CUIT de una persona empieza con 20, 23, 24 o 27.',
    cuilDni: 'El CUIL no coincide con el DNI ingresado.',
    duplicado: 'Ya existe un cliente con este CUIT o CUIL.',
  },
  nombreComercial: { maxlength: 'Máximo 80 caracteres.', nombre: "Solo letras, números y los signos . , & ' -" },
  responsableNombre: { persona: 'Ingresá nombre y apellido, solo con letras.' },
  responsableTelefono: { telefono: 'Ingresá los 10 dígitos (código de área + número), sin 0 ni 15.' },
};

@Component({
  selector: 'fx-cliente-modal',
  imports: [ReactiveFormsModule, MaskDirective, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'calcularPosicion()' },
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div class="modal-header fx-modal-head">
        <div class="d-flex align-items-center gap-3">
          <span class="fx-modal-icon"><i [class]="'bi ' + (cliente ? 'bi-pencil-square' : 'bi-person-plus')" aria-hidden="true"></i></span>
          <div>
            <h2 class="modal-title h5 mb-0">{{ cliente ? 'Editar cliente' : 'Nuevo cliente' }}</h2>
            <p class="fx-muted small mb-0">{{ cliente ? 'Actualizá los datos de ' + cliente.nombre : 'Completá los datos para dar de alta la cuenta.' }}</p>
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

      <div class="modal-body fx-modal-body" (scroll)="calcularPosicion()">
        @if (paso() === 0) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Tipo de cliente</h3>
          <div class="fx-tipos" role="radiogroup" aria-label="Tipo de cliente">
            @for (t of tiposCliente; track t.id) {
              <label class="fx-plan fx-tipo" [class.selected]="form.controls.tipoCliente.value === t.id">
                <input type="radio" formControlName="tipoCliente" [value]="t.id" class="visually-hidden" />
                <span class="fx-tipo-icon"><i [class]="'bi bi-' + t.icono" aria-hidden="true"></i></span>
                <span><strong>{{ t.etiqueta }}</strong><small>{{ t.detalle }}</small></span>
              </label>
            }
          </div>

          <h3 class="fx-modal-section">{{ esEmpresa() ? 'Datos de la empresa' : 'Datos personales' }}</h3>
          <div class="row g-3">
            <div class="col-12" [class.col-md-6]="esEmpresa()">
              <label class="form-label" for="c-nombre">{{ esEmpresa() ? 'Razón social' : 'Nombre y apellido' }}</label>
              <div class="input-group">
                <span class="input-group-text"><i [class]="'bi ' + (esEmpresa() ? 'bi-building' : 'bi-person')" aria-hidden="true"></i></span>
                <input id="c-nombre" class="form-control" formControlName="nombre" autocomplete="off" maxlength="80"
                  [placeholder]="esEmpresa() ? 'Ej. Casa Nómade S.R.L.' : 'Ej. Lucía Márquez'" [class.is-invalid]="error('nombre')" />
              </div>
              @if (error('nombre'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            @if (esEmpresa()) {
              <div class="col-12 col-md-6">
                <label class="form-label" for="c-comercial">Nombre comercial <span class="fx-muted fw-normal">(opcional)</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-shop" aria-hidden="true"></i></span>
                  <input id="c-comercial" class="form-control" formControlName="nombreComercial" autocomplete="off" maxlength="80"
                    placeholder="Ej. Casa Nómade" [class.is-invalid]="error('nombreComercial')" />
                </div>
                @if (error('nombreComercial'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              </div>
            }
          </div>

          <h3 class="fx-modal-section">Plan</h3>
          <div class="fx-plans" role="radiogroup" aria-label="Plan">
            @for (p of planes; track p.id) {
              <label class="fx-plan" [class.selected]="form.controls.plan.value === p.id">
                <input type="radio" formControlName="plan" [value]="p.id" class="visually-hidden" />
                <strong>{{ p.id }}</strong>
                <small>{{ p.detalle }}</small>
              </label>
            }
          </div>

        </section>
        }

        @if (paso() === 1) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Identificación</h3>
          <div class="row g-3">
            @if (esEmpresa()) {
              <div class="col-12 col-md-6">
                <label class="form-label" for="c-cuit">CUIT</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-building" aria-hidden="true"></i></span>
                  <input id="c-cuit" class="form-control" formControlName="cuit" fxMask="cuil" inputmode="numeric" autocomplete="off"
                    placeholder="30-71234567-1" [class.is-invalid]="error('cuit')" />
                </div>
                @if (error('cuit'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                @else { <div class="form-text">Empieza con 30, 33 o 34. Se valida el dígito verificador.</div> }
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="c-iva">Condición frente al IVA <span class="fx-muted fw-normal">(opcional)</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-receipt" aria-hidden="true"></i></span>
                  <select id="c-iva" class="form-select" formControlName="condicionIva">
                    <option value="">Sin especificar</option>
                    @for (o of condicionesIva; track o) { <option [value]="o">{{ o }}</option> }
                  </select>
                </div>
              </div>
            } @else {
              <div class="col-12 col-md-5">
                <span class="form-label d-block" id="lbl-tipo">Tipo de documento</span>
                <div class="btn-group w-100" role="group" aria-labelledby="lbl-tipo">
                  @for (t of tipos; track t) {
                    <input type="radio" class="btn-check" formControlName="tipoDocumento" [value]="t" [id]="'td-' + t" autocomplete="off" />
                    <label class="btn btn-outline-primary" [for]="'td-' + t">{{ t }}</label>
                  }
                </div>
              </div>
              <div class="col-12 col-md-7">
                <label class="form-label" for="c-doc">{{ esDni() ? 'Número de DNI' : 'Número de pasaporte' }}</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-person-vcard" aria-hidden="true"></i></span>
                  <input id="c-doc" class="form-control" formControlName="numeroDocumento" [fxMask]="esDni() ? 'dni' : 'pasaporte'"
                    [attr.inputmode]="esDni() ? 'numeric' : 'text'" autocomplete="off"
                    [placeholder]="esDni() ? '28456123' : 'AAB123456'" [class.is-invalid]="error('numeroDocumento')" />
                </div>
                @if (error('numeroDocumento'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              </div>
              <div class="col-12">
                <label class="form-label" for="c-cuit">CUIL o CUIT <span class="fx-muted fw-normal">(opcional)</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-hash" aria-hidden="true"></i></span>
                  <input id="c-cuit" class="form-control" formControlName="cuit" fxMask="cuil" inputmode="numeric" autocomplete="off"
                    placeholder="20-12345678-6" [class.is-invalid]="error('cuit')" />
                </div>
                @if (error('cuit'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
                @else { <div class="form-text">Opcional. Empieza con 20, 23, 24 o 27; se valida el dígito verificador.</div> }
              </div>
            }
          </div>

        </section>
        }

        @if (paso() === 2) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Contacto</h3>
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="c-telefono">Teléfono móvil</label>
              <div class="fx-phone" [class.is-invalid]="error('telefono')">
                <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
                <input id="c-telefono" type="tel" inputmode="numeric" formControlName="telefono" fxMask="phone"
                  autocomplete="off" placeholder="11 5555 0000" aria-describedby="c-telefono-ayuda" />
                <span class="fx-phone-count" aria-hidden="true">{{ form.controls.telefono.value.length }}/10</span>
              </div>
              @if (error('telefono'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              @else { <div class="form-text" id="c-telefono-ayuda">Código de área + número, sin 0 ni 15.</div> }
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="c-email">Correo electrónico</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-envelope" aria-hidden="true"></i></span>
                <input id="c-email" type="email" inputmode="email" class="form-control" formControlName="email" autocomplete="off"
                  placeholder="contacto@empresa.com" [class.is-invalid]="error('email')" />
              </div>
              @if (error('email'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            @if (esEmpresa()) {
              <div class="col-12 col-md-6">
                <label class="form-label" for="c-resp">Responsable <span class="fx-muted fw-normal">(opcional)</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-person-badge" aria-hidden="true"></i></span>
                  <input id="c-resp" class="form-control" formControlName="responsableNombre" autocomplete="off" maxlength="80"
                    placeholder="Nombre y apellido" [class.is-invalid]="error('responsableNombre')" />
                </div>
                @if (error('responsableNombre'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label" for="c-resp-tel">Teléfono del responsable <span class="fx-muted fw-normal">(opcional)</span></label>
                <div class="fx-phone" [class.is-invalid]="error('responsableTelefono')">
                  <span class="fx-phone-prefix"><i class="bi bi-telephone-fill" aria-hidden="true"></i>+54 9</span>
                  <input id="c-resp-tel" type="tel" inputmode="numeric" formControlName="responsableTelefono" fxMask="phone"
                    autocomplete="off" placeholder="11 5555 0000" />
                  <span class="fx-phone-count" aria-hidden="true">{{ form.controls.responsableTelefono.value.length }}/10</span>
                </div>
                @if (error('responsableTelefono'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
              </div>
            }
          </div>
        </section>
        }

        @if (paso() === 3) {
        <section class="fx-step-pane">
          <h3 class="fx-modal-section">Localidad</h3>
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label" for="c-localidad">Localidad</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-geo-alt" aria-hidden="true"></i></span>
                <select id="c-localidad" class="form-select" formControlName="localidad" [class.is-invalid]="error('localidad')">
                  <option value="" disabled>Seleccioná una localidad…</option>
                  @for (z of zonas; track z.id) {
                    <optgroup [label]="z.nombre">
                      @for (l of z.localidades; track l) {
                        <option [value]="l">{{ l }}</option>
                      }
                    </optgroup>
                  }
                </select>
              </div>
              @if (error('localidad'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
          </div>

          @if (zona(); as z) {
            <div class="fx-zone-card">
              <span class="fx-zone-icon"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i></span>
              <div>
                <strong>{{ z.nombre }}</strong>
                <small>{{ z.grupo === 'CABA' ? 'Ciudad Autónoma de Buenos Aires' : z.grupo === 'GBA' ? 'Gran Buenos Aires' : 'Gran La Plata' }} · tarifa {{ z.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</small>
              </div>
            </div>
          }

          <h3 class="fx-modal-section">{{ zona() ? 'Dirección en ' + localidadSel() : 'Dirección' }}</h3>
          @if (!zona()) {
            <div class="fx-addr-lock"><i class="bi bi-lock" aria-hidden="true"></i>Elegí primero la localidad para cargar la calle y la altura.</div>
          }
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="c-calle">Calle</label>
              <div class="fx-typeahead" #cajaCalle>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-signpost-2" aria-hidden="true"></i></span>
                  <input id="c-calle" class="form-control" formControlName="calle" fxMask="calle" autocomplete="off"
                    role="combobox" aria-autocomplete="list" aria-controls="c-calle-lista" [attr.aria-expanded]="mostrarSugerencias()"
                    [attr.aria-activedescendant]="activo() >= 0 ? 'sug-' + activo() : null"
                    [placeholder]="placeholderCalle()" [class.is-invalid]="error('calle')"
                    (focus)="abrirSugerencias(true)" (input)="abrirSugerencias()" (blur)="abierto.set(false)" (keydown)="teclado($event)" />
                  <span class="input-group-text fx-suffix">
                    @if (estadoDireccion() === 'buscando') { <span class="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Verificando"></span> }
                    @else if (estadoDireccion() === 'verificada') { <i class="bi bi-check-circle-fill text-success" aria-label="Verificada"></i> }
                    @else if (advertencia()) { <i class="bi bi-exclamation-triangle-fill text-warning" aria-label="Sin verificar"></i> }
                    @else { <i class="bi bi-search" aria-hidden="true"></i> }
                  </span>
                </div>
                @if (mostrarSugerencias()) {
                  <ul class="fx-suggest" id="c-calle-lista" role="listbox" aria-label="Calles sugeridas" (mousedown)="$event.preventDefault()"
                    [style.top.px]="pos()?.top ?? null" [style.bottom.px]="pos()?.bottom ?? null" [style.left.px]="pos()?.left ?? null"
                    [style.width.px]="pos()?.width ?? null" [style.max-height.px]="pos()?.maxHeight ?? null">
                    @if (sugerencias().length) { <li class="fx-suggest-head" role="presentation">{{ tituloSugerencias() }} · {{ lugar() }}</li> }
                    @for (s of sugerencias(); track s.original; let i = $index) {
                      <li role="option" [id]="'sug-' + i" [class.active]="i === activo()" [attr.aria-selected]="i === activo()" (click)="elegir(s)">
                        <strong>{{ s.nombre }}</strong>
                        <small>Numeración {{ s.desde }}–{{ s.hasta }}</small>
                      </li>
                    }
                    @if (mostrarManual()) {
                      <li role="option" class="fx-suggest-manual" [id]="'sug-' + sugerencias().length" [class.active]="activo() === sugerencias().length"
                        [attr.aria-selected]="activo() === sugerencias().length" (click)="usarTalCual()">
                        <i class="bi bi-pencil-square" aria-hidden="true"></i>
                        <span>Usar «{{ textoCalle().trim() }}» tal como lo escribí</span>
                      </li>
                    } @else if (catalogo().length) {
                      <li class="fx-suggest-foot" role="presentation">{{ catalogo().length }} calles disponibles · escribí para filtrar</li>
                    }
                  </ul>
                }
              </div>
              @if (error('calle'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="c-altura">Altura <span class="fx-muted fw-normal">(opc.)</span></label>
              <input id="c-altura" class="form-control" formControlName="altura" fxMask="altura" inputmode="numeric" autocomplete="off"
                placeholder="1840" [class.is-invalid]="error('altura')" />
              @if (error('altura'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="c-piso">Piso / Depto <span class="fx-muted fw-normal">(opc.)</span></label>
              <input id="c-piso" class="form-control" formControlName="pisoDepto" fxMask="piso" autocomplete="off"
                placeholder="3° B" [class.is-invalid]="error('pisoDepto')" />
              @if (error('pisoDepto'); as msg) { <div class="invalid-feedback d-block">{{ msg }}</div> }
            </div>
          </div>

          @switch (estadoDireccion()) {
            @case ('buscando') {
              <div class="fx-verif"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Verificando la calle en {{ lugar() }}…</span></div>
            }
            @case ('verificada') {
              <div class="fx-verif ok">
                <i class="bi bi-patch-check-fill" aria-hidden="true"></i>
                <div><strong>Dirección verificada</strong>
                  <small>«{{ coincidencia()?.nombre }}» existe en {{ lugar() }}. Numeración registrada: {{ coincidencia()?.desde }}–{{ coincidencia()?.hasta }}.</small></div>
              </div>
            }
            @case ('no-encontrada') {
              <div class="fx-verif warn">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <div><strong>No encontramos esta calle en {{ lugar() }}</strong>
                  <small>Revisá la ortografía o elegí una sugerencia. Si es la dirección correcta, seguí adelante: se registrará como no verificada.</small></div>
              </div>
            }
            @case ('altura-fuera') {
              <div class="fx-verif warn">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <div><strong>La altura {{ form.controls.altura.value }} está fuera del rango registrado</strong>
                  <small>«{{ coincidencia()?.nombre }}» tiene numeración de {{ coincidencia()?.desde }} a {{ coincidencia()?.hasta }} en {{ lugar() }}. Podés continuar igual.</small></div>
              </div>
            }
            @case ('sin-conexion') {
              <div class="fx-verif info">
                <i class="bi bi-wifi-off" aria-hidden="true"></i>
                <div><strong>No pudimos verificar la dirección</strong>
                  <small>No hay conexión con el servicio de calles. Podés continuar: se registrará como no verificada.</small></div>
              </div>
            }
          }
          @if (estadoDireccion() !== 'idle') { <div class="fx-source">Verificación con Georef · datos.gob.ar</div> }

          @if (direccionPreview(); as dir) {
            <div class="fx-addr-preview"><i class="bi bi-house-check" aria-hidden="true"></i><span>Se registrará como: <strong>{{ dir }}</strong></span></div>
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
          <button type="submit" class="btn btn-primary"><i class="bi bi-check2" aria-hidden="true"></i>{{ cliente ? 'Guardar cambios' : 'Crear cliente' }}</button>
        } @else {
          <button type="submit" class="btn btn-primary">Siguiente<i class="bi bi-arrow-right" aria-hidden="true"></i></button>
        }
      </div>
    </form>
  `,
})
export class ClienteModal extends WizardModal implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly calles = inject(CallesService);

  cliente: Cliente | null = null;
  protected readonly pasos = PASOS;
  protected readonly mensajes = MENSAJES;
  protected readonly planes = PLANES;
  protected readonly tipos: TipoDocumento[] = ['DNI', 'Pasaporte'];
  protected readonly condicionesIva = CONDICIONES_IVA;
  protected readonly tiposCliente: { id: TipoCliente; etiqueta: string; detalle: string; icono: string }[] = [
    { id: 'persona', etiqueta: 'Persona', detalle: 'Emprendedor o particular, con DNI o pasaporte', icono: 'person' },
    { id: 'empresa', etiqueta: 'Empresa', detalle: 'Sociedad o comercio, identificado con CUIT', icono: 'building' },
  ];
  protected readonly zonas = ZONAS;

  protected readonly form = this.fb.group({
    tipoCliente: ['persona' as TipoCliente, Validators.required],
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80), nombreClienteValidator]],
    nombreComercial: ['', [Validators.maxLength(80), nombreValidator]],
    condicionIva: [''],
    responsableNombre: ['', personaValidator],
    responsableTelefono: ['', telefonoValidator],
    telefono: ['', [Validators.required, telefonoValidator]],
    plan: [PLANES[0].id as string, Validators.required],
    tipoDocumento: ['DNI' as TipoDocumento, Validators.required],
    numeroDocumento: [
      '',
      [
        Validators.required,
        documentoValidator,
        unico((v, ctl) => this.otros().some((c) => c.tipoDocumento === ctl.parent?.get('tipoDocumento')?.value && c.numeroDocumento === v)),
      ],
    ],
    email: [
      '',
      [Validators.required, emailValidator, unico((v) => this.otros().some((c) => c.email.toLowerCase() === v.toLowerCase()) || this.data.usuarios().some((u) => u.email.toLowerCase() === v.toLowerCase() && (!u.clienteId || u.clienteId !== this.cliente?.id)))],
    ],
    calle: ['', [Validators.required, Validators.maxLength(60), calleValidator]],
    altura: ['', alturaValidator],
    pisoDepto: ['', pisoValidator],
    localidad: ['', [Validators.required, localidadValidator]],
    cuit: [
      '',
      [cuitValidator, unico((v) => this.otros().some((c) => soloDigitos(c.cuit ?? '') === soloDigitos(v)))],
    ],
  });

  protected readonly localidadSel = toSignal(this.form.controls.localidad.valueChanges, { initialValue: this.form.controls.localidad.value });
  protected readonly zona = computed(() => zonaDe(this.localidadSel()));

  private readonly tipoSel = toSignal(this.form.controls.tipoCliente.valueChanges, { initialValue: this.form.controls.tipoCliente.value });
  protected readonly esEmpresa = computed(() => this.tipoSel() === 'empresa');

  private readonly textoCalle = toSignal(this.form.controls.calle.valueChanges, { initialValue: this.form.controls.calle.value });
  private readonly alturaSel = toSignal(this.form.controls.altura.valueChanges, { initialValue: this.form.controls.altura.value });
  protected readonly catalogo = signal<CalleGeo[]>([]);
  private readonly estadoCatalogo = signal<'idle' | 'cargando' | 'ok' | 'error'>('idle');
  private readonly cajaCalle = viewChild<ElementRef<HTMLElement>>('cajaCalle');
  protected readonly pos = signal<{ top: number | null; bottom: number | null; left: number; width: number; maxHeight: number } | null>(null);
  protected readonly abierto = signal(false);
  protected readonly activo = signal(-1);

  protected readonly lugar = computed(() => {
    const destino = georefDe(this.localidadSel());
    return destino && destino.etiqueta !== this.localidadSel() ? `${this.localidadSel()} (${destino.etiqueta})` : this.localidadSel();
  });

  protected readonly sugerencias = computed(() => filtrarCalles(this.catalogo(), this.textoCalle()));
  protected readonly tituloSugerencias = computed(() => (this.textoCalle().trim() ? 'Calles encontradas' : 'Avenidas principales'));
  protected readonly placeholderCalle = computed(() => {
    if (!this.zona()) return 'Elegí primero la localidad';
    if (this.estadoCatalogo() === 'cargando') return 'Cargando calles…';
    return this.catalogo().length ? `Buscá entre ${this.catalogo().length} calles` : 'Escribí el nombre de la calle';
  });

  protected readonly coincidencia = computed(() => {
    const texto = this.textoCalle().trim();
    return texto ? (this.catalogo().find((c) => coincide(texto, c)) ?? null) : null;
  });

  protected readonly estadoDireccion = computed<'idle' | 'buscando' | 'verificada' | 'no-encontrada' | 'altura-fuera' | 'sin-conexion'>(() => {
    if (!this.zona() || this.textoCalle().trim().length < 3) return 'idle';
    const estado = this.estadoCatalogo();
    if (estado === 'idle' || estado === 'cargando') return 'buscando';
    if (estado === 'error') return 'sin-conexion';
    const calle = this.coincidencia();
    if (!calle) return 'no-encontrada';
    const altura = Number(this.alturaSel());
    return altura > 0 && (altura < calle.desde || altura > calle.hasta) ? 'altura-fuera' : 'verificada';
  });

  protected readonly advertencia = computed(() => ['no-encontrada', 'altura-fuera'].includes(this.estadoDireccion()));
  protected readonly mostrarManual = computed(() => this.textoCalle().trim().length >= 3 && !this.coincidencia());
  protected readonly totalOpciones = computed(() => this.sugerencias().length + (this.mostrarManual() ? 1 : 0));
  protected readonly mostrarSugerencias = computed(() => this.abierto() && !!this.zona() && this.totalOpciones() > 0);

  constructor() {
    super();
    this.sincronizarTipo(this.form.controls.tipoCliente.value);
    this.form.controls.tipoCliente.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((tipo) => {
      this.sincronizarTipo(tipo);
      this.form.controls.nombre.updateValueAndValidity();
      this.form.controls.cuit.updateValueAndValidity();
    });
    this.sincronizarDomicilio(this.form.controls.localidad.value);
    this.form.controls.localidad.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.sincronizarDomicilio(v));

    this.form.controls.localidad.valueChanges
      .pipe(
        startWith(this.form.controls.localidad.value),
        distinctUntilChanged(),
        switchMap((localidad) => {
          this.catalogo.set([]);
          if (!zonaDe(localidad)) {
            this.estadoCatalogo.set('idle');
            return of(null);
          }
          this.estadoCatalogo.set('cargando');
          return this.calles.catalogo(localidad).pipe(
            map((calles) => ({ calles, error: false })),
            catchError(() => of({ calles: [] as CalleGeo[], error: true })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (!res) return;
        this.catalogo.set(res.calles);
        this.estadoCatalogo.set(res.error ? 'error' : 'ok');
        this.activo.set(-1);
      });

    this.form.controls.tipoDocumento.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.numeroDocumento.setValue('');
      this.form.controls.cuit.updateValueAndValidity();
    });
    this.form.controls.numeroDocumento.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.form.controls.cuit.updateValueAndValidity();
    });
  }

  ngOnInit() {
    if (this.cliente) {
      const c = this.cliente;
      this.form.setValue({
        tipoCliente: c.tipoCliente ?? 'persona',
        nombre: c.nombre,
        nombreComercial: c.nombreComercial ?? '',
        condicionIva: c.condicionIva ?? '',
        responsableNombre: c.responsableNombre ?? '',
        responsableTelefono: telefonoNacional(c.responsableTelefono ?? ''),
        telefono: telefonoNacional(c.telefono),
        plan: c.plan,
        tipoDocumento: c.tipoDocumento,
        numeroDocumento: c.numeroDocumento,
        email: c.email,
        calle: c.calle,
        altura: c.altura ?? '',
        pisoDepto: c.pisoDepto ?? '',
        localidad: c.localidad,
        cuit: c.cuit ?? '',
      });
    }
  }

  private sincronizarTipo(tipo: TipoCliente) {
    const c = this.form.controls;
    const empresa = tipo === 'empresa';
    for (const control of [c.nombreComercial, c.condicionIva, c.responsableNombre, c.responsableTelefono]) {
      if (empresa) control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    }
    for (const control of [c.tipoDocumento, c.numeroDocumento]) {
      if (empresa) control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    }
  }

  private sincronizarDomicilio(localidad: string) {
    const activo = !!zonaDe(localidad);
    const { calle, altura, pisoDepto } = this.form.controls;
    for (const c of [calle, altura, pisoDepto]) {
      if (activo) c.enable({ emitEvent: false });
      else c.disable({ emitEvent: false });
    }
  }

  protected abrirSugerencias(alEnfocar = false) {
    this.abierto.set(true);
    const caja = this.cajaCalle()?.nativeElement;
    if (alEnfocar) caja?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.calcularPosicion();
  }

  protected calcularPosicion() {
    const caja = this.cajaCalle()?.nativeElement;
    if (!caja) return;
    const r = caja.getBoundingClientRect();
    const alto = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
    const abajo = alto - r.bottom - 12;
    const arriba = r.top - 12;
    const haciaAbajo = abajo >= 200 || abajo >= arriba;
    this.pos.set({
      top: haciaAbajo ? r.bottom + 4 : null,
      bottom: haciaAbajo ? null : window.innerHeight - r.top + 4,
      left: r.left,
      width: r.width,
      maxHeight: Math.min(280, Math.max(120, haciaAbajo ? abajo : arriba)),
    });
  }

  protected usarTalCual() {
    this.abierto.set(false);
    this.activo.set(-1);
  }

  protected elegir(calle: CalleGeo) {
    this.form.controls.calle.setValue(calle.nombre);
    this.abierto.set(false);
    this.activo.set(-1);
  }

  protected teclado(e: KeyboardEvent) {
    const total = this.totalOpciones();
    if (e.key === 'ArrowDown' && total) {
      e.preventDefault();
      this.abierto.set(true);
      this.activo.update((a) => (a + 1) % total);
    } else if (e.key === 'ArrowUp' && total) {
      e.preventDefault();
      this.activo.update((a) => (a <= 0 ? total - 1 : a - 1));
    } else if (e.key === 'Enter' && this.mostrarSugerencias() && this.activo() >= 0) {
      e.preventDefault();
      const calle = this.sugerencias()[this.activo()];
      if (calle) this.elegir(calle);
      else this.usarTalCual();
    } else if (e.key === 'Escape' && this.abierto()) {
      e.stopPropagation();
      this.abierto.set(false);
    }
  }

  protected direccionPreview(): string {
    const v = this.form.getRawValue();
    return v.calle && v.localidad ? direccionCompleta(v) : '';
  }

  protected esDni() {
    return this.form.controls.tipoDocumento.value === 'DNI';
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.irAlPrimerPasoConError();
      return;
    }
    const v = this.form.getRawValue();
    const empresa = v.tipoCliente === 'empresa';
    const limpiar = (texto: string) => texto.trim().replace(/\s+/g, ' ');
    const resultado: ClienteInput = {
      tipoCliente: v.tipoCliente,
      nombre: limpiar(v.nombre),
      nombreComercial: empresa ? limpiar(v.nombreComercial) : '',
      condicionIva: empresa ? v.condicionIva : '',
      responsableNombre: empresa ? limpiar(v.responsableNombre) : '',
      responsableTelefono: empresa && v.responsableTelefono ? formatearTelefono(v.responsableTelefono) : '',
      telefono: formatearTelefono(v.telefono),
      plan: v.plan,
      tipoDocumento: empresa ? 'DNI' : v.tipoDocumento,
      numeroDocumento: empresa ? '' : v.numeroDocumento,
      email: v.email.trim().toLowerCase(),
      calle: limpiar(v.calle),
      altura: v.altura,
      pisoDepto: v.pisoDepto.trim(),
      localidad: v.localidad,
      zonaId: zonaDe(v.localidad)?.id ?? '',
      direccionVerificada: this.estadoDireccion() === 'verificada',
      cuit: v.cuit,
    };
    const confirmado = await this.alert.confirmar({
      titulo: this.cliente ? '¿Guardar los cambios?' : '¿Crear el cliente?',
      mensaje: this.cliente
        ? `Se actualizarán los datos de ${resultado.nombre}.`
        : `Se dará de alta a ${resultado.nombre} y se le generará un acceso con ${resultado.email}.`,
      confirmar: this.cliente ? 'Sí, guardar' : 'Sí, crear',
      tipo: 'info',
    });
    if (confirmado) this.modal.close(resultado);
  }

  private otros(): Cliente[] {
    return this.data.clientes().filter((c) => c.id !== this.cliente?.id);
  }
}
