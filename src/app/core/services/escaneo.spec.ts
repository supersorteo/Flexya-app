import { TestBed } from '@angular/core/testing';
import { ClienteInput, MensajeroInput, Usuario } from '../models';
import { esCodigoValido } from '../codigo-envio';
import { CLAVE_DATOS, VERSION_ESQUEMA, cargarDB } from './almacenamiento';
import { DataService } from './data.service';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero = (n: string, email: string): MensajeroInput => ({
  nombre: n, tipoDocumento: 'DNI', numeroDocumento: String(28000000 + n.length), telefono: '+54 9 11 5555 3000', telefonoEmergencia: '', email, zonaId: 'caba-norte',
});
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

describe('Código y escaneo de un envío', () => {
  let data: DataService;
  let clienteId: string;
  let ajeno: Usuario;
  let dueño: Usuario;
  let admin: Usuario;
  let santiago: { id: string; usuario: Usuario };
  let micaela: { id: string; usuario: Usuario };

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
    const s = data.agregarMensajero(mensajero('Santiago Pereyra', 's@flexya.com'));
    const m = data.agregarMensajero(mensajero('Micaela Roldán', 'm@flexya.com'));
    santiago = { id: s.mensajero.id, usuario: { ...s.usuario, mensajeroId: s.mensajero.id } as Usuario };
    micaela = { id: m.mensajero.id, usuario: { ...m.usuario, mensajeroId: m.mensajero.id } as Usuario };
    admin = { id: 'u1', nombre: 'Marina', rol: 'admin' } as Usuario;
    dueño = { id: 'u2', nombre: 'Taller Sur', rol: 'cliente', clienteId } as Usuario;
    ajeno = { id: 'u3', nombre: 'Otro', rol: 'cliente', clienteId: 'c999' } as Usuario;
  });

  const nuevo = () => data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);

  describe('el código', () => {
    it('cada envío nuevo recibe un código válido y distinto', () => {
      const codigos = [nuevo(), nuevo(), nuevo()].map((e) => e.codigo);
      expect(codigos.every(esCodigoValido)).toBe(true);
      expect(new Set(codigos).size).toBe(3);
    });

    it('los envíos de un mismo retiro tienen un código cada uno', () => {
      const envios = data.crearRetiro({ retiro: 'domicilio', destinos: [{ ...destino, items: [] }, { ...destino, destinatario: 'Bruno', items: [] }] }, clienteId);
      expect(envios).toHaveLength(2);
      expect(envios[0].retiroId).toBe(envios[1].retiroId);
      expect(envios[0].codigo).not.toBe(envios[1].codigo);
    });

    it('el código no se parece al número del envío (no se puede adivinar)', () => {
      const e = nuevo();
      expect(e.codigo).not.toContain('10001');
      expect(e.codigo).not.toBe(e.id);
    });
  });

  describe('la migración de los datos guardados', () => {
    it('a los envíos que no tenían código se les asigna uno distinto', () => {
      const viejo = (id: string) => ({ id, clienteId: 'c1', estado: 'Pendiente', creadoEn: '2026-11-14T10:00:00.000Z', items: [], historial: [], retiroId: `R-${id}` });
      localStorage.setItem(CLAVE_DATOS, JSON.stringify({ version: 7, db: { envios: [viejo('LF-10001'), viejo('LF-10002')] } }));
      const db = cargarDB();
      expect(db.envios.map((e) => e.codigo).every(esCodigoValido)).toBe(true);
      expect(db.envios[0].codigo).not.toBe(db.envios[1].codigo);
      expect(JSON.parse(localStorage.getItem(CLAVE_DATOS)!).version).toBe(VERSION_ESQUEMA);
    });

    it('conserva el código que un envío ya tenía', () => {
      localStorage.setItem(CLAVE_DATOS, JSON.stringify({ version: 7, db: { envios: [{ id: 'LF-10001', codigo: 'K7Q2M9XA', items: [], historial: [] }] } }));
      expect(cargarDB().envios[0].codigo).toBe('K7Q2M9XA');
    });
  });

  describe('buscar lo que se escanea, según quién escanea', () => {
    it('el dueño, el superadmin y el mensajero asignado lo encuentran; los demás no', () => {
      const e = nuevo();
      data.recepcionar(e.id);
      data.asignar(e.id, santiago.id);
      const url = `https://flexya.vercel.app/e/${e.codigo}`;
      expect(data.envioEscaneado(dueño, url)?.id).toBe(e.id);
      expect(data.envioEscaneado(admin, url)?.id).toBe(e.id);
      expect(data.envioEscaneado(santiago.usuario, url)?.id).toBe(e.id);
      expect(data.envioEscaneado(micaela.usuario, url)).toBeNull();
      expect(data.envioEscaneado(ajeno, url)).toBeNull();
      expect(data.envioEscaneado(null, url)).toBeNull();
    });

    it('también encuentra por el código solo o por el número LF-…', () => {
      const e = nuevo();
      expect(data.envioEscaneado(admin, e.codigo.toLowerCase())?.id).toBe(e.id);
      expect(data.envioEscaneado(admin, e.id)?.id).toBe(e.id);
    });

    it('un código que no existe o un texto cualquiera no devuelve nada', () => {
      nuevo();
      expect(data.envioEscaneado(admin, 'ZZZZZZZZ')).toBeNull();
      expect(data.envioEscaneado(admin, 'hola')).toBeNull();
    });

    it('un borrador no lo ve el superadmin', () => {
      const [b] = data.crearRetiro({ retiro: 'domicilio', borrador: true, destinos: [{ ...destino, items: [] }] }, clienteId);
      expect(data.envioEscaneado(admin, b.codigo)).toBeNull();
      expect(data.envioEscaneado(dueño, b.codigo)?.id).toBe(b.id);
    });
  });

  describe('el historial de escaneos', () => {
    it('guarda quién escaneó y con qué resultado, también los rechazos', () => {
      const e = nuevo();
      data.registrarEscaneo(e.codigo, admin, 'ok', 'Consulta');
      data.registrarEscaneo(e.codigo, micaela.usuario, 'rechazado', 'No le corresponde');
      const guardado = data.envios().find((x) => x.id === e.id)!;
      expect(guardado.escaneos).toHaveLength(2);
      expect(guardado.escaneos![0]).toMatchObject({ usuarioId: 'u1', rol: 'admin', resultado: 'ok', accion: 'Consulta' });
      expect(guardado.escaneos![1]).toMatchObject({ rol: 'mensajero', resultado: 'rechazado' });
    });

    it('lo que no es un envío no deja registro y guarda a lo sumo los últimos 50', () => {
      const e = nuevo();
      data.registrarEscaneo('ZZZZZZZZ', admin, 'rechazado', 'x');
      expect(data.envios()[0].escaneos).toBeUndefined();
      for (let i = 0; i < 60; i++) data.registrarEscaneo(e.codigo, admin, 'ok', `n${i}`);
      expect(data.envios().find((x) => x.id === e.id)!.escaneos).toHaveLength(50);
    });
  });

  describe('entregar y reportar incidencia ya no aceptan cualquier cosa', () => {
    const enReparto = () => {
      const e = nuevo();
      data.recepcionar(e.id);
      data.asignar(e.id, santiago.id);
      return e;
    };

    it('solo se entrega lo que está en reparto', () => {
      const e = nuevo();
      expect(data.entregar(e.id, 'Ana')).toBe(false);
      expect(data.envios().find((x) => x.id === e.id)!.estado).toBe('Pendiente');
      const r = enReparto();
      expect(data.entregar(r.id, 'Ana')).toBe(true);
      expect(data.envios().find((x) => x.id === r.id)!.estado).toBe('Entregado');
    });

    it('un mensajero solo entrega lo suyo y un cliente no entrega nada', () => {
      const e = enReparto();
      expect(data.entregar(e.id, '', micaela.usuario)).toBe(false);
      expect(data.entregar(e.id, '', dueño)).toBe(false);
      expect(data.envios().find((x) => x.id === e.id)!.estado).toBe('En reparto');
      expect(data.entregar(e.id, '', santiago.usuario)).toBe(true);
    });

    it('no se entrega dos veces ni se duplica la comisión', () => {
      const e = enReparto();
      expect(data.entregar(e.id)).toBe(true);
      const comisiones = data.comisiones().length;
      expect(data.entregar(e.id)).toBe(false);
      expect(data.comisiones()).toHaveLength(comisiones);
    });

    it('la incidencia la reporta solo el mensajero del envío', () => {
      const e = enReparto();
      expect(data.reportarIncidencia(e.id, 'x', 'ausente', micaela.usuario)).toBe(false);
      expect(data.reportarIncidencia(e.id, 'x', 'ausente', dueño)).toBe(false);
      expect(data.reportarIncidencia(e.id, 'x', 'ausente', santiago.usuario)).toBe(true);
    });
  });
});
