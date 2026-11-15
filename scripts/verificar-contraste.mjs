// Verifica el contraste (WCAG AA) de los pares de color del sistema de diseño, en claro y en oscuro.
// Uso: node scripts/verificar-contraste.mjs
import { readFileSync } from 'node:fs';

const fuente = readFileSync(new URL('../src/styles/_tokens.scss', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

function bloque(inicio) {
  const i = fuente.indexOf(inicio);
  if (i < 0) throw new Error(`No se encontró el bloque ${inicio}`);
  let profundidad = 0;
  for (let j = fuente.indexOf('{', i); j < fuente.length; j++) {
    if (fuente[j] === '{') profundidad++;
    if (fuente[j] === '}' && --profundidad === 0) return fuente.slice(i, j);
  }
  throw new Error(`Bloque ${inicio} sin cerrar`);
}

function variables(texto) {
  const mapa = {};
  for (const [, nombre, valor] of texto.matchAll(/--fx-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) mapa[nombre] = valor.toLowerCase();
  return mapa;
}

const claro = variables(bloque(":root,\n[data-bs-theme='light'] {"));
const oscuro = { ...claro, ...variables(bloque("[data-bs-theme='dark'] {")) };

const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [texto, fondo, mínimo, descripción]
const PARES = [
  ['text', 'bg', 4.5, 'Texto principal sobre el fondo'],
  ['text', 'surface', 4.5, 'Texto principal sobre paneles'],
  ['text', 'surface-3', 4.5, 'Texto sobre rellenos suaves'],
  ['text-soft', 'bg', 4.5, 'Texto suave sobre el fondo'],
  ['text-soft', 'surface', 4.5, 'Texto suave sobre paneles'],
  ['text-soft', 'surface-2', 4.5, 'Texto suave sobre cabeceras de tabla'],
  ['placeholder', 'surface', 4.5, 'Placeholder de los campos'],
  ['primary', 'surface', 4.5, 'Enlaces y estados activos sobre paneles'],
  ['primary', 'primary-soft', 4.5, 'Texto azul sobre fondo azul suave'],
  ['on-solid', 'primary', 4.5, 'Texto sobre un relleno azul'],
  ['on-solid', 'success-strong', 4.5, 'Texto sobre un relleno verde'],
  ['on-solid', 'danger', 4.5, 'Texto sobre un relleno rojo'],
  ['on-solid', 'violet', 4.5, 'Texto sobre un relleno violeta'],
  ['on-accent', 'accent', 4.5, 'Texto del botón de acción (naranja)'],
  ['on-accent', 'accent-hover', 4.5, 'Texto del botón de acción al pasar el cursor'],
  ['accent-text', 'surface', 4.5, 'Texto naranja sobre paneles'],
  ['accent-text', 'accent-soft', 4.5, 'Texto naranja sobre naranja suave'],
  ['on-brand', 'brand', 4.5, 'Texto sobre la barra lateral'],
  ['on-brand-soft', 'brand', 4.5, 'Texto suave sobre la barra lateral'],
  ['on-brand-accent', 'brand', 3, 'Indicador activo sobre la barra lateral'],
  ['success-text', 'success-soft', 4.5, 'Texto de éxito sobre su fondo'],
  ['warning-text', 'warning-soft', 4.5, 'Texto de atención sobre su fondo'],
  ['danger-text', 'danger-soft', 4.5, 'Texto de error sobre su fondo'],
  ['violet-text', 'violet-soft', 4.5, 'Texto violeta sobre su fondo'],
  ['success-text', 'surface', 4.5, 'Texto de éxito sobre paneles'],
  ['danger-text', 'surface', 4.5, 'Texto de error sobre paneles'],
  ['input-border', 'surface', 3, 'Borde de los campos (componente de interfaz)'],
  ['border-strong', 'surface', 1.5, 'Borde decorativo'],
  ['primary-ink', 'primary-soft', 4.5, 'Texto de botón azul suave'],
  ['text', 'field-bg', 4.5, 'Texto dentro de los campos'],
  ['text', 'th-bg', 4.5, 'Cabecera de tabla'],
  ['text', 'row-alt', 4.5, 'Fila alterna de tabla'],
  ['input-border', 'field-bg', 3, 'Borde del campo sobre su relleno'],
];

const ESTADOS = ["borrador","pendiente","retiro-asignado","retirado","retiro-fallido","en-deposito","en-revision","en-reparto","incidencia","en-devolucion","devuelto","entregado","cancelado"];
for (const e of ESTADOS) PARES.push([`st-${e}-fg`, `st-${e}-bg`, 4.5, `Estado de envío: ${e}`]);

let fallos = 0;
for (const [tema, tokens] of [['CLARO', claro], ['OSCURO', oscuro]]) {
  console.log(`\n${tema}`);
  for (const [t, f, minimo, descripcion] of PARES) {
    if (!tokens[t] || !tokens[f]) {
      console.log(`  ?    ${descripcion} (falta --fx-${!tokens[t] ? t : f})`);
      fallos++;
      continue;
    }
    const r = ratio(tokens[t], tokens[f]);
    const ok = r >= minimo;
    if (!ok) fallos++;
    console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${r.toFixed(2).padStart(5)}:1  (mín ${minimo})  ${descripcion}  [${tokens[t]} sobre ${tokens[f]}]`);
  }
}
console.log(fallos ? `\n${fallos} par(es) no cumplen.` : '\nTodos los pares cumplen.');
process.exit(fallos ? 1 : 0);
