import { CLAVE_DATOS, VERSION_ESQUEMA, cargarDB, guardarDB, normalizar } from './almacenamiento';
import { createSeed } from './seed';

const usuario = { id: 'u1', nombre: 'Marina Ríos', email: 'admin@flexya.com', rol: 'admin', estado: 'ACTIVO' };
const cliente = { id: 'c1', nombre: 'Taller Sur' };

const respaldos = () => Object.keys(localStorage).filter((k) => k.startsWith('flexya-respaldo-'));

describe('Almacenamiento de datos', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('sin datos guardados arranca vacío', () => {
    expect(cargarDB()).toEqual(createSeed());
    expect(localStorage.getItem(CLAVE_DATOS)).toBeNull();
  });

  it('guarda y vuelve a leer lo mismo, con la versión del esquema', () => {
    const db = { ...createSeed(), usuarios: [usuario], clientes: [cliente] } as never;
    guardarDB(db);
    expect(JSON.parse(localStorage.getItem(CLAVE_DATOS)!).version).toBe(VERSION_ESQUEMA);
    expect(cargarDB()).toEqual(db);
  });

  it('recupera los datos de las versiones anteriores en lugar de perderlos', () => {
    localStorage.setItem('flexya-demo-v9', JSON.stringify({ usuarios: [usuario], clientes: [cliente], tokens: [], correos: [] }));
    const db = cargarDB();
    expect(db.usuarios).toHaveLength(1);
    expect(db.clientes).toHaveLength(1);
    expect(db.productos).toEqual([]);
    expect(JSON.parse(localStorage.getItem(CLAVE_DATOS)!).db.clientes).toHaveLength(1);
    expect(localStorage.getItem('flexya-demo-v9')).not.toBeNull();
  });

  it('si hay varias versiones anteriores elige la que tiene más datos', () => {
    localStorage.setItem('flexya-demo-v10', JSON.stringify({ usuarios: [usuario] }));
    localStorage.setItem('flexya-demo-v9', JSON.stringify({ usuarios: [usuario], clientes: [cliente, { id: 'c2' }], envios: [{ id: 'LF-1' }] }));
    const db = cargarDB();
    expect(db.clientes).toHaveLength(2);
    expect(db.envios).toHaveLength(1);
  });

  it('una vez migrado ya no vuelve a mirar las versiones anteriores', () => {
    localStorage.setItem('flexya-demo-v9', JSON.stringify({ usuarios: [usuario] }));
    cargarDB();
    guardarDB({ ...createSeed(), usuarios: [usuario, { ...usuario, id: 'u2' }] } as never);
    expect(cargarDB().usuarios).toHaveLength(2);
  });

  it('completa colecciones y descarta lo que no es una lista', () => {
    const db = normalizar({ usuarios: [usuario], clientes: 'roto', envios: null, inventada: [1] });
    expect(db.usuarios).toHaveLength(1);
    expect(db.clientes).toEqual([]);
    expect(db.envios).toEqual([]);
    expect(db.productos).toEqual([]);
    expect(Object.keys(db)).not.toContain('inventada');
  });

  it('un esquema anterior se actualiza conservando los datos y deja un respaldo', () => {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify({ version: 0, db: { usuarios: [usuario], clientes: [cliente] } }));
    const db = cargarDB();
    expect(db.clientes).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(CLAVE_DATOS)!).version).toBe(VERSION_ESQUEMA);
    expect(respaldos()).toHaveLength(1);
  });

  it('migra los envíos de la versión 1 agregando productos, retiro y origen sin pisar lo que ya tienen', () => {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify({ version: 1, db: { envios: [{ id: 'LF-1' }, { id: 'LF-2', retiro: 'domicilio', items: [{ x: 1 }] }] } }));
    const db = cargarDB();
    expect(db.envios[0]).toMatchObject({ id: 'LF-1', items: [], retiro: 'deposito', origen: '' });
    expect(db.envios[1]).toMatchObject({ id: 'LF-2', retiro: 'domicilio', items: [{ x: 1 }] });
    expect(JSON.parse(localStorage.getItem(CLAVE_DATOS)!).version).toBe(VERSION_ESQUEMA);
    expect(respaldos()).toHaveLength(1);
  });

  it('los datos de las claves viejas también pasan por las migraciones', () => {
    localStorage.setItem('flexya-demo-v9', JSON.stringify({ usuarios: [usuario], envios: [{ id: 'LF-1' }] }));
    expect(cargarDB().envios[0]).toMatchObject({ id: 'LF-1', items: [], retiro: 'deposito' });
  });

  it('los datos corruptos no se pisan: se respaldan antes de empezar de nuevo', () => {
    localStorage.setItem(CLAVE_DATOS, '{esto no es json');
    expect(cargarDB()).toEqual(createSeed());
    expect(respaldos()).toHaveLength(1);
    expect(localStorage.getItem(respaldos()[0])).toBe('{esto no es json');
  });

  it('guarda como máximo tres respaldos', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(1_000_000 + i * 1000);
      localStorage.setItem(CLAVE_DATOS, `roto ${i}`);
      cargarDB();
    }
    vi.useRealTimers();
    expect(respaldos()).toHaveLength(3);
  });
});
