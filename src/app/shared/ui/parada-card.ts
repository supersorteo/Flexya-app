import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { enCursoMensajero, Envio } from '../../core/models';
import { AccionesMensajero } from './acciones-mensajero';
import { DataService } from '../../core/services/data.service';
import { mapaLink, telefonoLink, whatsappLink } from '../util/contacto';
import { slugEstado, StatusPill } from './ui';

@Component({
  selector: 'fx-parada',
  imports: [RouterLink, StatusPill, AccionesMensajero, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = envio();
    <article [class]="'fx-parada riel-' + slug()" [class.cerrada]="!activo()">
      <header class="fx-parada-head">
        <a class="fx-parada-id" [routerLink]="['/mensajero', 'envios', e.id]">{{ e.id }}</a>
        <fx-status [estado]="e.estado" />
      </header>

      <h3 class="fx-parada-nombre">{{ e.destinatario }}</h3>
      <p class="fx-parada-linea">
        <i class="bi bi-geo-alt-fill" aria-hidden="true"></i>
        <span>{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></span>
      </p>
      <p class="fx-parada-linea fx-muted">
        <i class="bi bi-shop" aria-hidden="true"></i><span>{{ data.nombreCliente(e.clienteId) }}</span>
        <i class="bi bi-clock ms-2" aria-hidden="true"></i><span>{{ e.eta }}</span>
      </p>
      @if (e.estado === 'Incidencia') {
        <p class="fx-parada-nota"><i class="bi bi-box-arrow-in-down" aria-hidden="true"></i>Llevá el paquete al depósito para que lo reciban.</p>
      }
      @if (e.estado === 'Retirado' && e.retiro === 'recoleccion' && !e.entregadoEnDepositoEn) {
        <p class="fx-parada-nota"><i class="bi bi-building" aria-hidden="true"></i>Llevá el paquete al depósito para que lo reciban.</p>
      }
      @if (e.estado === 'En devolución') {
        <p class="fx-parada-linea"><i class="bi bi-arrow-return-left" aria-hidden="true"></i><span>Devolver al cliente en: <strong>{{ data.domicilioCliente(e.clienteId) || 'su domicilio' }}</strong></span></p>
      }
      @if (e.estado === 'Retiro asignado') {
        <p class="fx-parada-linea"><i class="bi bi-house-door" aria-hidden="true"></i><span>Retirar en: <strong>{{ e.origen || 'domicilio del cliente' }}</strong>@if (e.retiro === 'recoleccion') { y llevar al depósito }@if (e.fechaRetiro) { · {{ e.fechaRetiro | date: 'dd/MM' }}{{ e.franja ? ' ' + (e.franja === 'manana' ? 'a la mañana' : 'a la tarde') : '' }} }@if (data.paquetesDelRetiro(e, 'Retiro asignado').length > 1) { · retiro de {{ data.paquetesDelRetiro(e, 'Retiro asignado').length }} paquetes }</span></p>
      }
      @if (e.nota) {
        <p class="fx-parada-nota"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>{{ e.nota }}</p>
      }
      @if (e.recibidoPor) {
        <p class="fx-parada-linea fx-muted"><i class="bi bi-person-check" aria-hidden="true"></i><span>Recibió: {{ e.recibidoPor }}</span></p>
      }

      <div class="fx-parada-contacto">
        @if (tel(); as href) {
          <a class="btn fx-circulo" [href]="href" [attr.aria-label]="'Llamar a ' + e.destinatario" title="Llamar"><i class="bi bi-telephone-fill"></i></a>
        }
        @if (wa(); as href) {
          <a class="btn fx-circulo fx-circulo--wa" [href]="href" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp a ' + e.destinatario" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>
        }
        <a class="btn fx-circulo" [href]="mapa()" target="_blank" rel="noopener" aria-label="Cómo llegar" title="Cómo llegar"><i class="bi bi-signpost-split-fill"></i></a>
        <a class="fx-parada-detalle" [routerLink]="['/mensajero', 'envios', e.id]">Ver detalle<i class="bi bi-chevron-right" aria-hidden="true"></i></a>
      </div>

      <fx-acciones-mensajero [envio]="e" clase="fx-parada-acciones" />
    </article>
  `,
})
export class ParadaCard {
  protected readonly data = inject(DataService);

  readonly envio = input.required<Envio>();
  protected readonly tel = computed(() => telefonoLink(this.envio().telefono));
  protected readonly wa = computed(() =>
    whatsappLink(this.envio().telefono, `Hola ${this.envio().destinatario}, soy tu mensajero de Flexya. Estoy en camino con tu envío ${this.envio().id}.`),
  );
  protected readonly mapa = computed(() => mapaLink(this.envio().direccion, this.envio().localidad));

  protected readonly slug = computed(() => slugEstado(this.envio().estado));
  protected readonly activo = computed(() => enCursoMensajero(this.envio()));
}
