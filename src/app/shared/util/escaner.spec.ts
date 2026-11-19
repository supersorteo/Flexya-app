import { crearDetector, ErrorCamara, iniciarEscaneo, RUTA_WASM } from './escaner';

function camaraFalsa(opciones: { torch?: boolean } = {}) {
  const pista = {
    stop: vi.fn(),
    getCapabilities: () => (opciones.torch ? { torch: true } : {}),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
  const flujo = { getTracks: () => [pista], getVideoTracks: () => [pista] } as unknown as MediaStream;
  return { pista, flujo };
}

function videoFalso() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4 });
  video.play = vi.fn().mockResolvedValue(undefined);
  return video;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Escáner de QR con la cámara', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function conCamara(flujo: MediaStream | Error) {
    const getUserMedia = vi.fn(() => (flujo instanceof Error ? Promise.reject(flujo) : Promise.resolve(flujo)));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    return getUserMedia;
  }

  describe('abrir la cámara', () => {
    it('pide la cámara trasera y devuelve una sesión que se puede detener', async () => {
      const { flujo, pista } = camaraFalsa();
      const getUserMedia = conCamara(flujo);
      const sesion = await iniciarEscaneo(videoFalso(), vi.fn(), async () => null);
      expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }), audio: false }));
      sesion.detener();
      expect(pista.stop).toHaveBeenCalled();
    });

    it('si el navegador no tiene cámara disponible avisa que no es compatible', async () => {
      vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
      await expect(iniciarEscaneo(videoFalso(), vi.fn(), async () => null)).rejects.toMatchObject({ motivo: 'no-soportada' });
    });

    it('distingue permiso denegado, sin cámara y otros errores', async () => {
      const casos: [string, string][] = [['NotAllowedError', 'permiso'], ['SecurityError', 'permiso'], ['NotFoundError', 'sin-camara'], ['AbortError', 'otro']];
      for (const [nombre, motivo] of casos) {
        const error = new Error('x');
        error.name = nombre;
        conCamara(error);
        const intento = iniciarEscaneo(videoFalso(), vi.fn(), async () => null);
        await expect(intento).rejects.toBeInstanceOf(ErrorCamara);
        await expect(intento).rejects.toMatchObject({ motivo });
      }
    });

    it('si falla la reproducción o el lector, apaga la cámara en vez de dejarla prendida', async () => {
      const { flujo, pista } = camaraFalsa();
      conCamara(flujo);
      const video = videoFalso();
      video.play = vi.fn().mockRejectedValue(new Error('no se puede reproducir'));
      await expect(iniciarEscaneo(video, vi.fn(), async () => null)).rejects.toBeInstanceOf(ErrorCamara);
      expect(pista.stop).toHaveBeenCalled();
    });
  });

  describe('leer los códigos', () => {
    it('entrega cada código leído y no repite el mismo mientras la cámara lo sigue viendo', async () => {
      const { flujo } = camaraFalsa();
      conCamara(flujo);
      const leidos: string[] = [];
      const lecturas = ['A', 'A', 'A', null, 'B'];
      const detector = vi.fn(async () => lecturas.shift() ?? null);
      const sesion = await iniciarEscaneo(videoFalso(), (t) => leidos.push(t), detector);
      await esperar(900);
      sesion.detener();
      expect(leidos).toEqual(['A', 'B']);
    });

    it('un cuadro que no se puede leer no frena el escaneo', async () => {
      const { flujo } = camaraFalsa();
      conCamara(flujo);
      const leidos: string[] = [];
      let n = 0;
      const detector = vi.fn(async () => {
        if (++n === 1) throw new Error('cuadro borroso');
        return 'OK';
      });
      const sesion = await iniciarEscaneo(videoFalso(), (t) => leidos.push(t), detector);
      await esperar(500);
      sesion.detener();
      expect(leidos).toEqual(['OK']);
    });

    it('al detener ya no entrega nada más', async () => {
      const { flujo } = camaraFalsa();
      conCamara(flujo);
      const leidos: string[] = [];
      const detector = vi.fn(async () => `X${leidos.length}`);
      const sesion = await iniciarEscaneo(videoFalso(), (t) => leidos.push(t), detector);
      sesion.detener();
      const cantidad = leidos.length;
      await esperar(400);
      expect(leidos.length).toBe(cantidad);
    });
  });

  describe('la linterna', () => {
    it('solo se ofrece si la cámara la tiene y se enciende y apaga', async () => {
      const con = camaraFalsa({ torch: true });
      conCamara(con.flujo);
      const sesion = await iniciarEscaneo(videoFalso(), vi.fn(), async () => null);
      expect(sesion.linterna.disponible).toBe(true);
      expect(await sesion.linterna.alternar()).toBe(true);
      expect(con.pista.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
      expect(await sesion.linterna.alternar()).toBe(false);
      sesion.detener();

      const sin = camaraFalsa();
      conCamara(sin.flujo);
      const otra = await iniciarEscaneo(videoFalso(), vi.fn(), async () => null);
      expect(otra.linterna.disponible).toBe(false);
      otra.detener();
    });
  });

  describe('el lector de QR', () => {
    it('usa el del navegador cuando existe y soporta QR', async () => {
      const detect = vi.fn().mockResolvedValue([{ rawValue: 'https://flexya.vercel.app/e/K7Q2M9XA' }]);
      class Falso {
        static getSupportedFormats = vi.fn().mockResolvedValue(['qr_code', 'code_128']);
        detect = detect;
      }
      vi.stubGlobal('BarcodeDetector', Falso);
      const leer = await crearDetector();
      expect(await leer(document.createElement('video'))).toBe('https://flexya.vercel.app/e/K7Q2M9XA');
    });

    it('si no ve ningún código devuelve null', async () => {
      class Falso {
        static getSupportedFormats = vi.fn().mockResolvedValue(['qr_code']);
        detect = vi.fn().mockResolvedValue([]);
      }
      vi.stubGlobal('BarcodeDetector', Falso);
      expect(await (await crearDetector())(document.createElement('video'))).toBeNull();
    });

    it('si no existe el del navegador (iPhone) usa la librería de respaldo, cargada recién entonces', async () => {
      vi.stubGlobal('BarcodeDetector', undefined);
      const leer = await crearDetector();
      expect(typeof leer).toBe('function');
    });

    it('el archivo .wasm del respaldo se sirve desde la propia app', () => {
      expect(RUTA_WASM).toBe('/zxing/zxing_reader.wasm');
    });
  });
});
