import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Envio } from '../../core/models';
import { AccionesEnvio } from '../../core/services/envio-acciones';
import { DataService } from '../../core/services/data.service';
import { mapaLink, telefonoLink, whatsappLink } from '../util/contacto';
import { StatusPill } from './ui';

@Component({
  selector: 'fx-parada',
  imports: [RouterLink, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = envio();
    <article class="fx-parada" [class.cerrada]="e.estado !== 'En reparto'">
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
      @if (e.nota) {
        <p class="fx-parada-nota"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>{{ e.nota }}</p>
      }
      @if (e.recibidoPor) {
        <p class="fx-parada-linea fx-muted"><i class="bi bi-person-check" aria-hidden="true"></i><span>Recibió: {{ e.recibidoPor }}</span></p>
      }

      <div class="fx-parada-contacto">
        @if (tel(); as href) {
          <a class="btn btn-outline-secondary" [href]="href" [attr.aria-label]="'Llamar a ' + e.destinatario"><i class="bi bi-telephone"></i>Llamar</a>
        }
        @if (wa(); as href) {
          <a class="btn btn-outline-secondary" [href]="href" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp a ' + e.destinatario"><i class="bi bi-whatsapp"></i>WhatsApp</a>
        }
        <a class="btn btn-outline-secondary" [href]="mapa()" target="_blank" rel="noopener" aria-label="Cómo llegar"><i class="bi bi-signpost-split"></i>Mapa</a>
      </div>

      @if (e.estado === 'En reparto') {
        <div class="fx-parada-acciones">
          <button type="button" class="btn btn-outline-secondary" (click)="incidencia()"><i class="bi bi-exclamation-triangle"></i>Incidencia</button>
          <button type="button" class="btn btn-primary" (click)="entregar()"><i class="bi bi-check2-circle"></i>Entregado</button>
        </div>
      }
      <a class="fx-parada-detalle" [routerLink]="['/mensajero', 'envios', e.id]">Ver detalle<i class="bi bi-chevron-right" aria-hidden="true"></i></a>
    </article>
  `,
})
export class ParadaCard {
  protected readonly data = inject(DataService);
  private readonly acciones = inject(AccionesEnvio);

  readonly envio = input.required<Envio>();
  protected readonly tel = computed(() => telefonoLink(this.envio().telefono));
  protected readonly wa = computed(() =>
    whatsappLink(this.envio().telefono, `Hola ${this.envio().destinatario}, soy tu mensajero de Flexya. Estoy en camino con tu envío ${this.envio().id}.`),
  );
  protected readonly mapa = computed(() => mapaLink(this.envio().direccion, this.envio().localidad));

  protected entregar() {
    void this.acciones.entregar(this.envio());
  }

  protected incidencia() {
    void this.acciones.incidencia(this.envio());
  }
}
