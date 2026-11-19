/**
 * Después de iniciar sesión se vuelve a donde la persona quería ir (por ejemplo, al paquete que acaba de escanear).
 * Solo se acepta una ruta interna de la app: nunca otra dirección, para que un enlace armado no pueda mandar a nadie a otro sitio.
 */
export function rutaSegura(destino: string | null | undefined): string | null {
  if (!destino || typeof destino !== 'string') return null;
  const d = destino.trim();
  if (!d.startsWith('/') || d.startsWith('//') || d.startsWith('/\\') || /^\/[a-z][a-z0-9+.-]*:/i.test(d) || d.includes('\\')) return null;
  if (/[\u0000-\u001f]/.test(d)) return null;
  const ruta = d.split(/[?#]/)[0];
  if (['/login', '/configuracion-inicial', '/olvide'].includes(ruta) || ruta.startsWith('/activar/') || ruta.startsWith('/restablecer/')) return null;
  return d;
}
