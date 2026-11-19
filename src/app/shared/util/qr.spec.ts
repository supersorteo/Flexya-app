import { generarQr, MARGEN_QR } from './qr';

describe('QR de un enlace', () => {
  it('devuelve un dibujo cuadrado con su margen blanco', async () => {
    const qr = await generarQr('https://flexya.vercel.app/e/K7Q2M9XA');
    expect(Number.isInteger(qr.tamano)).toBe(true);
    expect(qr.tamano).toBeGreaterThan(MARGEN_QR * 2 + 20);
    expect(qr.ruta.startsWith('M')).toBe(true);
  });

  it('los cuadritos oscuros caen dentro del margen y nunca lo invaden', async () => {
    const qr = await generarQr('https://flexya.vercel.app/e/K7Q2M9XA');
    const tramos = [...qr.ruta.matchAll(/M(\d+) (\d+)h(\d+)v1/g)].map((m) => ({ x: +m[1], y: +m[2], largo: +m[3] }));
    expect(tramos.length).toBeGreaterThan(50);
    for (const t of tramos) {
      expect(t.x).toBeGreaterThanOrEqual(MARGEN_QR);
      expect(t.x + t.largo).toBeLessThanOrEqual(qr.tamano - MARGEN_QR);
      expect(t.y).toBeGreaterThanOrEqual(MARGEN_QR);
      expect(t.y).toBeLessThan(qr.tamano - MARGEN_QR);
    }
  });

  it('el mismo enlace da siempre el mismo dibujo y otro enlace da otro', async () => {
    const a = await generarQr('https://flexya.vercel.app/e/K7Q2M9XA');
    const b = await generarQr('https://flexya.vercel.app/e/K7Q2M9XA');
    const c = await generarQr('https://flexya.vercel.app/e/ZZZZZZZZ');
    expect(a.ruta).toBe(b.ruta);
    expect(a.ruta).not.toBe(c.ruta);
  });

  it('los tres cuadros de las esquinas (marcas de ubicación) están donde el estándar los pone', async () => {
    const qr = await generarQr('LF-10001');
    const lado = qr.tamano - MARGEN_QR * 2;
    const filaSuperior = qr.ruta.match(new RegExp(`M${MARGEN_QR} ${MARGEN_QR}h(\\d+)`));
    expect(filaSuperior).not.toBeNull();
    expect(+filaSuperior![1]).toBe(7);
    expect(qr.ruta).toContain(`M${MARGEN_QR + lado - 7} ${MARGEN_QR}h7`);
    expect(qr.ruta).toContain(`M${MARGEN_QR} ${MARGEN_QR + lado - 7}h7`);
  });
});
