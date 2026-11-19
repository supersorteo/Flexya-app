/** Lo que puede salir mal al abrir la cámara, traducido a algo que se le pueda explicar a la persona. */
export type MotivoErrorCamara = 'permiso' | 'sin-camara' | 'no-soportada' | 'otro';

export class ErrorCamara extends Error {
  constructor(readonly motivo: MotivoErrorCamara) {
    super(motivo);
  }
}

export interface SesionEscaneo {
  detener(): void;
  linterna: { disponible: boolean; alternar(): Promise<boolean> };
}

export type Detector = (fuente: HTMLVideoElement) => Promise<string | null>;

/** Dónde se sirve el archivo .wasm del lector de respaldo (se copia a la app al compilar, ver angular.json). */
export const RUTA_WASM = '/zxing/zxing_reader.wasm';

/**
 * Un lector de QR. Chrome en Android y varios escritorios lo traen incluido (BarcodeDetector); el iPhone no, y ahí se usa
 * una librería de respaldo que se descarga recién cuando hace falta, junto con su archivo .wasm servido desde la propia app.
 */
export async function crearDetector(): Promise<Detector> {
  const nativo = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(f: unknown): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (nativo) {
    try {
      const formatos = await (nativo as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats?.();
      if (!formatos || formatos.includes('qr_code')) {
        const detector = new nativo({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      /* el lector nativo falló: se pasa al de respaldo */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({ overrides: { locateFile: (ruta: string, prefijo: string) => (ruta.endsWith('.wasm') ? RUTA_WASM : prefijo + ruta) } });
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
}

function motivoDe(error: unknown): MotivoErrorCamara {
  const nombre = (error as { name?: string } | null)?.name;
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError' || nombre === 'PermissionDeniedError') return 'permiso';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError' || nombre === 'DevicesNotFoundError') return 'sin-camara';
  return 'otro';
}

/** Evita leer diez veces seguidas el mismo QR mientras la cámara lo sigue viendo. */
const ESPERA_MISMO_CODIGO_MS = 2500;
const INTERVALO_MS = 150;

export async function iniciarEscaneo(video: HTMLVideoElement, alLeer: (texto: string) => void, detector?: Detector): Promise<SesionEscaneo> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ErrorCamara('no-soportada');

  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (error) {
    throw new ErrorCamara(motivoDe(error));
  }

  const apagar = () => {
    flujo.getTracks().forEach((pista) => pista.stop());
    video.srcObject = null;
  };

  let leer: Detector;
  try {
    video.muted = true;
    video.setAttribute('playsinline', 'true');
    video.srcObject = flujo;
    await video.play();
    leer = detector ?? (await crearDetector());
  } catch (error) {
    apagar();
    throw new ErrorCamara(error instanceof ErrorCamara ? error.motivo : 'otro');
  }

  let activo = true;
  let ultimo = '';
  let ultimaHora = 0;
  void (async () => {
    while (activo) {
      try {
        if (video.readyState >= 2) {
          const texto = await leer(video);
          if (texto && activo && (texto !== ultimo || Date.now() - ultimaHora > ESPERA_MISMO_CODIGO_MS)) {
            ultimo = texto;
            ultimaHora = Date.now();
            alLeer(texto);
          }
        }
      } catch {
        /* un cuadro que no se pudo leer no frena el escaneo */
      }
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }
  })();

  const pista = flujo.getVideoTracks()[0];
  const capacidades = (pista?.getCapabilities?.() ?? {}) as { torch?: boolean };
  let encendida = false;
  return {
    detener() {
      activo = false;
      apagar();
    },
    linterna: {
      disponible: !!capacidades.torch,
      async alternar() {
        encendida = !encendida;
        await pista.applyConstraints({ advanced: [{ torch: encendida } as MediaTrackConstraintSet] });
        return encendida;
      },
    },
  };
}
