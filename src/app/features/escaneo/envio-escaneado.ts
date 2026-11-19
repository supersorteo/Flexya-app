import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { interpretarEscaneo } from '../../core/codigo-envio';
import { MAX_INTENTOS, resumenItems } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AccionesEnvio } from '../../core/services/envio-acciones';
import { AccionesMensajero } from '../../shared/ui/acciones-mensajero';
import { Empty } from '../../shared/ui/empty';
import { StatusPill } from '../../shared/ui/ui';

/**
 * Lo que se abre al escanear la etiqueta de un envío (ruta /e/:codigo).
 * Muestra de quién es y sus datos, y ofrece solo la acción que corresponde al rol y al estado; cada acción pide confirmar.
 */
@Component({
  selector: 'fx-envio-escaneado',
  imports: [RouterLink, StatusPill, Empty, DatePipe, CurrencyPipe, AccionesMensajero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!lectura()) {
      <section class="fx-panel">
        <fx-empty icono="qr-code" titulo="Ese código no es de un envío" descripcion="Probá escanear la etiqueta de nuevo o escribí el código que está impreso debajo del QR.">
          @if (puedeEscanear()) {
            <a class="btn btn-primary" [routerLink]="volverA()"><i class="bi bi-qr-code-scan"></i>Escanear otra etiqueta</a>
          }
        </fx-empty>
      </section>
    } @else if (envio(); as e) {
      <a class="fx-back" [routerLink]="volverA()"><i class="bi bi-arrow-left" aria-hidden="true"></i>{{ puedeEscanear() ? 'Escanear otra etiqueta' : 'Mis envíos' }}</a>

      <header class="fx-escaneo-hero">
        <div class="fx-escaneo-hero-top">
          <span class="fx-escaneo-numero">{{ e.id }}</span>
          <fx-status [estado]="e.estado" />
        </div>
        <span class="fx-escaneo-etiqueta">De quién es</span>
        <h1 class="fx-escaneo-dueno">{{ data.nombreCliente(e.clienteId) }}</h1>
        <p class="fx-escaneo-para"><i class="bi bi-arrow-right-short" aria-hidden="true"></i>Para <strong>{{ e.destinatario }}</strong> · {{ e.localidad }}</p>
      </header>

      @if (e.estado === 'Incidencia') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><div><strong>Incidencia registrada</strong><small>{{ e.nota || 'Sin detalle.' }}</small></div></div>
      }
      @if (e.estado === 'Entregado') {
        <div class="fx-verif ok mt-0 mb-3"><i class="bi bi-check-circle-fill" aria-hidden="true"></i><div><strong>Entregado{{ e.entregadoEn ? ' · ' + (e.entregadoEn | date: 'd MMM, HH:mm') : '' }}</strong><small>Recibió: {{ e.recibidoPor || 'sin especificar' }}</small></div></div>
      }
      @if (e.estado === 'Cancelado' || e.estado === 'Devuelto') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-x-circle-fill" aria-hidden="true"></i><div><strong>{{ e.estado === 'Cancelado' ? 'Envío cancelado' : 'Devuelto al cliente' }}</strong><small>{{ e.nota || 'Este paquete ya no sigue su camino.' }}</small></div></div>
      }

      <div class="fx-detalle-grid">
        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Destinatario</h2>
          <p class="fx-detalle-principal">{{ e.destinatario }}</p>
          <p class="fx-parada-linea"><i class="bi bi-telephone" aria-hidden="true"></i><span>{{ e.telefono }}</span></p>
          <p class="fx-parada-linea"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span>{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></span></p>
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Envío</h2>
          <dl class="fx-datos">
            <div><dt>Retiro</dt><dd>{{ tipoRetiro(e.retiro) }}</dd></div>
            @if (data.tamanoRetiro(e) > 1) {
              <div><dt>Mismo retiro</dt><dd>{{ e.retiroId }} · {{ data.tamanoRetiro(e) }} paquetes</dd></div>
            }
            <div><dt>{{ e.retiro === 'deposito' ? 'Llega' : 'Retiro' }}</dt><dd>{{ e.fechaRetiro ? (e.fechaRetiro | date: 'EEE d MMM') : 'Sin fecha' }}</dd></div>
            <div><dt>Mensajero</dt><dd>{{ e.mensajeroId ? data.nombreMensajero(e.mensajeroId) : 'Sin asignar' }}</dd></div>
            @if (e.intentos) {
              <div><dt>Intentos</dt><dd>{{ e.intentos }} de {{ maxIntentos }}</dd></div>
            }
            @if (esAdmin()) {
              <div><dt>Tarifa</dt><dd>{{ e.importe | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</dd></div>
            }
          </dl>
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Contenido</h2>
          @if (e.items.length) {
            <ul class="fx-contenido">
              @for (it of e.items; track it.productoId) {
                <li><strong>{{ it.cantidad }} ×</strong> {{ it.nombre }}</li>
              }
            </ul>
            @if (resumen().peso !== null) {
              <p class="fx-muted small mb-0">Peso total: {{ resumen().peso }} kg{{ resumen().completo ? '' : ' (faltan datos de algún producto)' }}</p>
            }
          } @else {
            <p class="fx-muted mb-0">Sin productos cargados.</p>
          }
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Recorrido</h2>
          <ol class="fx-historial">
            @for (h of historial(); track $index) {
              <li><strong>{{ h.estado }}</strong><span class="fx-muted">{{ h.fecha | date: 'd MMM, HH:mm' }}</span>@if (h.detalle) { <small>{{ h.detalle }}</small> }</li>
            }
          </ol>
        </section>

        @if (esAdmin() && escaneos().length) {
          <section class="fx-panel fx-detalle-card">
            <h2 class="fx-detalle-titulo">Escaneos de esta etiqueta</h2>
            <ul class="fx-escaneos">
              @for (s of escaneos(); track $index) {
                <li [class.rechazado]="s.resultado === 'rechazado'">
                  <i [class]="'bi bi-' + (s.resultado === 'ok' ? 'check2-circle' : 'x-octagon')" aria-hidden="true"></i>
                  <span><strong>{{ s.rol === 'admin' ? 'Superadmin' : s.rol === 'mensajero' ? 'Mensajero' : 'Cliente' }}</strong> · {{ s.accion }}</span>
                  <time class="fx-muted">{{ s.fecha | date: 'd MMM, HH:mm' }}</time>
                </li>
              }
            </ul>
          </section>
        }
      </div>

      @if (esMensajero()) {
        <fx-acciones-mensajero [envio]="e" clase="fx-barra-acciones" />
      } @else if (esAdmin() && (data.puedeRecepcionar(e) || data.puedeAsignarse(e))) {
        <div class="fx-barra-acciones fx-barra-acciones--admin">
          @if (data.puedeRecepcionar(e)) {
            <button type="button" class="btn btn-success" (click)="recepcionar()"><i class="bi bi-box-arrow-in-down"></i>Recepcionar en depósito</button>
          }
          @if (data.puedeAsignarse(e)) {
            @if (!data.mensajeros().length) {
              <small class="fx-muted">Primero creá un mensajero.</small>
            } @else {
              <select #sel class="form-select" [attr.aria-label]="'Mensajero para ' + e.id">
                @for (m of mensajerosPara(); track m.id) {
                  <option [value]="m.id">{{ m.nombre }} · {{ data.nombreZona(m.zonaId) }}{{ m.zonaId === e.zonaId ? ' (zona)' : '' }}</option>
                }
              </select>
              <button type="button" class="btn btn-primary" (click)="asignar(sel.value)"><i class="bi bi-person-check"></i>Asignar al mensajero</button>
            }
          }
        </div>
      } @else if (!esAdmin() && !esMensajero()) {
        <p class="fx-muted small text-center mt-3">Solo podés consultar este envío. Para cambiar algo, usá tu lista de envíos.</p>
      }
    } @else {
      <section class="fx-panel">
        <fx-empty icono="shield-lock" titulo="No encontramos este paquete" [descripcion]="mensajeNoEncontrado()">
          @if (puedeEscanear()) {
            <a class="btn btn-primary" [routerLink]="volverA()"><i class="bi bi-qr-code-scan"></i>Escanear otra etiqueta</a>
          }
        </fx-empty>
      </section>
    }
  `,
})
export class EnvioEscaneado {
  protected readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly acciones = inject(AccionesEnvio);

  readonly codigo = input.required<string>();
  protected readonly maxIntentos = MAX_INTENTOS;

  protected readonly user = this.auth.user;
  protected readonly lectura = computed(() => interpretarEscaneo(this.codigo()));
  protected readonly envio = computed(() => this.data.envioEscaneado(this.user(), this.codigo()));
  protected readonly esAdmin = computed(() => this.user()?.rol === 'admin');
  protected readonly esMensajero = computed(() => this.user()?.rol === 'mensajero');
  protected readonly puedeEscanear = computed(() => this.esAdmin() || this.esMensajero());
  protected readonly resumen = computed(() => resumenItems(this.envio()?.items ?? []));
  protected readonly historial = computed(() => [...(this.envio()?.historial ?? [])].reverse());
  protected readonly escaneos = computed(() => [...(this.envio()?.escaneos ?? [])].reverse().slice(0, 6));

  protected readonly volverA = computed(() => (this.puedeEscanear() ? `/${this.user()?.rol}/escanear` : '/cliente/envios'));

  constructor() {
    // Cada vez que se abre un paquete queda constancia de quién lo escaneó (también si no le correspondía).
    effect(() => {
      const codigo = this.codigo();
      this.user()?.id;
      untracked(() => this.registrar(codigo));
    });
  }

  protected mensajeNoEncontrado(): string {
    return this.esMensajero()
      ? 'No está entre tus envíos. Si debería ser tuyo, pedile al superadmin que te lo asigne.'
      : this.esAdmin()
        ? 'El código no corresponde a ningún envío (o es un borrador que el cliente todavía no solicitó).'
        : 'No está entre tus envíos.';
  }

  protected tipoRetiro(retiro: string): string {
    return retiro === 'domicilio' ? 'Lo retiramos en el domicilio' : retiro === 'recoleccion' ? 'Lo retiramos y pasa por el depósito' : 'Lo lleva el cliente al depósito';
  }

  protected mensajerosPara() {
    const e = this.envio();
    const todos = this.data.mensajeros();
    return e ? [...todos.filter((m) => m.zonaId === e.zonaId), ...todos.filter((m) => m.zonaId !== e.zonaId)] : todos;
  }

  protected recepcionar() {
    const e = this.envio();
    if (e) void this.acciones.recepcionar(e);
  }

  protected asignar(mensajeroId: string) {
    const e = this.envio();
    if (e) void this.acciones.asignar(e, mensajeroId);
  }

  private registrar(codigo: string) {
    const usuario = this.auth.user();
    if (!usuario || !interpretarEscaneo(codigo)) return;
    const visible = this.data.envioEscaneado(usuario, codigo);
    this.data.registrarEscaneo(codigo, usuario, visible ? 'ok' : 'rechazado', visible ? 'Consulta' : 'No le corresponde o no existe');
  }
}
