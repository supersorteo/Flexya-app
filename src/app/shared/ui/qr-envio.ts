import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { urlDelCodigo } from '../../core/codigo-envio';
import { Envio } from '../../core/models';
import { generarQr, QrDibujo } from '../util/qr';

/** El QR de un envío, dibujado en vectores: nítido a cualquier tamaño y sin depender de imágenes. Lleva solo el enlace con el código. */
@Component({
  selector: 'fx-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dibujo(); as d) {
      <svg role="img" [attr.aria-label]="'Código QR del envío ' + envio().id" [attr.viewBox]="'0 0 ' + d.tamano + ' ' + d.tamano" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <rect [attr.width]="d.tamano" [attr.height]="d.tamano" fill="#ffffff" />
        <path [attr.d]="d.ruta" fill="#000000" />
      </svg>
    }
  `,
})
export class QrEnvio {
  readonly envio = input.required<Envio>();
  protected readonly dibujo = signal<QrDibujo | null>(null);

  constructor() {
    effect(() => {
      const url = urlDelCodigo(this.envio().codigo);
      void generarQr(url).then((d) => this.dibujo.set(d));
    });
  }
}
