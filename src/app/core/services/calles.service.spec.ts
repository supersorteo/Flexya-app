import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { georefDe } from '../models/geo';
import { LOCALIDADES } from '../models/zonas';
import {
  CalleGeo, CallesService, agruparCalles, coincide, embellecerCalle, filtrarCalles, nombreVisible, normalizarCalle, sinPrefijo,
} from './calles.service';

const alt = (a: number, b: number) => ({ inicio: { derecha: a, izquierda: a }, fin: { derecha: b, izquierda: b } });

describe('Georef: mapeo de localidades', () => {
  it('todas las localidades de las zonas tienen departamento en Georef', () => {
    expect(LOCALIDADES.filter((l) => !georefDe(l))).toEqual([]);
  });

  it('los barrios de CABA usan el id de su comuna', () => {
    expect(georefDe('Balvanera')).toEqual({ provincia: '02', departamento: '02021', etiqueta: 'Comuna 3' });
    expect(georefDe('Belgrano')?.departamento).toBe('02091');
    expect(georefDe('Palermo')?.departamento).toBe('02098');
    expect(georefDe('Lanús')).toEqual({ provincia: '06', departamento: '06434', etiqueta: 'Lanús' });
  });
});

describe('Calles: texto', () => {
  it('embellece los nombres y agrega la categoría si falta', () => {
    expect(embellecerCalle('AV CABILDO')).toBe('Av. Cabildo');
    expect(embellecerCalle('9 DE JULIO')).toBe('9 de Julio');
    expect(embellecerCalle('CALLE 134 - 9 DE JULIO')).toBe('Calle 134 - 9 de Julio');
    expect(nombreVisible('JUJUY', 'AV')).toBe('Av. Jujuy');
    expect(nombreVisible('AV CORRIENTES', 'AV')).toBe('Av. Corrientes');
    expect(nombreVisible('LAVALLE', 'CALLE')).toBe('Lavalle');
  });

  it('normaliza y compara sin prefijo, tildes ni puntos', () => {
    expect(normalizarCalle('Hipólito Yrigoyen')).toBe('hipolito yrigoyen');
    expect(sinPrefijo('Av. Cabildo')).toBe('cabildo');
    const cabildo: CalleGeo = { nombre: 'Av. Cabildo', original: 'AV CABILDO', avenida: true, desde: 1, hasta: 5000 };
    expect(coincide('Cabildo', cabildo)).toBe(true);
    expect(coincide('av cabildo', cabildo)).toBe(true);
    expect(coincide('Cabildo Norte', cabildo)).toBe(false);
  });

  it('agrupa tramos de una misma calle, arma el rango y ordena', () => {
    const r = agruparCalles([
      { nombre: 'LAVALLE', categoria: 'CALLE', altura: alt(1802, 3300) },
      { nombre: 'AV CABILDO', categoria: 'AV', altura: alt(0, 1300) },
      { nombre: 'AV CABILDO', categoria: 'AV', altura: alt(1301, 5000) },
    ]);
    expect(r).toEqual([
      { nombre: 'Av. Cabildo', original: 'AV CABILDO', avenida: true, desde: 1, hasta: 5000 },
      { nombre: 'Lavalle', original: 'LAVALLE', avenida: false, desde: 1802, hasta: 3300 },
    ]);
  });
});

describe('Calles: filtrado local', () => {
  const catalogo = agruparCalles([
    { nombre: 'AV CORRIENTES', categoria: 'AV', altura: alt(1802, 3400) },
    { nombre: 'AV CALLAO', categoria: 'AV', altura: alt(2, 800) },
    { nombre: 'CORRIENTES', categoria: 'CALLE', altura: alt(1, 100) },
    { nombre: 'LAVALLE', categoria: 'CALLE', altura: alt(1802, 3300) },
    { nombre: 'JOSE EVARISTO URIBURU', categoria: 'CALLE', altura: alt(1, 900) },
  ]);

  it('sin texto muestra las avenidas, las más largas primero', () => {
    expect(filtrarCalles(catalogo, '').map((c) => c.nombre)).toEqual(['Av. Corrientes', 'Av. Callao']);
  });

  it('con texto prioriza los que empiezan igual y encuentra por palabra', () => {
    expect(filtrarCalles(catalogo, 'cor').map((c) => c.nombre)[0]).toContain('Corrientes');
    expect(filtrarCalles(catalogo, 'uriburu').map((c) => c.nombre)).toEqual(['Jose Evaristo Uriburu']);
    expect(filtrarCalles(catalogo, 'xyz')).toEqual([]);
  });
});

describe('CallesService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('descarga el catálogo completo de la comuna y lo guarda en caché', () => {
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(CallesService);
    let resultado: CalleGeo[] = [];
    service.catalogo('Balvanera').subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url.includes('/calles'));
    expect(req.request.params.get('departamento')).toBe('02021');
    expect(req.request.params.get('max')).toBe('5000');
    req.flush({ calles: [{ nombre: 'AV CORRIENTES', categoria: 'AV', altura: alt(1802, 3400) }], cantidad: 1, inicio: 0, total: 1 });
    expect(resultado.map((c) => c.nombre)).toEqual(['Av. Corrientes']);

    service.catalogo('Balvanera').subscribe();
    http.expectNone((r) => r.url.includes('/calles'));
  });

  it('pide las páginas siguientes cuando hay más calles que el máximo', () => {
    const http = TestBed.inject(HttpTestingController);
    let resultado: CalleGeo[] = [];
    TestBed.inject(CallesService).catalogo('Lanús').subscribe((r) => (resultado = r));

    http.expectOne((r) => r.params.get('inicio') === '0').flush({
      calles: [{ nombre: 'A', categoria: 'CALLE', altura: alt(1, 10) }], cantidad: 1, inicio: 0, total: 2,
    });
    http.expectOne((r) => r.params.get('inicio') === '1').flush({
      calles: [{ nombre: 'B', categoria: 'CALLE', altura: alt(1, 10) }], cantidad: 1, inicio: 1, total: 2,
    });
    expect(resultado.map((c) => c.nombre)).toEqual(['A', 'B']);
  });

  it('si falla no deja el error en caché', () => {
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(CallesService);
    let fallo = false;
    service.catalogo('Quilmes').subscribe({ error: () => (fallo = true) });
    http.expectOne((r) => r.url.includes('/calles')).error(new ProgressEvent('error'));
    expect(fallo).toBe(true);

    service.catalogo('Quilmes').subscribe();
    http.expectOne((r) => r.url.includes('/calles'));
  });
});
