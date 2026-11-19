import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { interpretarEscaneo } from '../../core/codigo-envio';
import { PageHeader } from '../../shared/ui/ui';
import { ErrorCamara, iniciarEscaneo, MotivoErrorCamara, SesionEscaneo } from '../../shared/util/escaner';

const AYUDA: Record<MotivoErrorCamara, { titulo: string; texto: string }> = {
  permiso: {
    titulo: 'No tenemos permiso para usar la cámara',
    texto: 'Tocá el candado de la barra de direcciones, permití la cámara para este sitio y probá de nuevo. Mientras tanto, podés escribir el código de la etiqueta abajo.',
  },
  'sin-camara': { titulo: 'No encontramos una cámara', texto: 'Este dispositivo no tiene una cámara disponible. Escribí el código de la etiqueta abajo.' },
  'no-soportada': {
    titulo: 'Este navegador no permite usar la cámara',
    texto: 'Abrí la app con Chrome o Safari actualizados. Mientras tanto, podés escribir el código de la etiqueta abajo.',
  },
  otro: { titulo: 'No pudimos abrir la cámara', texto: 'Cerrá otras aplicaciones que la estén usando y probá de nuevo, o escribí el código de la etiqueta abajo.' },
};

/** Pantalla para escanear la etiqueta de un paquete con la cámara, o escribir su código si el QR no se lee. */
@Component({
  selector: 'fx-escaner',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Escanear etiqueta" subtitle="Apuntá la cámara al QR del paquete para ver de quién es y sus datos." />

    <section class="fx-panel fx-escaner">
      <div class="fx-escaner-visor" [class.activo]="estado() === 'activa'">
        <video #video playsinline muted aria-label="Vista de la cámara"></video>
        <div class="fx-escaner-marco" aria-hidden="true"><span></span><span></span><span></span><span></span></div>

        @if (estado() === 'iniciando') {
          <div class="fx-escaner-aviso" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Abriendo la cámara…</div>
        }
        @if (estado() === 'activa' && lectura()) {
          <div class="fx-escaner-lectura" role="status"><i class="bi bi-exclamation-circle" aria-hidden="true"></i>{{ lectura() }}</div>
        }
        @if (estado() === 'error' && motivo(); as m) {
          <div class="fx-escaner-aviso fx-escaner-aviso--error" role="alert">
            <i class="bi bi-camera-video-off" aria-hidden="true"></i>
            <strong>{{ ayuda[m].titulo }}</strong>
            <p>{{ ayuda[m].texto }}</p>
            @if (m !== 'no-soportada' && m !== 'sin-camara') {
              <button type="button" class="btn btn-primary" (click)="activarCamara()"><i class="bi bi-arrow-repeat"></i>Probar de nuevo</button>
            }
          </div>
        }
      </div>

      @if (estado() === 'activa' && linternaDisponible()) {
        <button type="button" class="btn btn-outline-secondary fx-escaner-linterna" [attr.aria-pressed]="linternaEncendida()" (click)="alternarLinterna()">
          <i [class]="'bi bi-' + (linternaEncendida() ? 'lightbulb-fill' : 'lightbulb')" aria-hidden="true"></i>{{ linternaEncendida() ? 'Apagar la linterna' : 'Encender la linterna' }}
        </button>
      }
    </section>

    <section class="fx-panel fx-form-panel mt-3">
      <h2 class="h6 mb-1">¿No se lee el QR?</h2>
      <p class="fx-muted small mb-3">Escribí el código que figura debajo del QR de la etiqueta, o el número del envío (LF-…).</p>
      <form class="fx-escaner-manual" (submit)="buscar($event)" novalidate>
        <label class="visually-hidden" for="codigo-manual">Código de la etiqueta</label>
        <input id="codigo-manual" type="text" class="form-control" placeholder="Ej. K7Q2-M9XA o LF-10001" autocomplete="off" autocapitalize="characters" spellcheck="false"
          [value]="texto()" (input)="texto.set($any($event.target).value)" [class.is-invalid]="!!errorManual()" [attr.aria-invalid]="!!errorManual()" />
        <button type="submit" class="btn btn-primary"><i class="bi bi-search" aria-hidden="true"></i>Buscar</button>
      </form>
      @if (errorManual()) {
        <div class="invalid-feedback d-block" role="alert">{{ errorManual() }}</div>
      }
    </section>
  `,
})
export class Escaner {
  private readonly router = inject(Router);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly ayuda = AYUDA;
  protected readonly estado = signal<'iniciando' | 'activa' | 'error'>('iniciando');
  protected readonly motivo = signal<MotivoErrorCamara | null>(null);
  protected readonly lectura = signal('');
  protected readonly texto = signal('');
  protected readonly errorManual = signal('');
  protected readonly linternaDisponible = signal(false);
  protected readonly linternaEncendida = signal(false);

  private sesion: SesionEscaneo | null = null;
  private avisoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => void this.activarCamara());
    inject(DestroyRef).onDestroy(() => {
      this.sesion?.detener();
      if (this.avisoTimer) clearTimeout(this.avisoTimer);
    });
  }

  protected async activarCamara() {
    this.sesion?.detener();
    this.sesion = null;
    this.estado.set('iniciando');
    this.motivo.set(null);
    try {
      this.sesion = await iniciarEscaneo(this.video().nativeElement, (leido) => this.alLeer(leido));
      this.linternaDisponible.set(this.sesion.linterna.disponible);
      this.estado.set('activa');
    } catch (error) {
      this.motivo.set(error instanceof ErrorCamara ? error.motivo : 'otro');
      this.estado.set('error');
    }
  }

  protected async alternarLinterna() {
    if (!this.sesion) return;
    try {
      this.linternaEncendida.set(await this.sesion.linterna.alternar());
    } catch {
      this.linternaDisponible.set(false);
    }
  }

  private alLeer(leido: string) {
    if (!this.abrir(leido)) {
      this.lectura.set('Ese QR no es de un envío de Flexya.');
      if (this.avisoTimer) clearTimeout(this.avisoTimer);
      this.avisoTimer = setTimeout(() => this.lectura.set(''), 2500);
      return;
    }
    globalThis.navigator?.vibrate?.(60);
  }

  protected buscar(evento: Event) {
    evento.preventDefault();
    this.errorManual.set('');
    if (!this.texto().trim()) {
      this.errorManual.set('Escribí el código de la etiqueta.');
      return;
    }
    if (!this.abrir(this.texto())) this.errorManual.set('Ese código no es de un envío. Revisalo: tiene 8 letras y números, por ejemplo K7Q2-M9XA.');
  }

  /** Abre la ficha del paquete; devuelve false si lo leído no se parece a una etiqueta de envío. */
  private abrir(texto: string): boolean {
    const lectura = interpretarEscaneo(texto);
    if (!lectura) return false;
    this.sesion?.detener();
    this.sesion = null;
    void this.router.navigate(['/e', lectura.valor]);
    return true;
  }
}
