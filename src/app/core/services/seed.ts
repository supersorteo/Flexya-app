import { DB } from '../models';

export function createSeed(): DB {
  return {
    usuarios: [{ id: 'u1', nombre: 'Superadministrador', email: 'admin@flexya.com', password: '123456', rol: 'admin' }],
    clientes: [],
    mensajeros: [],
    envios: [],
    lotes: [],
    retiros: [],
    actividades: [],
  };
}
