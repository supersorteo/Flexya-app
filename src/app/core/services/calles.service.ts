import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, throwError, timeout } from 'rxjs';
import { GeorefDepto, georefDe } from '../models/geo';

const URL_CALLES = 'https://apis.datos.gob.ar/georef/api/calles';
const PAGINA = 5000;
const PREFIJOS = new Set(['av', 'avda', 'avenida', 'calle', 'pje', 'pasaje', 'bv', 'boulevard', 'diag', 'diagonal']);
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el', 'e']);
const ABREVIATURAS: Record<string, string> = {
  av: 'Av.', avda: 'Av.', pje: 'Pje.', diag: 'Diag.', bv: 'Bv.', gral: 'Gral.', cnel: 'Cnel.', dr: 'Dr.', ing: 'Ing.', tte: 'Tte.',
};

export interface CalleGeo {
  nombre: string;
  original: string;
  avenida: boolean;
  desde: number;
  hasta: number;
}

export interface GeorefCalle {
  nombre: string;
  categoria?: string;
  altura?: { inicio: { derecha: number; izquierda: number }; fin: { derecha: number; izquierda: number } };
}

interface GeorefRespuesta {
  calles: GeorefCalle[];
  cantidad: number;
  inicio: number;
  total: number;
}

export function normalizarCalle(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sinPrefijo(texto: string): string {
  const partes = normalizarCalle(texto).split(' ');
  while (partes.length > 1 && PREFIJOS.has(partes[0])) partes.shift();
  return partes.join(' ');
}

export function embellecerCalle(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) => {
      if (ABREVIATURAS[palabra]) return ABREVIATURAS[palabra];
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ');
}

export function nombreVisible(nombre: string, categoria?: string): string {
  const cat = (categoria ?? '').trim();
  const primera = normalizarCalle(nombre).split(' ')[0];
  const prefijo = cat && cat.toUpperCase() !== 'CALLE' && !PREFIJOS.has(primera) ? embellecerCalle(cat) : '';
  return [prefijo, embellecerCalle(nombre)].filter(Boolean).join(' ');
}

export function coincide(texto: string, calle: CalleGeo): boolean {
  return sinPrefijo(texto) === sinPrefijo(calle.original);
}

export function agruparCalles(calles: GeorefCalle[]): CalleGeo[] {
  const grupos = new Map<string, { calle: GeorefCalle; min: number; max: number }>();
  for (const c of calles) {
    const valores = c.altura ? [c.altura.inicio.derecha, c.altura.inicio.izquierda, c.altura.fin.derecha, c.altura.fin.izquierda] : [0];
    const clave = normalizarCalle(c.nombre);
    const g = grupos.get(clave) ?? { calle: c, min: Infinity, max: 0 };
    g.min = Math.min(g.min, ...valores);
    g.max = Math.max(g.max, ...valores);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => {
      const desde = Math.max(1, g.min === Infinity ? 1 : g.min);
      return {
        nombre: nombreVisible(g.calle.nombre, g.calle.categoria),
        original: g.calle.nombre,
        avenida: (g.calle.categoria ?? '').toUpperCase() === 'AV',
        desde,
        hasta: Math.max(desde, g.max),
      };
    })
    .sort((a, b) => sinPrefijo(a.original).localeCompare(sinPrefijo(b.original), 'es'));
}

export function filtrarCalles(catalogo: readonly CalleGeo[], texto: string, limite = 30): CalleGeo[] {
  const q = sinPrefijo(texto);
  if (!q) {
    return catalogo
      .filter((c) => c.avenida)
      .sort((a, b) => b.hasta - a.hasta || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 50);
  }
  const palabras = q.split(' ');
  return catalogo
    .map((c) => {
      const nombre = sinPrefijo(c.original);
      const orden = nombre.startsWith(q)
        ? 0
        : palabras.every((p) => nombre.split(' ').some((w) => w.startsWith(p)))
          ? 1
          : nombre.includes(q)
            ? 2
            : -1;
      return { c, orden, nombre };
    })
    .filter((x) => x.orden >= 0)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, limite)
    .map((x) => x.c);
}

@Injectable({ providedIn: 'root' })
export class CallesService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<CalleGeo[]>>();

  catalogo(localidad: string): Observable<CalleGeo[]> {
    const destino = georefDe(localidad);
    if (!destino) return of([]);

    let catalogo$ = this.cache.get(destino.departamento);
    if (!catalogo$) {
      catalogo$ = this.descargar(destino).pipe(
        map((calles) => agruparCalles(calles)),
        catchError((e) => {
          this.cache.delete(destino.departamento);
          return throwError(() => e);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache.set(destino.departamento, catalogo$);
    }
    return catalogo$;
  }

  private descargar(destino: GeorefDepto, inicio = 0, acumulado: GeorefCalle[] = []): Observable<GeorefCalle[]> {
    const params = new HttpParams()
      .set('provincia', destino.provincia)
      .set('departamento', destino.departamento)
      .set('campos', 'nombre,categoria,altura')
      .set('orden', 'nombre')
      .set('max', String(PAGINA))
      .set('inicio', String(inicio));

    return this.http.get<GeorefRespuesta>(URL_CALLES, { params }).pipe(
      timeout(20000),
      switchMap((r) => {
        const todas = [...acumulado, ...r.calles];
        return r.cantidad > 0 && r.inicio + r.cantidad < r.total ? this.descargar(destino, r.inicio + r.cantidad, todas) : of(todas);
      }),
    );
  }
}
