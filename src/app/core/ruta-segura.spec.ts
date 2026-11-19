import { rutaSegura } from './ruta-segura';

describe('Ruta a la que se vuelve después de iniciar sesión', () => {
  it('acepta rutas internas de la app', () => {
    expect(rutaSegura('/e/K7Q2M9XA')).toBe('/e/K7Q2M9XA');
    expect(rutaSegura('/admin/envios?x=1')).toBe('/admin/envios?x=1');
    expect(rutaSegura('/mensajero/envios/LF-10001')).toBe('/mensajero/envios/LF-10001');
  });

  it('rechaza otras direcciones, aunque estén disfrazadas', () => {
    for (const malo of ['https://malo.com', 'http://malo.com/e/x', '//malo.com', '/\\malo.com', '\\\\malo.com', 'javascript:alert(1)', '/javascript:alert(1)', 'e/K7Q2M9XA', '', '   ', '/e/\nx']) {
      expect(rutaSegura(malo)).toBeNull();
    }
  });

  it('no vuelve a las pantallas de acceso para no quedar en un bucle', () => {
    for (const p of ['/login', '/login?volver=/e/x', '/configuracion-inicial', '/olvide', '/activar/abc', '/restablecer/abc']) expect(rutaSegura(p)).toBeNull();
  });

  it('con nada o con un valor raro devuelve null', () => {
    expect(rutaSegura(null)).toBeNull();
    expect(rutaSegura(undefined)).toBeNull();
    expect(rutaSegura(123 as unknown as string)).toBeNull();
  });
});
