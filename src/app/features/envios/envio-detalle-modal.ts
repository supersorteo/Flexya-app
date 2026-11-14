import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio, EstadoEnvio, MAX_INTENTOS, resumenItems } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { StatusPill } from '../../shared/ui/ui';

const PASOS_DIRECTO: { estado: EstadoEnvio; etiqueta: string; icono: string }[] = [
  { estado: 'Pendiente', etiqueta: 'Creado', icono: 'bag-check' },
  { estado: 'Retiro asignado', etiqueta: 'Retiro asignado', icono: 'person-check' },
  { estado: 'Retirado', etiqueta: 'Retirado', icono: 'box-seam' },
  { estado: 'En reparto', etiqueta: 'En reparto', icono: 'truck' },
  { estado: 'Entregado', etiqueta: 'Entregado', icono: 'check2-circle' },
];

const PASOS: { estado: EstadoEnvio; etiqueta: string; icono: string }[] = [
  { estado: 'Pendiente', etiqueta: 'Creado', icono: 'bag-check' },
  { estado: 'En depósito', etiqueta: 'En depósito', icono: 'building' },
  { estado: 'En reparto', etiqueta: 'En reparto', icono: 'truck' },
  { estado: 'Entregado', etiqueta: 'Entregado', icono: 'check2-circle' },
];

@Component({
  selector: 'fx-envio-detalle-modal',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = envio;
    <div class="modal-header fx-modal-head">
      <div class="d-flex align-items-center gap-3">
        <span class="fx-modal-icon"><i class="bi bi-truck" aria-hidden="true"></i></span>
        <div>
          <h2 class="modal-title h5 mb-0">Envío {{ e.id }}</h2>
          <p class="fx-muted small mb-0">Para {{ e.destinatario }}</p>
        </div>
      </div>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="modal.close()"></button>
    </div>

    <div class="modal-body fx-modal-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="fx-modal-section m-0 flex-grow-1">Seguimiento</h3>
        <fx-status class="ms-3" [estado]="e.estado" />
      </div>

      @if (e.estado === 'Cancelado') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-x-circle-fill" aria-hidden="true"></i><div><strong>Envío cancelado</strong><small>{{ e.nota || 'Se canceló antes de llegar a Flexya.' }}</small></div></div>
      } @else if (e.estado === 'En devolución' || e.estado === 'Devuelto') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-arrow-return-left" aria-hidden="true"></i><div><strong>{{ e.estado === 'Devuelto' ? 'Devuelto al cliente' : 'Devolución en curso' }}</strong><small>{{ textoDevolucion() }}</small></div></div>
      } @else {
        <ol class="fx-seguimiento" aria-label="Estado del envío">
          @for (p of pasos; track p.estado; let i = $index) {
            <li [class.hecho]="i < indice()" [class.actual]="i === indice()" [attr.aria-current]="i === indice() ? 'step' : null">
              <span class="punto"><i [class]="'bi bi-' + (i < indice() ? 'check2' : p.icono)" aria-hidden="true"></i></span>{{ p.etiqueta }}
            </li>
          }
        </ol>
      }

      @if (e.estado === 'Borrador') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-file-earmark-text" aria-hidden="true"></i><div><strong>Borrador</strong><small>Todavía no pediste el servicio ni se reservó stock. Solicitalo cuando esté listo.</small></div></div>
      }
      @if (e.estado === 'En revisión') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-pause-circle-fill" aria-hidden="true"></i><div><strong>Envío en pausa: el contenido no coincide</strong><small>{{ e.nota || 'Lo recibido no coincide con lo declarado.' }} El cliente puede corregir el envío o cancelarlo.</small></div></div>
      }
      @if (e.estado === 'Retiro fallido') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-x-circle-fill" aria-hidden="true"></i><div><strong>No se pudo retirar el paquete</strong><small>{{ e.nota || 'Sin detalle.' }} Flexya lo va a reprogramar.</small></div></div>
      }
      @if (e.estado === 'Incidencia') {
        <div class="fx-verif warn mt-0 mb-3"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><div><strong>Hubo una incidencia en la entrega</strong><small>{{ e.nota || 'Sin detalle.' }} El paquete vuelve al depósito. Intento {{ e.intentos || 1 }} de {{ maxIntentos }}.</small></div></div>
      }
      @if (e.estado === 'Entregado') {
        <div class="fx-verif ok mt-0 mb-3">
          <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
          <div><strong>Entregado{{ e.entregadoEn ? ' · ' + (e.entregadoEn | date: 'd MMM, HH:mm') : '' }}</strong><small>Recibió: {{ e.recibidoPor || 'sin especificar' }}</small></div>
        </div>
      }

      <div class="fx-detalle-grid fx-detalle-modal">
        <section class="fx-detalle-bloque">
          <h4 class="fx-detalle-titulo">Destinatario</h4>
          <p class="fx-detalle-principal">{{ e.destinatario }}</p>
          <p class="fx-parada-linea"><i class="bi bi-telephone" aria-hidden="true"></i><span>{{ e.telefono }}</span></p>
          <p class="fx-parada-linea"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span>{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></span></p>
        </section>

        <section class="fx-detalle-bloque">
          <h4 class="fx-detalle-titulo">Retiro</h4>
          @if (e.retiro === 'domicilio') {
            <p class="fx-detalle-principal">En tu domicilio</p>
            @if (data.tamanoRetiro(e) > 1) {
              <p class="fx-parada-linea"><i class="bi bi-people" aria-hidden="true"></i><span>Retiro {{ e.retiroId }} · {{ data.tamanoRetiro(e) }} destinatarios</span></p>
            }
            <p class="fx-parada-linea"><i class="bi bi-house-door" aria-hidden="true"></i><span>{{ e.origen || 'Domicilio registrado' }}</span></p>
          } @else {
            <p class="fx-detalle-principal">Lo llevás al depósito</p>
            @if (data.tamanoRetiro(e) > 1) {
              <p class="fx-parada-linea"><i class="bi bi-people" aria-hidden="true"></i><span>Retiro {{ e.retiroId }} · {{ data.tamanoRetiro(e) }} destinatarios</span></p>
            }
            <p class="fx-parada-linea"><i class="bi bi-building" aria-hidden="true"></i><span>Lo dejás vos en el depósito de Flexya</span></p>
          }
        </section>

        <section class="fx-detalle-bloque">
          <h4 class="fx-detalle-titulo">Contenido</h4>
          @if (e.items?.length) {
            <ul class="fx-contenido">
              @for (it of e.items; track it.productoId) {
                <li><strong>{{ it.cantidad }} ×</strong> {{ it.nombre }}</li>
              }
            </ul>
            @if (resumen().peso !== null) {
              <p class="fx-muted small mb-0">Peso total: {{ resumen().peso | number: '1.0-3' }} kg{{ resumen().completo ? '' : ' (parcial)' }}</p>
            }
          } @else {
            <p class="fx-muted mb-0">Sin productos cargados.</p>
          }
        </section>

        <section class="fx-detalle-bloque">
          <h4 class="fx-detalle-titulo">Historial</h4>
          <ol class="fx-historial">
            @for (h of e.historial ?? []; track $index) {
              <li><strong>{{ h.estado }}</strong><span class="fx-muted">{{ h.fecha | date: 'd MMM y, HH:mm' }}</span>@if (h.detalle) { <small>{{ h.detalle }}</small> }</li>
            }
          </ol>
        </section>

        <section class="fx-detalle-bloque">
          <h4 class="fx-detalle-titulo">Envío</h4>
          <dl class="fx-datos m-0">
            <div><dt>Tarifa</dt><dd>{{ e.importe | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</dd></div>
            @if (e.intentos) {
              <div><dt>Intentos de entrega</dt><dd>{{ e.intentos }} de {{ maxIntentos }}</dd></div>
            }
            <div><dt>{{ e.retiro === 'deposito' ? 'Llegada al depósito' : 'Retiro' }}</dt><dd>{{ e.fechaRetiro ? (e.fechaRetiro | date: 'EEE d MMM y') : 'Sin fecha' }} · {{ e.retiroProgramado ? 'programado' : 'lo antes posible' }}{{ e.franja ? ' · ' + (e.franja === 'manana' ? 'mañana' : 'tarde') : '' }}</dd></div>
            <div><dt>Creado</dt><dd>{{ e.creadoEn | date: 'd MMM y, HH:mm' }}</dd></div>
            <div><dt>Mensajero</dt><dd>{{ e.mensajeroId ? data.nombreMensajero(e.mensajeroId) : 'Sin asignar' }}</dd></div>
          </dl>
        </section>
      </div>
    </div>

    <div class="modal-footer fx-modal-foot">
      <button type="button" class="btn btn-primary" (click)="modal.close()">Cerrar</button>
    </div>
  `,
})
export class EnvioDetalleModal {
  protected readonly modal = inject(NgbActiveModal);
  protected readonly data = inject(DataService);

  envio!: Envio;
  protected get pasos() {
    return this.envio.retiro === 'domicilio' ? PASOS_DIRECTO : PASOS;
  }

  protected readonly maxIntentos = MAX_INTENTOS;

  protected textoDevolucion(): string {
    const e = this.envio;
    if (e.estado === 'Devuelto') return 'El cliente confirmó que recibió el paquete.';
    if (!e.mensajeroId) return 'Flexya va a asignar un mensajero para llevar el paquete de vuelta al cliente.';
    if (e.devolucionEntregadaEn) return 'El mensajero entregó el paquete. Falta la confirmación del cliente.';
    return 'Un mensajero lleva el paquete de vuelta al cliente.';
  }

  protected indice(): number {
    const directo = this.envio.retiro === 'domicilio';
    const equivalente: Partial<Record<EstadoEnvio, EstadoEnvio>> = {
      Incidencia: 'En reparto',
      'En revisión': directo ? 'Pendiente' : 'En depósito',
      'Retiro fallido': 'Retiro asignado',
    };
    if (directo) equivalente['En depósito'] = 'Retirado';
    const estado = equivalente[this.envio.estado] ?? this.envio.estado;
    return this.pasos.findIndex((p) => p.estado === estado);
  }

  protected resumen() {
    return resumenItems(this.envio.items ?? []);
  }
}
