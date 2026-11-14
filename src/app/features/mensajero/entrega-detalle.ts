import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AccionesEnvio } from '../../core/services/envio-acciones';
import { mapaLink, telefonoLink, whatsappLink } from '../../shared/util/contacto';
import { StatusPill } from '../../shared/ui/ui';

@Component({
  selector: 'fx-entrega-detalle',
  imports: [RouterLink, StatusPill, CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="fx-back" routerLink="/mensajero/envios"><i class="bi bi-arrow-left" aria-hidden="true"></i>Mis envíos</a>

    @if (envio(); as e) {
      <div class="fx-page-header">
        <div>
          <div class="fx-eyebrow">DETALLE DE ENTREGA</div>
          <h1>{{ e.id }}</h1>
        </div>
        <fx-status [estado]="e.estado" />
      </div>

      @if (e.estado === 'Entregado') {
        <div class="fx-verif ok mt-0 mb-3">
          <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
          <div>
            <strong>Entregado{{ e.entregadoEn ? ' · ' + (e.entregadoEn | date: "d MMM, HH:mm") : '' }}</strong>
            <small>Recibió: {{ e.recibidoPor || 'sin especificar' }}</small>
          </div>
        </div>
      }
      @if (e.estado === 'Incidencia') {
        <div class="fx-verif warn mt-0 mb-3">
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          <div><strong>Incidencia registrada</strong><small>{{ e.nota || 'Sin detalle.' }}</small></div>
        </div>
      }

      <div class="fx-detalle-grid">
        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Destinatario</h2>
          <p class="fx-detalle-principal">{{ e.destinatario }}</p>
          <p class="fx-parada-linea"><i class="bi bi-telephone" aria-hidden="true"></i><span>{{ e.telefono }}</span></p>
          <div class="fx-parada-contacto">
            @if (tel(); as href) {
              <a class="btn btn-outline-secondary" [href]="href"><i class="bi bi-telephone"></i>Llamar</a>
            }
            @if (wa(); as href) {
              <a class="btn btn-outline-secondary" [href]="href" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>WhatsApp</a>
            }
          </div>
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Dirección</h2>
          <p class="fx-detalle-principal">{{ e.direccion }}</p>
          <p class="fx-parada-linea"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span>{{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></span></p>
          <div class="fx-parada-contacto">
            <a class="btn btn-outline-secondary" [href]="mapa()" target="_blank" rel="noopener"><i class="bi bi-signpost-split"></i>Cómo llegar</a>
          </div>
        </section>

        <section class="fx-panel fx-detalle-card">
          <h2 class="fx-detalle-titulo">Envío</h2>
          <dl class="fx-datos">
            <div><dt>Remitente</dt><dd>{{ data.nombreCliente(e.clienteId) }}</dd></div>
            <div><dt>Importe</dt><dd>{{ e.importe | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</dd></div>
            <div><dt>Creado</dt><dd>{{ e.creadoEn | date: 'd MMM, HH:mm' }}</dd></div>
            <div><dt>Horario</dt><dd>{{ e.eta }}</dd></div>
          </dl>
        </section>
      </div>

      @if (e.estado === 'En reparto') {
        <div class="fx-barra-acciones">
          <button type="button" class="btn btn-outline-secondary" (click)="incidencia()"><i class="bi bi-exclamation-triangle"></i>Incidencia</button>
          <button type="button" class="btn btn-primary" (click)="entregar()"><i class="bi bi-check2-circle"></i>Marcar entregado</button>
        </div>
      }
    } @else {
      <div class="fx-panel text-center fx-muted py-5 px-3 mt-3">
        <i class="bi bi-search fs-2 d-block mb-2"></i>
        No encontramos este envío entre los tuyos.
      </div>
    }
  `,
})
export class EntregaDetalle {
  protected readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly acciones = inject(AccionesEnvio);

  readonly id = input.required<string>();
  protected readonly envio = computed(() => this.data.enviosDe(this.auth.user()).find((e) => e.id === this.id()) ?? null);
  protected readonly tel = computed(() => (this.envio() ? telefonoLink(this.envio()!.telefono) : null));
  protected readonly wa = computed(() => {
    const e = this.envio();
    return e ? whatsappLink(e.telefono, `Hola ${e.destinatario}, soy tu mensajero de Flexya. Estoy en camino con tu envío ${e.id}.`) : null;
  });
  protected readonly mapa = computed(() => {
    const e = this.envio();
    return e ? mapaLink(e.direccion, e.localidad) : '';
  });

  protected entregar() {
    const e = this.envio();
    if (e) void this.acciones.entregar(e);
  }

  protected incidencia() {
    const e = this.envio();
    if (e) void this.acciones.incidencia(e);
  }
}
