import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Envio } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { QrEnvio } from './qr-envio';

/**
 * La etiqueta que se pega en el paquete. Solo lleva lo que hace falta para entregarlo (y el QR, que es la llave a los datos):
 * no muestra importes ni nada de la cuenta del cliente. Todo se mide en la proporción de la etiqueta, así se ve igual en pantalla e impresa.
 */
@Component({
  selector: 'fx-etiqueta',
  imports: [DatePipe, QrEnvio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = envio();
    <article class="fx-etiqueta" [attr.aria-label]="'Etiqueta del envío ' + e.id">
      <header class="fx-etq-cab">
        <span class="fx-etq-marca">flexya</span>
        <span class="fx-etq-pos">Paquete {{ posicion() }} de {{ total() }}</span>
      </header>

      <div class="fx-etq-qr"><fx-qr [envio]="e" /></div>

      <div class="fx-etq-codigos">
        <span class="fx-etq-numero">{{ e.id }}</span>
        <span class="fx-etq-codigo" title="Código para escribir a mano si el QR no se lee">{{ codigoLegible() }}</span>
      </div>

      <section class="fx-etq-bloque">
        <span class="fx-etq-rotulo">Para</span>
        <strong class="fx-etq-destinatario">{{ e.destinatario }}</strong>
        <span>{{ e.direccion }}</span>
        <span>{{ e.localidad }} · {{ data.nombreZona(e.zonaId) }}</span>
      </section>

      <section class="fx-etq-bloque">
        <span class="fx-etq-rotulo">De</span>
        <strong>{{ data.nombreCliente(e.clienteId) }}</strong>
      </section>

      <footer class="fx-etq-pie">
        <span>Retiro {{ e.retiroId }}</span>
        @if (e.fechaRetiro) {
          <span>{{ e.retiro === 'deposito' ? 'Llega' : 'Retiro' }} {{ e.fechaRetiro | date: 'dd/MM/yy' }}</span>
        }
      </footer>
    </article>
  `,
})
export class EtiquetaEnvio {
  protected readonly data = inject(DataService);

  readonly envio = input.required<Envio>();
  readonly posicion = input(1);
  readonly total = input(1);

  protected readonly codigoLegible = computed(() => `${this.envio().codigo.slice(0, 4)}-${this.envio().codigo.slice(4)}`);
}
