export type FormatoEtiqueta = 'a6' | 'a4';

export const FORMATOS_ETIQUETA: { id: FormatoEtiqueta; nombre: string; detalle: string }[] = [
  { id: 'a6', nombre: 'Etiqueta 10 × 15 cm', detalle: 'Para impresora térmica de etiquetas: una por hoja.' },
  { id: 'a4', nombre: 'Hoja A4', detalle: 'Para impresora común: 4 etiquetas por hoja, para recortar.' },
];

/** El tamaño de la hoja lo fija esta regla; cambia según el formato y por eso se agrega recién al imprimir. */
const PAGINA: Record<FormatoEtiqueta, string> = {
  a6: '@page { size: 100mm 150mm; margin: 0; }',
  a4: '@page { size: A4; margin: 5mm; }',
};

/**
 * Imprime lo que haya en pantalla dentro de un modal de etiquetas: durante la impresión una clase en <html> oculta todo lo demás
 * (los estilos están en styles/pages/_etiqueta.scss) y al terminar deja la página como estaba.
 */
export function imprimirEtiquetas(formato: FormatoEtiqueta, doc: Document = document, ventana: Window = window): void {
  const estilo = doc.createElement('style');
  estilo.id = 'fx-pagina-impresion';
  estilo.textContent = PAGINA[formato];
  doc.head.appendChild(estilo);
  doc.documentElement.classList.add('fx-imprimiendo');

  const limpiar = () => {
    estilo.remove();
    doc.documentElement.classList.remove('fx-imprimiendo');
    ventana.removeEventListener('afterprint', limpiar);
  };
  ventana.addEventListener('afterprint', limpiar);
  try {
    ventana.print();
  } catch {
    limpiar();
  }
}
