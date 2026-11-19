/** Un QR como dibujo vectorial: `tamano` módulos de lado y `ruta` con todos los cuadritos oscuros, listo para un <path>. */
export interface QrDibujo {
  tamano: number;
  ruta: string;
}

/** Margen blanco alrededor, en módulos. El estándar pide 4 para que cualquier lector lo encuentre. */
export const MARGEN_QR = 4;

/**
 * Genera el QR de un texto. La librería se descarga recién cuando hace falta (no pesa en el arranque de la app) y el dibujo se arma
 * acá mismo: así no depende de imágenes ni de cómo cada navegador interpreta un SVG ajeno.
 */
export async function generarQr(texto: string): Promise<QrDibujo> {
  const biblioteca = await import('qrcode');
  const crear = biblioteca.create ?? (biblioteca as unknown as { default: typeof biblioteca }).default.create;
  const qr = crear(texto, { errorCorrectionLevel: 'M' });
  const tamano = qr.modules.size;
  const oscuros = qr.modules.data;

  const tramos: string[] = [];
  for (let fila = 0; fila < tamano; fila++) {
    let columna = 0;
    while (columna < tamano) {
      if (!oscuros[fila * tamano + columna]) {
        columna++;
        continue;
      }
      const inicio = columna;
      while (columna < tamano && oscuros[fila * tamano + columna]) columna++;
      tramos.push(`M${inicio + MARGEN_QR} ${fila + MARGEN_QR}h${columna - inicio}v1h-${columna - inicio}z`);
    }
  }
  return { tamano: tamano + MARGEN_QR * 2, ruta: tramos.join('') };
}
