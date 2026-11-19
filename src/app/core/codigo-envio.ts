/*
 * Código de un envío para el QR de la etiqueta.
 *
 * El QR no lleva datos personales: solo un enlace corto con un código no adivinable. Los datos del envío se consultan al escanear,
 * con sesión y permisos por rol. El número legible (LF-10001) sigue existiendo para que las personas busquen un envío.
 */

/** 31 símbolos: sin 0, O, 1, I ni L, para que nadie los confunda al leerlos o tipearlos. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LONGITUD_CODIGO = 8;

/** El mayor múltiplo de 31 que entra en un byte: descartar lo que sobra evita que unos símbolos salgan más que otros. */
const LIMITE_BYTE = 248;

export function generarCodigo(usados: ReadonlySet<string> = new Set()): string {
  for (let intento = 0; intento < 100; intento++) {
    let codigo = '';
    while (codigo.length < LONGITUD_CODIGO) {
      for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
        if (byte < LIMITE_BYTE && codigo.length < LONGITUD_CODIGO) codigo += ALFABETO[byte % ALFABETO.length];
      }
    }
    if (!usados.has(codigo)) return codigo;
  }
  throw new Error('No se pudo generar un código de envío único.');
}

export function esCodigoValido(codigo: string): boolean {
  return codigo.length === LONGITUD_CODIGO && [...codigo].every((c) => ALFABETO.includes(c));
}

/** Acepta mayúsculas o minúsculas, con o sin espacios y guiones ("k7q2-m9xa"). */
export function normalizarCodigo(texto: string): string | null {
  const limpio = texto.trim().toUpperCase().replace(/[\s-]/g, '');
  return esCodigoValido(limpio) ? limpio : null;
}

export function urlDelCodigo(codigo: string, origen: string = globalThis.location?.origin ?? ''): string {
  return `${origen}/e/${codigo}`;
}

export type LecturaEscaneo = { tipo: 'codigo'; valor: string } | { tipo: 'numero'; valor: string };

/**
 * Entiende lo que lee la cámara o lo que se escribe a mano: el enlace completo del QR, el código solo o el número LF-10001.
 * Devuelve null si no se parece a ninguno.
 */
export function interpretarEscaneo(texto: string): LecturaEscaneo | null {
  const t = (texto ?? '').trim();
  if (!t) return null;
  const enlace = t.match(/\/e\/([^/?#\s]+)/);
  const candidato = enlace ? decodeURIComponent(enlace[1]) : t;
  const numero = candidato.toUpperCase().replace(/\s/g, '').match(/^LF-?(\d{3,})$/);
  if (numero) return { tipo: 'numero', valor: `LF-${numero[1]}` };
  const codigo = normalizarCodigo(candidato);
  return codigo ? { tipo: 'codigo', valor: codigo } : null;
}
