import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { esPasado, incluyeAhora, Nivel, Rango, rangoDe } from '../periodos';
import { AuthService } from './auth.service';

/** El período que se está mirando: uno solo para toda la app, así todas las secciones hablan del mismo día. */
@Injectable({ providedIn: 'root' })
export class PeriodoService {
  private readonly auth = inject(AuthService);
  private readonly ahora = signal(new Date());

  readonly rango = signal<Rango>(rangoDe('dia', new Date()));
  readonly esActual = computed(() => incluyeAhora(this.rango(), this.ahora()));
  readonly pasado = computed(() => esPasado(this.rango(), this.ahora()));

  constructor() {
    const sesion = computed(() => this.auth.user()?.id ?? null);
    effect(() => {
      if (sesion()) untracked(() => this.reiniciar());
    });
    const reloj = setInterval(() => this.avanzar(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  reiniciar(nivel: Nivel = 'dia') {
    this.ahora.set(new Date());
    this.rango.set(rangoDe(nivel, this.ahora()));
  }

  /** Pasada la medianoche, quien estaba mirando "hoy" sigue mirando "hoy". */
  private avanzar() {
    const sigueHoy = incluyeAhora(this.rango(), this.ahora());
    this.ahora.set(new Date());
    if (sigueHoy) this.rango.set(rangoDe(this.rango().nivel, this.ahora()));
  }
}
