import { DB } from '../models';
import { createSeed } from './seed';

// La clave nunca cambia: si el modelo de datos cambia se sube VERSION_ESQUEMA y se agrega una migración, así no se pierden los datos guardados.
export const CLAVE_DATOS = 'flexya-datos';
export const VERSION_ESQUEMA = 7;

const CLAVES_ANTERIORES = ['flexya-demo-v10', 'flexya-demo-v9'];
const PREFIJO_RESPALDO = 'flexya-respaldo-';
const MAX_RESPALDOS = 3;

type Migracion = (db: Record<string, unknown>) => Record<string, unknown>;
const MIGRACIONES: Record<number, Migracion> = {
  2: (db) => ({
    ...db,
    envios: (Array.isArray(db['envios']) ? (db['envios'] as Record<string, unknown>[]) : []).map((e) => ({ items: [], retiro: 'deposito', origen: '', ...e })),
  }),
  3: (db) => ({
    ...db,
    productos: (Array.isArray(db['productos']) ? (db['productos'] as Record<string, unknown>[]) : []).map((p) => ({ stock: 0, ...p })),
    movimientos: Array.isArray(db['movimientos']) ? db['movimientos'] : [],
  }),
  4: (db) => ({
    ...db,
    envios: (Array.isArray(db['envios']) ? (db['envios'] as Record<string, unknown>[]) : []).map((e) => {
      const creado = String(e['creadoEn'] ?? new Date().toISOString());
      const hitos: Record<string, unknown>[] = [{ estado: 'Pendiente', fecha: creado, detalle: 'Envío creado' }];
      if (e['estado'] && e['estado'] !== 'Pendiente') hitos.push({ estado: e['estado'], fecha: String(e['entregadoEn'] ?? creado), detalle: '' });
      return { historial: hitos, fechaRetiro: null, ...e };
    }),
  }),
  5: (db) => ({
    ...db,
    envios: (Array.isArray(db['envios']) ? (db['envios'] as Record<string, unknown>[]) : []).map((e) => ({ intentos: e['estado'] === 'Incidencia' ? 1 : 0, ...e })),
  }),
  6: (db) => ({
    ...db,
    envios: (Array.isArray(db['envios']) ? (db['envios'] as Record<string, unknown>[]) : []).map((e) => ({ retiroId: `R-${String(e['id'] ?? '').replace(/\D/g, '')}`, ...e })),
  }),
  7: (db) => ({
    ...db,
    envios: (Array.isArray(db['envios']) ? (db['envios'] as Record<string, unknown>[]) : []).map((e) => ({ retiroProgramado: false, franja: null, ...e })),
  }),
};

function migrar(db: Record<string, unknown>, desde: number): Record<string, unknown> {
  let actual = db;
  for (let n = desde + 1; n <= VERSION_ESQUEMA; n++) actual = MIGRACIONES[n]?.(actual) ?? actual;
  return actual;
}

export function normalizar(crudo: unknown): DB {
  const base = createSeed() as unknown as Record<string, unknown[]>;
  const origen = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const db: Record<string, unknown[]> = {};
  for (const coleccion of Object.keys(base)) db[coleccion] = Array.isArray(origen[coleccion]) ? (origen[coleccion] as unknown[]) : [];
  return db as unknown as DB;
}

function contenido(db: DB): number {
  return Object.values(db).reduce((total, lista) => total + lista.length, 0);
}

function respaldar(raw: string, etiqueta: string) {
  try {
    localStorage.setItem(`${PREFIJO_RESPALDO}${etiqueta}-${Date.now()}`, raw);
    const respaldos = Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO_RESPALDO)).sort();
    for (const vieja of respaldos.slice(0, Math.max(0, respaldos.length - MAX_RESPALDOS))) localStorage.removeItem(vieja);
  } catch {
    /* sin espacio o sin acceso: se sigue sin respaldo */
  }
}

export function guardarDB(db: DB) {
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify({ version: VERSION_ESQUEMA, db }));
  } catch {
    console.warn('[Flexya] No se pudo guardar en localStorage');
  }
}

function importarAnterior(): DB | null {
  const candidatos = CLAVES_ANTERIORES.flatMap((clave) => {
    try {
      const raw = localStorage.getItem(clave);
      return raw ? [normalizar(migrar(JSON.parse(raw) as Record<string, unknown>, 0))] : [];
    } catch {
      return [];
    }
  }).filter((db) => contenido(db) > 0);
  if (!candidatos.length) return null;
  const elegido = candidatos.reduce((mejor, db) => (contenido(db) > contenido(mejor) ? db : mejor));
  guardarDB(elegido);
  return elegido;
}

export function cargarDB(): DB {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CLAVE_DATOS);
  } catch {
    return createSeed();
  }
  if (!raw) return importarAnterior() ?? createSeed();

  try {
    const guardado = JSON.parse(raw) as { version?: number; db?: unknown };
    const version = guardado.version ?? 0;
    let db = (guardado.db ?? {}) as Record<string, unknown>;
    if (version < VERSION_ESQUEMA) {
      respaldar(raw, `v${version}`);
      db = migrar(db, version);
    }
    const normal = normalizar(db);
    if (version !== VERSION_ESQUEMA) guardarDB(normal);
    return normal;
  } catch {
    respaldar(raw, 'corrupto');
    return createSeed();
  }
}
