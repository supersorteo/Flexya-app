import { DB } from '../models';

export function createSeed(): DB {
  return {
    usuarios: [],
    tokens: [],
    correos: [],
    clientes: [],
    productos: [],
    movimientos: [],
    configOperacion: [],
    comisiones: [],
    liquidaciones: [],
    configPagos: [],
    mensajeros: [],
    envios: [],
    lotes: [],
    retiros: [],
    actividades: [],
  };
}
