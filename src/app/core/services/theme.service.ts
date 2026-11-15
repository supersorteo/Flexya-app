import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

export const CLAVE_TEMA = 'flexya-tema';

const COLOR_BARRA = { claro: '#f3f6fb', oscuro: '#0a1424' } as const;
const CICLO: PreferenciaTema[] = ['sistema', 'claro', 'oscuro'];

export const ETIQUETA_TEMA: Record<PreferenciaTema, string> = {
  sistema: 'Automático',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

export const ICONO_TEMA: Record<PreferenciaTema, string> = {
  sistema: 'circle-half',
  claro: 'sun',
  oscuro: 'moon-stars',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly consulta = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  readonly preferencia = signal<PreferenciaTema>(this.leer());
  private readonly sistemaOscuro = signal(this.consulta?.matches ?? false);
  readonly efectivo = computed<'claro' | 'oscuro'>(() => {
    const p = this.preferencia();
    if (p === 'sistema') return this.sistemaOscuro() ? 'oscuro' : 'claro';
    return p;
  });

  constructor() {
    this.consulta?.addEventListener?.('change', (e) => {
      this.sistemaOscuro.set(e.matches);
      this.aplicar();
    });
    this.aplicar();
  }

  establecer(preferencia: PreferenciaTema) {
    this.preferencia.set(preferencia);
    try {
      localStorage.setItem(CLAVE_TEMA, preferencia);
    } catch {
      /* sin acceso al almacenamiento: el tema sigue funcionando en esta sesión */
    }
    this.aplicar();
  }

  alternar() {
    this.establecer(CICLO[(CICLO.indexOf(this.preferencia()) + 1) % CICLO.length]);
  }

  private aplicar() {
    const efectivo = this.efectivo();
    const raiz = this.doc.documentElement;
    raiz.setAttribute('data-bs-theme', efectivo === 'oscuro' ? 'dark' : 'light');
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[efectivo]);
  }

  private leer(): PreferenciaTema {
    try {
      const guardada = localStorage.getItem(CLAVE_TEMA);
      return guardada === 'claro' || guardada === 'oscuro' || guardada === 'sistema' ? guardada : 'sistema';
    } catch {
      return 'sistema';
    }
  }
}
