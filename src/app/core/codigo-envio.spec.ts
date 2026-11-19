import { esCodigoValido, generarCodigo, interpretarEscaneo, LONGITUD_CODIGO, normalizarCodigo, urlDelCodigo } from './codigo-envio';

describe('Código de envío para el QR', () => {
  it('genera códigos de 8 caracteres sin símbolos que se confunden (0, O, 1, I, L)', () => {
    for (let i = 0; i < 300; i++) {
      const c = generarCodigo();
      expect(c).toHaveLength(LONGITUD_CODIGO);
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
      expect(esCodigoValido(c)).toBe(true);
    }
  });

  it('no repite códigos ya usados', () => {
    const usados = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = generarCodigo(usados);
      expect(usados.has(c)).toBe(false);
      usados.add(c);
    }
  });

  it('usa todo el alfabeto de forma pareja (sin sesgo evidente)', () => {
    const veces = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const ch of generarCodigo()) veces.set(ch, (veces.get(ch) ?? 0) + 1);
    expect(veces.size).toBe(31);
    const cantidades = [...veces.values()];
    expect(Math.max(...cantidades) / Math.min(...cantidades)).toBeLessThan(1.4);
  });

  it('normaliza lo que se escribe a mano: minúsculas, espacios y guiones', () => {
    expect(normalizarCodigo(' k7q2-m9xa ')).toBe('K7Q2M9XA');
    expect(normalizarCodigo('K7Q2M9X')).toBeNull();
    expect(normalizarCodigo('K7Q2M9X0')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
  });

  it('arma el enlace del QR con el origen de la app', () => {
    expect(urlDelCodigo('K7Q2M9XA', 'https://flexya.vercel.app')).toBe('https://flexya.vercel.app/e/K7Q2M9XA');
  });

  describe('interpretar lo que se escanea o se tipea', () => {
    it('el enlace completo del QR', () => {
      expect(interpretarEscaneo('https://flexya.vercel.app/e/K7Q2M9XA')).toEqual({ tipo: 'codigo', valor: 'K7Q2M9XA' });
      expect(interpretarEscaneo('http://localhost:4200/e/k7q2m9xa/')).toEqual({ tipo: 'codigo', valor: 'K7Q2M9XA' });
      expect(interpretarEscaneo('https://x.com/e/K7Q2M9XA?origen=qr#a')).toEqual({ tipo: 'codigo', valor: 'K7Q2M9XA' });
    });

    it('el código solo, con o sin guión', () => {
      expect(interpretarEscaneo('K7Q2M9XA')).toEqual({ tipo: 'codigo', valor: 'K7Q2M9XA' });
      expect(interpretarEscaneo('k7q2 m9xa')).toEqual({ tipo: 'codigo', valor: 'K7Q2M9XA' });
    });

    it('el número de envío LF-10001, también sin guión o en minúsculas', () => {
      expect(interpretarEscaneo('LF-10001')).toEqual({ tipo: 'numero', valor: 'LF-10001' });
      expect(interpretarEscaneo('lf10001')).toEqual({ tipo: 'numero', valor: 'LF-10001' });
      expect(interpretarEscaneo('https://x.com/e/LF-10001')).toEqual({ tipo: 'numero', valor: 'LF-10001' });
    });

    it('rechaza lo que no se parece a un envío', () => {
      for (const t of ['', '   ', 'hola', 'https://google.com', '12345', 'LF-', 'K7Q2M9']) expect(interpretarEscaneo(t)).toBeNull();
    });
  });
});
