import { Injectable, computed, signal } from '@angular/core';
import {
  Actividad, Cliente, ClienteInput, CorreoSimulado, DB, Envio, EstadoCuenta, HitoEnvio, Franja, Comision, ConfigPagos, ConceptoComision, EstadoComision, Liquidacion, AjusteLiquidacion, CONFIG_PAGOS_DEFECTO, fechaLocal, hoyISO, ConfigOperacion, OPERACION_DEFECTO, esDiaHabilISO, proximaFechaHabil, Mensajero, MensajeroInput, EstadoEnvio, NuevoEnvio, NuevoLote,
  ItemEnvio, MovimientoStock, enCursoMensajero, enCustodiaFlexya, MAX_INTENTOS, MOTIVOS_INCIDENCIA, TipoMovimiento, NuevoPedidoRetiro, NuevoRetiro, Producto, ProductoInput, direccionCompleta, TipoToken, TokenUsuario, Usuario, zonaDe, zonaPorId,
} from '../models';
import { CLAVE_DATOS, cargarDB, guardarDB } from './almacenamiento';
import { createSeed } from './seed';

export class StockInsuficienteError extends Error {}

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly db = signal<DB>(cargarDB());

  readonly usuarios = computed(() => this.db().usuarios);
  readonly tokens = computed(() => this.db().tokens);
  readonly correos = computed(() => this.db().correos);
  readonly necesitaConfiguracion = computed(() => !this.db().usuarios.some((u) => u.rol === 'admin'));
  readonly clientes = computed(() => this.db().clientes);
  readonly productos = computed(() => this.db().productos);
  readonly movimientos = computed(() => this.db().movimientos);
  readonly comisiones = computed(() => this.db().comisiones);
  readonly configOperacion = computed<ConfigOperacion>(() => ({ ...OPERACION_DEFECTO, ...(this.db().configOperacion[0] ?? {}) }));
  readonly liquidaciones = computed(() => this.db().liquidaciones);
  readonly configPagos = computed<ConfigPagos>(() => ({ ...CONFIG_PAGOS_DEFECTO, ...(this.db().configPagos[0] ?? {}) }));
  readonly mensajeros = computed(() => this.db().mensajeros);
  readonly envios = computed(() => this.db().envios);
  readonly lotes = computed(() => this.db().lotes);
  readonly retiros = computed(() => this.db().retiros);
  readonly actividades = computed(() => this.db().actividades);

  constructor() {
    this.log('Estado inicial');
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === CLAVE_DATOS) this.db.set(cargarDB());
      });
    }
  }

  enviosDe(user: Usuario | null): Envio[] {
    const all = this.envios();
    if (user?.rol === 'cliente') return all.filter((e) => e.clienteId === user.clienteId);
    if (user?.rol === 'mensajero') return all.filter((e) => e.mensajeroId === user.mensajeroId);
    return user?.rol === 'admin' ? all.filter((e) => e.estado !== 'Borrador') : [];
  }

  productosDe(user: Usuario | null): Producto[] {
    const todos = this.productos();
    if (user?.rol === 'cliente') return todos.filter((p) => p.clienteId === user.clienteId);
    return user?.rol === 'admin' ? todos : [];
  }

  lotesDe(user: Usuario | null) {
    const all = this.lotes();
    return user?.rol === 'cliente' ? all.filter((l) => l.clienteId === user.clienteId) : all;
  }

  retirosDe(user: Usuario | null) {
    const all = this.retiros();
    return user?.rol === 'cliente' ? all.filter((r) => r.clienteId === user.clienteId) : all;
  }

  nombreCliente(id: string): string {
    return this.clientes().find((c) => c.id === id)?.nombre ?? '—';
  }

  nombreMensajero(id: string | null): string {
    return this.mensajeros().find((m) => m.id === id)?.nombre ?? '—';
  }

  crearEnvio(input: NuevoEnvio, clienteId: string): Envio {
    const borrador = input.borrador === true;
    const hermanos = input.retiroId ? this.envios().filter((e) => e.clienteId === clienteId && e.retiroId === input.retiroId) : [];
    const entrada: NuevoEnvio = hermanos.length
      ? { ...input, retiro: hermanos[0].retiro, fechaRetiro: hermanos[0].fechaRetiro, programado: hermanos[0].retiroProgramado, franja: hermanos[0].franja }
      : input;
    const campos = this.camposDeEnvio(entrada, clienteId);
    if (!borrador) this.validarStock(campos.items, []);
    const ahora = new Date().toISOString();
    const estado: EstadoEnvio = borrador ? 'Borrador' : 'Pendiente';
    const envio: Envio = {
      ...campos,
      id: `LF-${this.nextNumber(this.envios().map((e) => e.id), 10000)}`,
      clienteId,
      estado,
      eta: borrador ? 'Sin solicitar' : 'A coordinar',
      mensajeroId: null,
      creadoEn: ahora,
      historial: [this.hito(estado, borrador ? 'Guardado como borrador' : 'Envío solicitado', ahora)],
      retiroId: hermanos.length ? input.retiroId! : `R-${this.nextNumber(this.envios().map((e) => e.retiroId ?? ''), 10000)}`,
      intentos: 0,
    };
    const unidades = envio.items.reduce((total, i) => total + i.cantidad, 0);
    this.mutate(`${borrador ? 'Nuevo borrador' : 'Nuevo envío'} ${envio.id}`, (d) => ({
      ...d,
      ...(borrador ? {} : this.moverStock(d, envio, [], envio.items, 'ENVIO')),
      envios: [envio, ...d.envios],
      actividades: borrador
        ? d.actividades
        : [this.actividad('blue', `Nuevo envío ${envio.id}`, `Creado para ${envio.destinatario}${unidades ? ` (${unidades} unidades)` : ''}.`), ...d.actividades],
    }));
    return envio;
  }

  actualizarEnvio(id: string, clienteId: string, input: NuevoEnvio): boolean {
    if (!this.editablePor(id, clienteId)) return false;
    const previo = this.envios().find((e) => e.id === id)!;
    const eraBorrador = previo.estado === 'Borrador';
    const solicita = eraBorrador && input.borrador !== true;
    const campos = this.camposDeEnvio(input, clienteId, previo);
    const reservaPrevia = eraBorrador ? [] : previo.items;
    const reservaNueva = eraBorrador && !solicita ? [] : campos.items;
    this.validarStock(reservaNueva, reservaPrevia);
    const ahora = new Date().toISOString();
    this.mutate(`Envío ${id} editado`, (d) => ({
      ...d,
      ...this.moverStock(d, { id, clienteId, retiro: campos.retiro }, reservaPrevia, reservaNueva, solicita ? 'ENVIO' : 'EDICION'),
      envios: d.envios.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              ...campos,
              ...(solicita
                ? { estado: 'Pendiente' as const, eta: 'A coordinar', historial: [...(e.historial ?? []), this.hito('Pendiente', 'Envío solicitado', ahora)] }
                : {}),
            },
      ),
      actividades:
        eraBorrador && !solicita
          ? d.actividades
          : [
              this.actividad(
                'blue',
                solicita ? `Nuevo envío ${id}` : `Envío ${id} editado`,
                solicita ? `Solicitado para ${campos.destinatario}.` : `Se actualizaron los datos para ${campos.destinatario}.`,
              ),
              ...d.actividades,
            ],
    }));
    return true;
  }

  crearRetiro(pedido: NuevoPedidoRetiro, clienteId: string): Envio[] {
    if (!pedido.destinos.length) return [];
    if (!pedido.borrador) {
      const totales = new Map<string, number>();
      for (const destino of pedido.destinos) {
        for (const item of destino.items) totales.set(item.productoId, (totales.get(item.productoId) ?? 0) + Math.floor(item.cantidad));
      }
      for (const [productoId, total] of totales) {
        const producto = this.productos().find((p) => p.id === productoId && p.clienteId === clienteId);
        if (producto && total > producto.stock) throw new StockInsuficienteError(`${producto.nombre}: pediste ${total} y hay ${producto.stock} en stock.`);
      }
    }
    const creados: Envio[] = [];
    for (const destino of pedido.destinos) {
      creados.push(
        this.crearEnvio(
          {
            ...destino,
            retiro: pedido.retiro,
            programado: pedido.programado,
            fechaRetiro: pedido.fechaRetiro,
            franja: pedido.franja,
            borrador: pedido.borrador,
            retiroId: creados[0]?.retiroId,
          },
          clienteId,
        ),
      );
    }
    return creados;
  }

  cancelarRetiro(retiroId: string, clienteId: string): number {
    const ids = this.envios().filter((e) => e.retiroId === retiroId && e.clienteId === clienteId && this.cancelableCliente(e)).map((e) => e.id);
    for (const id of ids) this.cancelarEnvio(id, clienteId);
    return ids.length;
  }

  solicitarEnvio(id: string, clienteId: string): boolean {
    const e = this.envios().find((x) => x.id === id && x.clienteId === clienteId && x.estado === 'Borrador');
    if (!e) return false;
    return this.actualizarEnvio(id, clienteId, {
      destinatario: e.destinatario, telefono: e.telefono, direccion: e.direccion, localidad: e.localidad, retiro: e.retiro,
      fechaRetiro: e.fechaRetiro, programado: e.retiroProgramado, franja: e.franja, items: e.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
    });
  }

  eliminarBorrador(id: string, clienteId: string): boolean {
    if (!this.envios().some((e) => e.id === id && e.clienteId === clienteId && e.estado === 'Borrador')) return false;
    this.mutate(`Borrador ${id} eliminado`, (d) => ({ ...d, envios: d.envios.filter((e) => e.id !== id) }));
    return true;
  }

  cancelarEnvio(id: string, clienteId: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.clienteId !== clienteId || !this.cancelableCliente(envio)) return false;
    const texto = envio.nota ? `Cancelado por el cliente. Antes: ${envio.nota}` : 'Cancelado por el cliente.';
    if (enCustodiaFlexya(envio)) {
      this.cambiarEstado(envio.id, 'En devolución', 'Devolución a coordinar', 'amber', `Envío ${envio.id} se devuelve al cliente`, { mensajeroId: null, nota: texto }, `${texto} El paquete ya está en Flexya: se le devuelve.`);
      return true;
    }
    this.anular(envio, { nota: texto }, texto);
    return true;
  }

  tamanoRetiro(e: Envio): number {
    return this.envios().filter((x) => x.clienteId === e.clienteId && x.retiroId === e.retiroId).length;
  }

  paquetesDelRetiro(e: Envio, estado: EstadoEnvio): Envio[] {
    return this.envios().filter(
      (x) => x.clienteId === e.clienteId && x.retiroId === e.retiroId && x.estado === estado && x.retiro === e.retiro && x.mensajeroId === e.mensajeroId,
    );
  }

  puedeCancelarAdmin(e: Envio): boolean {
    return ['Pendiente', 'Retiro asignado', 'Retiro fallido'].includes(e.estado) || (e.estado === 'En revisión' && e.retiro === 'domicilio');
  }

  puedeEliminarAdmin(e: Envio): boolean {
    return e.estado !== 'Borrador' && !enCustodiaFlexya(e);
  }

  puedeDevolver(e: Envio): boolean {
    return e.estado === 'En depósito' || (e.estado === 'En revisión' && e.retiro === 'deposito');
  }

  puedeCorregirDestino(e: Envio): boolean {
    return (e.estado === 'Incidencia' || e.estado === 'En depósito') && (e.intentos ?? 0) > 0;
  }

  domicilioCliente(clienteId: string): string {
    const c = this.clientes().find((x) => x.id === clienteId);
    return c ? direccionCompleta(c) : '';
  }

  reingresar(id: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (envio?.estado !== 'Incidencia') return false;
    this.cambiarEstado(id, 'En depósito', 'Listo para reintentar', 'teal', `Envío ${id} reingresó al depósito`, { mensajeroId: null }, 'El paquete volvió al depósito tras la incidencia.');
    return true;
  }

  devolverAlCliente(id: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || !this.puedeDevolver(envio)) return false;
    this.cambiarEstado(id, 'En devolución', 'Devolución a coordinar', 'amber', `Envío ${id} se devuelve al cliente`, { mensajeroId: null }, 'Flexya le devuelve el paquete al cliente.');
    return true;
  }

  entregarDevolucion(id: string, mensajeroId: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.estado !== 'En devolución' || envio.mensajeroId !== mensajeroId || envio.devolucionEntregadaEn) return false;
    this.cambiarEstado(
      id, 'En devolución', 'Esperando confirmación del cliente', 'amber', `Devolución de ${id} entregada`,
      { devolucionEntregadaEn: new Date().toISOString() }, 'El mensajero entregó la devolución: falta la confirmación del cliente.',
    );
    this.comisionarSobreTarifa(envio, 'DEVOLUCION', this.configPagos().porcentajeDevolucion);
    return true;
  }

  confirmarDevolucion(id: string, clienteId: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.clienteId !== clienteId || envio.estado !== 'En devolución') return false;
    this.cambiarEstado(id, 'Devuelto', 'Devuelto', 'teal', `Envío ${id} devuelto`, {}, 'El cliente confirmó que recibió el paquete.');
    this.mutate(`Stock devuelto por ${id}`, (d) => ({ ...d, ...this.moverStock(d, envio, envio.items, [], 'DEVOLUCION') }));
    return true;
  }

  corregirDestino(id: string, datos: { telefono: string; localidad: string; direccion: string }, clienteId?: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || !this.puedeCorregirDestino(envio) || (clienteId && envio.clienteId !== clienteId)) return false;
    const zona = zonaDe(datos.localidad);
    this.mutate(`Destino de ${id} corregido`, (d) => ({
      ...d,
      envios: d.envios.map((e) =>
        e.id === id
          ? {
              ...e,
              ...datos,
              zonaId: zona?.id ?? '',
              importe: zona?.tarifa ?? e.importe,
              historial: [...(e.historial ?? []), this.hito(e.estado, 'Datos de entrega corregidos')],
            }
          : e,
      ),
      actividades: [this.actividad('blue', `Destino de ${id} corregido`, 'Se actualizaron los datos de entrega.'), ...d.actividades],
    }));
    return true;
  }

  editableCliente(e: Envio): boolean {
    return e.estado === 'Borrador' || e.estado === 'Pendiente' || e.estado === 'En revisión';
  }

  cancelableCliente(e: Envio): boolean {
    return e.estado === 'Pendiente' || e.estado === 'En revisión';
  }

  private delMensajero(id: string, mensajeroId: string, estado: EstadoEnvio): Envio | null {
    const e = this.envios().find((x) => x.id === id);
    return e && e.retiro === 'domicilio' && e.mensajeroId === mensajeroId && e.estado === estado ? e : null;
  }

  retirar(id: string, mensajeroId: string, observaciones = ''): boolean {
    const base = this.delMensajero(id, mensajeroId, 'Retiro asignado');
    if (!base) return false;
    for (const p of this.paquetesDelRetiro(base, 'Retiro asignado')) {
      this.cambiarEstado(p.id, 'Retirado', 'Listo para salir', 'teal', `Envío ${p.id} retirado`, {}, observaciones ? `Observaciones: ${observaciones}` : 'Retirado en el domicilio del cliente.');
    }
    if (!this.comisiones().some((c) => c.concepto === 'RETIRO' && c.retiroId === base.retiroId && c.mensajeroId === mensajeroId)) {
      this.comisionar({ mensajeroId, envioId: base.id, retiroId: base.retiroId, concepto: 'RETIRO', base: 0, porcentaje: 0, monto: this.configPagos().adicionalRetiro });
    }
    return true;
  }
  salirAEntregar(id: string, mensajeroId: string): boolean {
    const base = this.delMensajero(id, mensajeroId, 'Retirado');
    if (!base) return false;
    for (const p of this.paquetesDelRetiro(base, 'Retirado')) {
      this.cambiarEstado(p.id, 'En reparto', 'Hoy', 'blue', `Envío ${p.id} en reparto`, {}, 'En camino al destinatario.');
    }
    return true;
  }
  retiroFallido(id: string, mensajeroId: string, motivo: string): boolean {
    const base = this.delMensajero(id, mensajeroId, 'Retiro asignado');
    if (!motivo.trim() || !base) return false;
    for (const p of this.paquetesDelRetiro(base, 'Retiro asignado')) {
      this.cambiarEstado(p.id, 'Retiro fallido', 'A reprogramar', 'amber', `Retiro fallido en ${p.id}`, { nota: motivo.trim(), mensajeroId: null }, `Motivo: ${motivo.trim()}`);
    }
    return true;
  }
  diferenciaEnRetiro(id: string, mensajeroId: string, motivo: string): boolean {
    if (!motivo.trim() || !this.delMensajero(id, mensajeroId, 'Retiro asignado')) return false;
    const texto = motivo.trim();
    this.cambiarEstado(id, 'En revisión', 'En pausa', 'amber', `Envío ${id} en revisión`, { nota: texto, mensajeroId: null }, `El mensajero vio que lo del domicilio no coincide con lo declarado. ${texto}`);
    return true;
  }

  puedeObservar(e: Envio): boolean {
    return (e.estado === 'Pendiente' && e.retiro === 'deposito') || e.estado === 'En depósito';
  }

  observar(id: string, motivo: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || !this.puedeObservar(envio) || !motivo.trim()) return false;
    const texto = motivo.trim();
    this.cambiarEstado(id, 'En revisión', 'En pausa', 'amber', `Envío ${id} en revisión`, { nota: texto }, `Lo recibido no coincide con lo declarado. ${texto}`);
    return true;
  }

  reanudar(id: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (envio?.estado !== 'En revisión') return false;
    if (envio.retiro === 'domicilio') {
      this.cambiarEstado(id, 'Pendiente', 'A coordinar', 'teal', `Envío ${id} reanudado`, { nota: '', mensajeroId: null }, 'Se verificó el contenido: falta asignar un mensajero.');
    } else {
      this.cambiarEstado(id, 'En depósito', 'Listo para asignar', 'teal', `Envío ${id} reanudado`, { nota: '' }, 'Se verificó el contenido.');
    }
    return true;
  }

  cancelarPorAdmin(id: string, motivo: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || !this.puedeCancelarAdmin(envio) || !motivo.trim()) return false;
    const texto = `Cancelado por Flexya: ${motivo.trim()}`;
    this.anular(envio, { nota: texto }, texto);
    return true;
  }

  private anular(envio: Envio, cambios: Partial<Envio>, detalle: string) {
    this.cambiarEstado(envio.id, 'Cancelado', 'Cancelado', 'amber', `Envío ${envio.id} cancelado`, cambios, detalle);
    this.mutate(`Stock devuelto por ${envio.id}`, (d) => ({ ...d, ...this.moverStock(d, envio, envio.items, [], 'CANCELACION') }));
  }

  eliminarEnvio(id: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.estado === 'Borrador') return false;
    if (!this.puedeEliminarAdmin(envio)) return false;
    const reservado = !['Entregado', 'Cancelado', 'Devuelto'].includes(envio.estado);
    this.mutate(`Envío ${id} eliminado`, (d) => ({
      ...d,
      ...(reservado ? this.moverStock(d, envio, envio.items, [], 'CANCELACION') : {}),
      envios: d.envios.filter((e) => e.id !== id),
      actividades: [this.actividad('amber', `Envío ${id} eliminado`, 'Eliminado por Flexya.'), ...d.actividades],
    }));
    return true;
  }

  recepcionar(id: string, observaciones = ''): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.estado !== 'Pendiente' || envio.retiro !== 'deposito') return false;
    for (const p of this.paquetesDelRetiro(envio, 'Pendiente')) {
      this.cambiarEstado(p.id, 'En depósito', 'Listo para asignar', 'teal', 'Paquete recepcionado', {}, observaciones ? `Observaciones: ${observaciones}` : '');
    }
    return true;
  }
  puedeAsignarse(e: Envio): boolean {
    return (
      (e.estado === 'En depósito' && (e.intentos ?? 0) < MAX_INTENTOS) ||
      (e.estado === 'En devolución' && !e.mensajeroId) ||
      (e.retiro === 'domicilio' && (e.estado === 'Pendiente' || e.estado === 'Retiro fallido'))
    );
  }

  asignar(id: string, mensajeroId: string): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || !this.puedeAsignarse(envio) || !this.mensajeros().some((m) => m.id === mensajeroId)) return false;
    const devolucion = envio.estado === 'En devolución';
    const directo = envio.estado === 'Pendiente' || envio.estado === 'Retiro fallido';
    const nuevo: EstadoEnvio = devolucion ? 'En devolución' : directo ? 'Retiro asignado' : 'En reparto';
    const nombre = this.nombreMensajero(mensajeroId);
    const ids = new Set(directo ? this.paquetesDelRetiro(envio, envio.estado).map((p) => p.id) : [id]);
    this.mutate(`Asignar ${id}`, (d) => ({
      ...d,
      envios: d.envios.map((e) =>
        ids.has(e.id)
          ? {
              ...e,
              estado: nuevo,
              mensajeroId,
              eta: devolucion ? 'Devolución hoy' : directo ? 'Retiro hoy' : 'Hoy',
              nota: devolucion ? (e.nota ?? '') : '',
              historial: [...(e.historial ?? []), this.hito(nuevo, devolucion ? `Devolución asignada a ${nombre}` : `Asignado a ${nombre}`)],
            }
          : e,
      ),
      actividades: [
        this.actividad(
          'blue',
          ids.size > 1 ? `Retiro ${envio.retiroId} asignado` : `Envío ${id} asignado`,
          `${nombre} ${devolucion ? 'va a devolver el paquete al cliente' : directo ? 'va a retirar el paquete en el domicilio del cliente' : 'tomó una nueva ruta'}.`,
        ),
        ...d.actividades,
      ],
    }));
    return true;
  }

  entregar(id: string, recibidoPor = '') {
    this.cambiarEstado(
      id, 'Entregado', 'Hoy · ahora', 'teal', `Envío ${id} entregado`,
      { entregadoEn: new Date().toISOString(), ...(recibidoPor ? { recibidoPor } : {}) },
      recibidoPor ? `Recibió: ${recibidoPor}` : '',
    );
    const envio = this.envios().find((e) => e.id === id);
    if (envio && !this.comisiones().some((c) => c.envioId === id && c.concepto === 'ENTREGA')) this.comisionarSobreTarifa(envio, 'ENTREGA');
  }

  reportarIncidencia(id: string, motivo = '', motivoId = 'otro'): boolean {
    const envio = this.envios().find((e) => e.id === id);
    if (!envio || envio.estado !== 'En reparto') return false;
    const etiqueta = MOTIVOS_INCIDENCIA.find((m) => m.id === motivoId)?.etiqueta ?? 'Otro motivo';
    const texto = motivo ? `${etiqueta}: ${motivo}` : etiqueta;
    const intento = (envio.intentos ?? 0) + 1;
    this.cambiarEstado(
      id, 'Incidencia', 'Volver al depósito', 'amber', `Incidencia en ${id}`,
      { nota: texto, motivoIncidencia: motivoId, intentos: intento },
      `Intento ${intento} de ${MAX_INTENTOS}. ${texto}`,
    );
    if (motivoId !== 'danado') this.comisionarSobreTarifa(envio, 'INTENTO_FALLIDO', this.configPagos().porcentajeIntentoFallido);
    return true;
  }
  ingresarLote(input: NuevoLote) {
    const id = `DEP-${String(this.nextNumber(this.lotes().map((l) => l.id), 0)).padStart(4, '0')}`;
    this.mutate(`Nuevo lote ${id}`, (d) => ({
      ...d,
      lotes: [{ ...input, id, recibidoEn: new Date().toISOString() }, ...d.lotes],
      actividades: [
        this.actividad('blue', 'Nuevo lote ingresado a depósito', `${this.nombreCliente(input.clienteId)} dejó ${input.unidades} unidades en ${input.ubicacion}.`),
        ...d.actividades,
      ],
    }));
  }

  solicitarRetiro(input: NuevoRetiro, clienteId: string) {
    const id = `RET-${this.nextNumber(this.retiros().map((r) => r.id), 100)}`;
    this.mutate(`Solicitud de retiro ${id}`, (d) => ({
      ...d,
      retiros: [{ ...input, id, clienteId, estado: 'Pendiente', creadoEn: new Date().toISOString() }, ...d.retiros],
      actividades: [
        this.actividad('amber', 'Retiro solicitado', `${this.nombreCliente(clienteId)} pidió retirar ${input.unidades} unidades.`),
        ...d.actividades,
      ],
    }));
  }

  aprobarRetiro(id: string) {
    const retiro = this.retiros().find((r) => r.id === id);
    if (!retiro) return;
    this.mutate(`Aprobar retiro ${id}`, (d) => ({
      ...d,
      retiros: d.retiros.map((r) => (r.id === id ? { ...r, estado: 'Aprobado' } : r)),
      lotes: d.lotes.map((l) =>
        l.id === retiro.loteId ? { ...l, unidades: Math.max(0, l.unidades - retiro.unidades) } : l,
      ),
    }));
  }

  agregarCliente(input: ClienteInput): { cliente: Cliente; usuario: Usuario } {
    const cliente: Cliente = {
      ...input,
      id: `c${this.nextNumber(this.clientes().map((c) => c.id), 0)}`,
      creadoEn: new Date().toISOString(),
    };
    const usuario = this.nuevoUsuario({ nombre: cliente.nombre, email: cliente.email, rol: 'cliente', estado: 'PENDIENTE', clienteId: cliente.id });
    this.mutate(`Nuevo cliente ${cliente.id}`, (db) => ({
      ...db,
      clientes: [...db.clientes, cliente],
      usuarios: [...db.usuarios, usuario],
      actividades: [this.actividad('teal', 'Nuevo cliente', `${cliente.nombre} se dio de alta (plan ${cliente.plan}).`), ...db.actividades],
    }));
    return { cliente, usuario };
  }

  actualizarCliente(id: string, input: ClienteInput) {
    this.mutate(`Cliente ${id} actualizado`, (db) => ({
      ...db,
      clientes: db.clientes.map((c) => (c.id === id ? { ...c, ...input } : c)),
      usuarios: db.usuarios.map((u) => (u.clienteId === id ? { ...u, nombre: input.nombre, email: input.email } : u)),
    }));
  }

  resumenCliente(id: string) {
    const envios = this.envios().filter((e) => e.clienteId === id);
    return {
      productos: this.productos().filter((p) => p.clienteId === id).length,
      envios: envios.length,
      borradores: envios.filter((e) => e.estado === 'Borrador').length,
      enCurso: envios.filter((e) => !['Entregado', 'Cancelado', 'Borrador', 'Devuelto'].includes(e.estado)).length,
      enCustodia: envios.filter((e) => enCustodiaFlexya(e)).length,
      movimientos: this.movimientos().filter((m) => m.clienteId === id).length,
    };
  }

  motivoClienteNoEliminable(id: string): string | null {
    const n = this.envios().filter((e) => e.clienteId === id && enCustodiaFlexya(e)).length;
    return n ? `Flexya tiene ${n} paquete(s) suyo(s) en depósito, en reparto o en devolución. Entregalos o devolvelos antes de eliminarlo.` : null;
  }

  eliminarCliente(id: string): boolean {
    if (!this.clientes().some((c) => c.id === id) || this.motivoClienteNoEliminable(id)) return false;
    this.mutate(`Cliente ${id} eliminado`, (d) => {
      const quitar = new Set(d.usuarios.filter((u) => u.clienteId === id).map((u) => u.id));
      return {
        ...d,
        clientes: d.clientes.filter((c) => c.id !== id),
        usuarios: d.usuarios.filter((u) => !quitar.has(u.id)),
        tokens: d.tokens.filter((t) => !quitar.has(t.usuarioId)),
        lotes: d.lotes.filter((l) => l.clienteId !== id),
        retiros: d.retiros.filter((r) => r.clienteId !== id),
        productos: d.productos.filter((p) => p.clienteId !== id),
        movimientos: d.movimientos.filter((m) => m.clienteId !== id),
        envios: d.envios.filter((e) => e.clienteId !== id),
      };
    });
    return true;
  }

  nombreZona(id: string): string {
    return zonaPorId(id)?.nombre ?? '—';
  }

  agregarMensajero(input: MensajeroInput): { mensajero: Mensajero; usuario: Usuario } {
    const mensajero: Mensajero = {
      ...input,
      id: `m${this.nextNumber(this.mensajeros().map((m) => m.id), 0)}`,
      creadoEn: new Date().toISOString(),
    };
    const usuario = this.nuevoUsuario({ nombre: mensajero.nombre, email: mensajero.email, rol: 'mensajero', estado: 'PENDIENTE', mensajeroId: mensajero.id });
    this.mutate(`Nuevo mensajero ${mensajero.id}`, (db) => ({
      ...db,
      mensajeros: [...db.mensajeros, mensajero],
      usuarios: [...db.usuarios, usuario],
      actividades: [
        this.actividad('teal', 'Nuevo mensajero', `${mensajero.nombre} se sumó al equipo (${this.nombreZona(mensajero.zonaId)}).`),
        ...db.actividades,
      ],
    }));
    return { mensajero, usuario };
  }

  actualizarMensajero(id: string, input: MensajeroInput) {
    this.mutate(`Mensajero ${id} actualizado`, (db) => ({
      ...db,
      mensajeros: db.mensajeros.map((m) => (m.id === id ? { ...m, ...input } : m)),
      usuarios: db.usuarios.map((u) => (u.mensajeroId === id ? { ...u, nombre: input.nombre, email: input.email } : u)),
    }));
  }

  motivoMensajeroNoEliminable(id: string): string | null {
    const enReparto = this.envios().filter((e) => e.mensajeroId === id && enCursoMensajero(e)).length;
    if (enReparto) return `Tiene ${enReparto} envío(s) en curso.`;
    const debe = this.comisiones().filter((c) => c.mensajeroId === id && this.estadoComision(c) !== 'Pagada').reduce((t, c) => t + c.monto, 0);
    return debe > 0 ? `Tiene pagos pendientes por $ ${debe}. Liquidalos y pagalos antes de eliminarlo.` : null;
  }

  resumenMensajero(id: string) {
    const suyos = this.envios().filter((e) => e.mensajeroId === id);
    return { cerrados: suyos.filter((e) => !enCursoMensajero(e)).length, enCurso: suyos.filter((e) => enCursoMensajero(e)).length };
  }

  eliminarMensajero(id: string): boolean {
    if (this.motivoMensajeroNoEliminable(id)) return false;
    this.mutate(`Mensajero ${id} eliminado`, (db) => {
      const quitar = new Set(db.usuarios.filter((u) => u.mensajeroId === id).map((u) => u.id));
      return {
        ...db,
        mensajeros: db.mensajeros.filter((m) => m.id !== id),
        envios: db.envios.map((e) => (e.mensajeroId === id ? { ...e, mensajeroId: null } : e)),
        usuarios: db.usuarios.filter((u) => !quitar.has(u.id)),
        tokens: db.tokens.filter((t) => !quitar.has(t.usuarioId)),
      };
    });
    return true;
  }

  agregarProducto(clienteId: string, input: ProductoInput): Producto {
    const stock = input.stock ?? 0;
    const producto: Producto = {
      ...input,
      stock,
      id: `p${this.nextNumber(this.productos().map((p) => p.id), 0)}`,
      clienteId,
      creadoEn: new Date().toISOString(),
    };
    this.mutate(`Nuevo producto ${producto.id}`, (db) => ({
      ...db,
      productos: [...db.productos, producto],
      movimientos: stock
        ? [this.nuevoMovimiento({ clienteId, productoId: producto.id, producto: producto.nombre, tipo: 'INICIAL', cantidad: stock, saldo: stock, envioId: null, retiro: null, nota: '' }), ...db.movimientos]
        : db.movimientos,
    }));
    return producto;
  }

  actualizarProducto(id: string, clienteId: string, input: ProductoInput): boolean {
    const actual = this.productos().find((p) => p.id === id && p.clienteId === clienteId);
    if (!actual) return false;
    const stock = input.stock ?? actual.stock;
    const diferencia = stock - actual.stock;
    this.mutate(`Producto ${id} actualizado`, (db) => ({
      ...db,
      productos: db.productos.map((p) => (p.id === id ? { ...p, ...input, stock } : p)),
      movimientos: diferencia
        ? [this.nuevoMovimiento({ clienteId, productoId: id, producto: input.nombre, tipo: 'AJUSTE', cantidad: diferencia, saldo: stock, envioId: null, retiro: null, nota: '' }), ...db.movimientos]
        : db.movimientos,
    }));
    return true;
  }

  motivoProductoNoEliminable(id: string): string | null {
    const producto = this.productos().find((p) => p.id === id);
    if (!producto) return null;
    const enCurso = this.envios().filter(
      (e) => !['Entregado', 'Cancelado', 'Borrador', 'Devuelto'].includes(e.estado) && e.items.some((i) => i.productoId === id),
    ).length;
    return enCurso && producto.stock > 0
      ? `Está en ${enCurso} envío(s) en curso y todavía tiene ${producto.stock} unidades en stock. Dejá el stock en 0 para poder eliminarlo.`
      : null;
  }

  eliminarProducto(id: string, clienteId: string): boolean {
    if (!this.productos().some((p) => p.id === id && p.clienteId === clienteId)) return false;
    if (this.motivoProductoNoEliminable(id)) return false;
    this.mutate(`Producto ${id} eliminado`, (db) => ({
      ...db,
      productos: db.productos.filter((p) => p.id !== id),
      movimientos: db.movimientos.filter((m) => m.productoId !== id),
    }));
    return true;
  }

  reset() {
    this.mutate('Datos borrados', (db) => ({ ...createSeed(), usuarios: db.usuarios.filter((u) => u.rol === 'admin') }));
  }

  crearSuperadmin(nombre: string, email: string, claveHash: string, sal: string): Usuario {
    const usuario = this.nuevoUsuario({ nombre, email: email.trim().toLowerCase(), rol: 'admin', estado: 'ACTIVO', claveHash, sal });
    this.mutate('Superadministrador creado', (db) => ({ ...db, usuarios: [...db.usuarios, usuario] }));
    return usuario;
  }

  actualizarUsuario(id: string, cambios: Partial<Usuario>) {
    this.mutate(`Usuario ${id} actualizado`, (db) => ({
      ...db,
      usuarios: db.usuarios.map((u) => (u.id === id ? { ...u, ...cambios } : u)),
    }));
  }

  cambiarEstadoCuenta(id: string, estado: EstadoCuenta) {
    const usuario = this.usuarios().find((u) => u.id === id);
    if (usuario) this.actualizarUsuario(id, { estado, versionSesion: usuario.versionSesion + 1 });
  }

  motivoNoSuspender(usuarioId: string): string | null {
    const usuario = this.usuarios().find((u) => u.id === usuarioId);
    if (!usuario?.mensajeroId) return null;
    const enReparto = this.envios().filter((e) => e.mensajeroId === usuario.mensajeroId && enCursoMensajero(e)).length;
    return enReparto ? `Tiene ${enReparto} envío(s) en curso. Reasignalos antes de suspenderlo.` : null;
  }

  guardarToken(token: TokenUsuario) {
    this.mutate('Token emitido', (db) => ({ ...db, tokens: [...db.tokens, token] }));
  }

  invalidarTokens(usuarioId: string, tipo: TipoToken) {
    const ahora = new Date().toISOString();
    this.mutate('Tokens anteriores invalidados', (db) => ({
      ...db,
      tokens: db.tokens.map((t) => (t.usuarioId === usuarioId && t.tipo === tipo && !t.usadoEn ? { ...t, usadoEn: ahora } : t)),
    }));
  }

  marcarTokenUsado(id: string) {
    const ahora = new Date().toISOString();
    this.mutate('Token usado', (db) => ({ ...db, tokens: db.tokens.map((t) => (t.id === id ? { ...t, usadoEn: ahora } : t)) }));
  }

  agregarCorreo(correo: CorreoSimulado) {
    this.mutate('Correo simulado enviado', (db) => ({ ...db, correos: [correo, ...db.correos] }));
  }

  private cambiarEstado(
    id: string,
    estado: EstadoEnvio,
    eta: string,
    tono: Actividad['tono'],
    titulo: string,
    cambios: Partial<Envio> = {},
    detalle = '',
  ) {
    this.mutate(`${titulo} (${id})`, (d) => ({
      ...d,
      envios: d.envios.map((e) =>
        e.id === id ? { ...e, estado, eta, ...cambios, historial: [...(e.historial ?? []), this.hito(estado, detalle || titulo)] } : e,
      ),
      actividades: [this.actividad(tono, titulo, `Envío ${id} → ${estado}.${detalle ? ' ' + detalle : ''}`), ...d.actividades],
    }));
  }

  guardarConfigOperacion(config: ConfigOperacion) {
    this.mutate('Configuración de operación', (d) => ({ ...d, configOperacion: [config] }));
  }

  esDiaHabil(iso: string): boolean {
    return esDiaHabilISO(iso, this.configOperacion().feriados);
  }

  proximaFechaRetiro(ahora = new Date()): string {
    return proximaFechaHabil(ahora, this.configOperacion());
  }

  comisionesDe(user: Usuario | null): Comision[] {
    if (user?.rol === 'admin') return this.comisiones();
    return user?.rol === 'mensajero' ? this.comisiones().filter((c) => c.mensajeroId === user.mensajeroId) : [];
  }

  guardarConfigPagos(config: ConfigPagos) {
    this.mutate('Configuración de pagos', (d) => ({ ...d, configPagos: [config] }));
  }

  porcentajeDe(mensajeroId: string | null, zonaId: string): number {
    const c = this.configPagos();
    return (mensajeroId ? c.porMensajero[mensajeroId] : undefined) ?? c.porZona[zonaId] ?? c.porcentajeGeneral;
  }

  estadoComision(c: Comision): EstadoComision {
    if (!c.liquidacionId) return 'Pendiente';
    return this.liquidaciones().find((l) => l.id === c.liquidacionId)?.estado === 'Pagada' ? 'Pagada' : 'Liquidada';
  }

  pendientesDe(mensajeroId: string, desde: string, hasta: string): Comision[] {
    return this.comisiones().filter((c) => {
      const dia = fechaLocal(c.fecha);
      return c.mensajeroId === mensajeroId && !c.liquidacionId && dia >= desde && dia <= hasta;
    });
  }

  generarLiquidacion(mensajeroId: string, desde: string, hasta: string, ajuste?: AjusteLiquidacion): Liquidacion | null {
    const pendientes = this.pendientesDe(mensajeroId, desde, hasta);
    if (!pendientes.length || desde > hasta) return null;
    const bruto = this.redondear(pendientes.reduce((total, c) => total + c.monto, 0));
    const descuento = ajuste && ajuste.monto > 0 && ajuste.concepto.trim() ? this.redondear(Math.min(ajuste.monto, bruto)) : 0;
    const liquidacion: Liquidacion = {
      id: `LQ-${this.nextNumber(this.liquidaciones().map((l) => l.id), 10000)}`,
      mensajeroId, desde, hasta,
      comisionIds: pendientes.map((c) => c.id),
      bruto,
      ajustes: descuento ? [{ concepto: ajuste!.concepto.trim(), monto: -descuento }] : [],
      neto: this.redondear(bruto - descuento),
      estado: 'Generada',
      creadaEn: new Date().toISOString(),
    };
    const ids = new Set(liquidacion.comisionIds);
    this.mutate(`Liquidación ${liquidacion.id}`, (d) => ({
      ...d,
      liquidaciones: [liquidacion, ...d.liquidaciones],
      comisiones: d.comisiones.map((c) => (ids.has(c.id) ? { ...c, liquidacionId: liquidacion.id } : c)),
      actividades: [this.actividad('blue', `Liquidación ${liquidacion.id}`, `${this.nombreMensajero(mensajeroId)}: ${liquidacion.neto} a pagar.`), ...d.actividades],
    }));
    return liquidacion;
  }

  pagarLiquidacion(id: string, pago: string): boolean {
    const l = this.liquidaciones().find((x) => x.id === id);
    if (l?.estado !== 'Generada' || !pago.trim()) return false;
    this.mutate(`Liquidación ${id} pagada`, (d) => ({
      ...d,
      liquidaciones: d.liquidaciones.map((x) => (x.id === id ? { ...x, estado: 'Pagada', pagadaEn: new Date().toISOString(), pago: pago.trim() } : x)),
      actividades: [this.actividad('teal', `Liquidación ${id} pagada`, `${this.nombreMensajero(l.mensajeroId)}: ${pago.trim()}.`), ...d.actividades],
    }));
    return true;
  }

  anularLiquidacion(id: string): boolean {
    const l = this.liquidaciones().find((x) => x.id === id);
    if (l?.estado !== 'Generada') return false;
    this.mutate(`Liquidación ${id} anulada`, (d) => ({
      ...d,
      liquidaciones: d.liquidaciones.map((x) => (x.id === id ? { ...x, estado: 'Anulada' } : x)),
      comisiones: d.comisiones.map((c) => (c.liquidacionId === id ? { ...c, liquidacionId: null } : c)),
    }));
    return true;
  }

  resumenPagos() {
    const ingresos = this.envios().filter((e) => e.estado === 'Entregado').reduce((t, e) => t + e.importe, 0);
    const comisionado = this.comisiones().reduce((t, c) => t + c.monto, 0);
    const pendiente = this.comisiones().filter((c) => this.estadoComision(c) !== 'Pagada').reduce((t, c) => t + c.monto, 0);
    const pagado = this.liquidaciones().filter((l) => l.estado === 'Pagada').reduce((t, l) => t + l.neto, 0);
    return {
      ingresos: this.redondear(ingresos),
      comisionado: this.redondear(comisionado),
      pendiente: this.redondear(pendiente),
      pagado: this.redondear(pagado),
      margen: this.redondear(ingresos - comisionado),
    };
  }

  gananciasDe(mensajeroId: string) {
    const propias = this.comisiones().filter((c) => c.mensajeroId === mensajeroId);
    const ahora = new Date();
    const lunes = new Date(ahora);
    lunes.setDate(ahora.getDate() - ((ahora.getDay() + 6) % 7));
    const hoy = hoyISO(ahora);
    const semana = hoyISO(lunes);
    const mes = hoy.slice(0, 7);
    const suma = (lista: Comision[]) => this.redondear(lista.reduce((t, c) => t + c.monto, 0));
    return {
      hoy: suma(propias.filter((c) => fechaLocal(c.fecha) === hoy)),
      semana: suma(propias.filter((c) => fechaLocal(c.fecha) >= semana)),
      mes: suma(propias.filter((c) => fechaLocal(c.fecha).startsWith(mes))),
      pendiente: suma(propias.filter((c) => this.estadoComision(c) !== 'Pagada')),
      cobrado: this.redondear(this.liquidaciones().filter((l) => l.mensajeroId === mensajeroId && l.estado === 'Pagada').reduce((t, l) => t + l.neto, 0)),
    };
  }

  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private comisionar(base: Omit<Comision, 'id' | 'fecha' | 'liquidacionId'>) {
    if (!(base.monto > 0)) return;
    const comision: Comision = { ...base, id: crypto.randomUUID(), fecha: new Date().toISOString(), liquidacionId: null };
    this.mutate(`Comisión ${base.concepto} de ${base.envioId}`, (d) => ({ ...d, comisiones: [comision, ...d.comisiones] }));
  }

  private comisionarSobreTarifa(envio: Envio, concepto: ConceptoComision, factor = 100) {
    if (!envio.mensajeroId) return;
    const porcentaje = this.redondear((this.porcentajeDe(envio.mensajeroId, envio.zonaId) * factor) / 100);
    this.comisionar({
      mensajeroId: envio.mensajeroId, envioId: envio.id, retiroId: envio.retiroId, concepto,
      base: envio.importe, porcentaje, monto: this.redondear((envio.importe * porcentaje) / 100),
    });
  }

  movimientosDe(productoId: string): MovimientoStock[] {
    return this.movimientos().filter((m) => m.productoId === productoId);
  }

  private hito(estado: EstadoEnvio, detalle: string, fecha = new Date().toISOString()): HitoEnvio {
    return { estado, fecha, detalle };
  }

  private nuevoMovimiento(base: Omit<MovimientoStock, 'id' | 'creadoEn'>): MovimientoStock {
    return { ...base, id: crypto.randomUUID(), creadoEn: new Date().toISOString() };
  }

  private validarStock(nuevos: ItemEnvio[], previos: ItemEnvio[]) {
    for (const item of nuevos) {
      const producto = this.productos().find((p) => p.id === item.productoId);
      if (!producto) continue;
      const reservado = previos.find((i) => i.productoId === item.productoId)?.cantidad ?? 0;
      const disponible = producto.stock + reservado;
      if (item.cantidad > disponible) {
        throw new StockInsuficienteError(`${producto.nombre}: pediste ${item.cantidad} y hay ${disponible} en stock.`);
      }
    }
  }

  private moverStock(
    d: DB,
    envio: Pick<Envio, 'id' | 'clienteId' | 'retiro'>,
    previos: ItemEnvio[],
    nuevos: ItemEnvio[],
    tipo: TipoMovimiento,
  ): Pick<DB, 'productos' | 'movimientos'> {
    const efectos = new Map<string, number>();
    for (const i of previos) efectos.set(i.productoId, (efectos.get(i.productoId) ?? 0) + i.cantidad);
    for (const i of nuevos) efectos.set(i.productoId, (efectos.get(i.productoId) ?? 0) - i.cantidad);
    let productos = d.productos;
    const movimientos: MovimientoStock[] = [];
    for (const [productoId, cantidad] of efectos) {
      const producto = productos.find((p) => p.id === productoId);
      if (!producto || cantidad === 0) continue;
      const saldo = producto.stock + cantidad;
      productos = productos.map((p) => (p.id === productoId ? { ...p, stock: saldo } : p));
      movimientos.push(
        this.nuevoMovimiento({ clienteId: envio.clienteId, productoId, producto: producto.nombre, tipo, cantidad, saldo, envioId: envio.id, retiro: envio.retiro, nota: '' }),
      );
    }
    return { productos, movimientos: [...movimientos, ...d.movimientos] };
  }

  private editablePor(id: string, clienteId: string): boolean {
    return this.envios().some((e) => e.id === id && e.clienteId === clienteId && this.editableCliente(e));
  }

  private camposDeEnvio(
    input: NuevoEnvio,
    clienteId: string,
    previo?: Envio,
  ): Pick<Envio, 'destinatario' | 'telefono' | 'direccion' | 'localidad' | 'zonaId' | 'importe' | 'retiro' | 'origen' | 'items' | 'fechaRetiro' | 'retiroProgramado' | 'franja'> {
    const cliente = this.clientes().find((c) => c.id === clienteId);
    const retiro = input.retiro ?? 'deposito';
    const zona = zonaDe(input.localidad);
    return {
      destinatario: input.destinatario,
      telefono: input.telefono,
      direccion: input.direccion,
      localidad: input.localidad,
      zonaId: zona?.id ?? '',
      importe: zona?.tarifa ?? 2200,
      retiro,
      ...this.fechaDeRetiro(input, retiro, previo),
      origen: retiro === 'domicilio' && cliente ? direccionCompleta(cliente) : '',
      items: this.armarItems(input.items ?? [], clienteId),
    };
  }

  private fechaDeRetiro(
    input: NuevoEnvio,
    retiro: 'domicilio' | 'deposito',
    previo?: Envio,
  ): { fechaRetiro: string; retiroProgramado: boolean; franja: Franja | null } {
    const programado = input.programado === true && !!input.fechaRetiro && input.fechaRetiro >= hoyISO();
    if (programado) {
      return { fechaRetiro: input.fechaRetiro!, retiroProgramado: true, franja: retiro === 'domicilio' ? (input.franja ?? 'manana') : null };
    }
    const conservar = previo && previo.estado !== 'Borrador' && !previo.retiroProgramado && previo.fechaRetiro;
    return { fechaRetiro: conservar ? previo.fechaRetiro! : this.proximaFechaRetiro(), retiroProgramado: false, franja: null };
  }

  private armarItems(pedidos: { productoId: string; cantidad: number }[], clienteId: string): ItemEnvio[] {
    const agrupados = new Map<string, ItemEnvio>();
    for (const pedido of pedidos) {
      const producto = this.productos().find((p) => p.id === pedido.productoId && p.clienteId === clienteId);
      const cantidad = Math.floor(pedido.cantidad);
      if (!producto || !(cantidad >= 1)) continue;
      const previo = agrupados.get(producto.id);
      agrupados.set(
        producto.id,
        previo
          ? { ...previo, cantidad: previo.cantidad + cantidad }
          : {
              productoId: producto.id, nombre: producto.nombre, cantidad, precio: producto.precio, peso: producto.peso,
              alto: producto.alto, ancho: producto.ancho, largo: producto.largo,
            },
      );
    }
    return [...agrupados.values()];
  }

  private nuevoUsuario(base: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'estado'> & Partial<Usuario>): Usuario {
    return {
      id: `u${this.nextNumber(this.usuarios().map((u) => u.id), 0)}`,
      claveHash: null,
      sal: null,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      ultimoAcceso: null,
      versionSesion: 1,
      creadoEn: new Date().toISOString(),
      ...base,
    };
  }

  private actividad(tono: Actividad['tono'], titulo: string, detalle: string): Actividad {
    return { id: crypto.randomUUID(), tono, titulo, detalle, fecha: new Date().toISOString() };
  }

  private nextNumber(ids: string[], base: number): number {
    const max = ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, '')) || 0), base);
    return max + 1;
  }

  private mutate(motivo: string, fn: (d: DB) => DB) {
    this.db.update(fn);
    guardarDB(this.db());
    this.log(motivo);
  }

  private log(motivo: string) {
    const bruto = this.db();
    const d = { ...bruto, usuarios: bruto.usuarios.map(({ claveHash: _h, sal: _s, ...u }) => u) };
    console.groupCollapsed(`[Flexya] ${motivo}`);
    console.log('DB completa:', d);
    (Object.keys(d) as (keyof typeof d)[]).forEach((k) => {
      console.log(k);
      console.table(d[k]);
    });
    console.groupEnd();
  }
}
