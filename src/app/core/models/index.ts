export type Rol = 'admin' | 'cliente' | 'mensajero';

export type EstadoEnvio =
  | 'Pendiente'
  | 'Retiro asignado'
  | 'Retirado'
  | 'Retiro fallido'
  | 'Borrador'
  | 'En devolución'
  | 'Devuelto'
  | 'En depósito'
  | 'En revisión'
  | 'En reparto'
  | 'Entregado'
  | 'Incidencia'
  | 'Cancelado';

export * from './zonas';

export const CATEGORIAS = ['Indumentaria', 'Papelería', 'Hogar', 'Accesorios'] as const;

export type EstadoCuenta = 'PENDIENTE' | 'ACTIVO' | 'SUSPENDIDO';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  claveHash: string | null;
  sal: string | null;
  rol: Rol;
  estado: EstadoCuenta;
  intentosFallidos: number;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  versionSesion: number;
  creadoEn: string;
  clienteId?: string;
  mensajeroId?: string;
}

export type TipoToken = 'ACTIVACION' | 'RECUPERACION';

export interface TokenUsuario {
  id: string;
  usuarioId: string;
  tipo: TipoToken;
  tokenHash: string;
  expiraEn: string;
  usadoEn: string | null;
}

export const ESTADOS_MENSAJERO_ACTIVO: readonly EstadoEnvio[] = ['Retiro asignado', 'Retirado', 'En reparto', 'Incidencia'];

export const MAX_INTENTOS = 3;
export const MOTIVOS_INCIDENCIA = [
  { id: 'ausente', etiqueta: 'Destinatario ausente' },
  { id: 'direccion', etiqueta: 'Dirección incorrecta o inexistente' },
  { id: 'telefono', etiqueta: 'No atiende el teléfono' },
  { id: 'rechazo', etiqueta: 'Rechazó el paquete' },
  { id: 'danado', etiqueta: 'Paquete dañado' },
  { id: 'otro', etiqueta: 'Otro motivo' },
] as const;

export function enCursoMensajero(e: {
  estado: EstadoEnvio;
  mensajeroId: string | null;
  devolucionEntregadaEn?: string;
  retiro?: RetiroEnvio;
  entregadoEnDepositoEn?: string;
}): boolean {
  if (e.estado === 'Retirado' && e.retiro === 'recoleccion' && e.entregadoEnDepositoEn) return false;
  return ESTADOS_MENSAJERO_ACTIVO.includes(e.estado) || (e.estado === 'En devolución' && !!e.mensajeroId && !e.devolucionEntregadaEn);
}

export function enCustodiaFlexya(e: { estado: EstadoEnvio; retiro: RetiroEnvio; entregadoEnDepositoEn?: string }): boolean {
  return (
    ['En depósito', 'Retirado', 'En reparto', 'Incidencia', 'En devolución'].includes(e.estado) ||
    (e.estado === 'En revisión' && (e.retiro === 'deposito' || (e.retiro === 'recoleccion' && !!e.entregadoEnDepositoEn)))
  );
}

export interface CorreoSimulado {
  id: string;
  para: string;
  nombre: string;
  asunto: string;
  texto: string;
  enlace: string;
  tipo: TipoToken;
  fecha: string;
}

export const PLANES = [
  { id: 'Inicial', detalle: 'Pocos envíos al mes, para empezar' },
  { id: 'Crecimiento', detalle: 'Envíos frecuentes durante todo el mes' },
  { id: 'Corporativo', detalle: 'Gran volumen y atención dedicada' },
] as const;

export type TipoDocumento = 'DNI' | 'Pasaporte';

export type TipoCliente = 'persona' | 'empresa';

export const CONDICIONES_IVA = ['Responsable Inscripto', 'Monotributo', 'Exento', 'Consumidor Final'] as const;

export interface Cliente {
  id: string;
  tipoCliente: TipoCliente;
  nombre: string;
  nombreComercial: string;
  condicionIva: string;
  responsableNombre: string;
  responsableTelefono: string;
  telefono: string;
  plan: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  email: string;
  calle: string;
  altura: string;
  pisoDepto: string;
  localidad: string;
  zonaId: string;
  direccionVerificada: boolean;
  cuit: string;
  creadoEn: string;
}

export type ClienteInput = Omit<Cliente, 'id' | 'creadoEn'>;

export function formatoDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function identificacionCliente(c: Pick<Cliente, 'tipoCliente' | 'tipoDocumento' | 'numeroDocumento' | 'cuit'>): string {
  if (c.tipoCliente === 'empresa') return c.cuit ? `CUIT ${c.cuit}` : '—';
  return c.tipoDocumento === 'DNI' ? `DNI ${formatoDni(c.numeroDocumento)}` : `Pas. ${c.numeroDocumento}`;
}

export function direccionCompleta(c: Pick<Cliente, 'calle' | 'altura' | 'pisoDepto' | 'localidad'>): string {
  const piso = c.pisoDepto ? `, ${c.pisoDepto}` : '';
  const altura = c.altura ? ` ${c.altura}` : '';
  return `${c.calle}${altura}${piso}, ${c.localidad}`;
}

export interface Mensajero {
  id: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  telefono: string;
  telefonoEmergencia: string;
  email: string;
  zonaId: string;
  creadoEn: string;
}

export type MensajeroInput = Omit<Mensajero, 'id' | 'creadoEn'>;

export interface Envio {
  id: string;
  clienteId: string;
  destinatario: string;
  telefono: string;
  direccion: string;
  localidad: string;
  zonaId: string;
  estado: EstadoEnvio;
  eta: string;
  importe: number;
  mensajeroId: string | null;
  creadoEn: string;
  retiro: RetiroEnvio;
  origen: string;
  items: ItemEnvio[];
  nota?: string;
  recibidoPor?: string;
  entregadoEn?: string;
  historial: HitoEnvio[];
  fechaRetiro: string | null;
  retiroId: string;
  retiroProgramado: boolean;
  franja: Franja | null;
  intentos: number;
  motivoIncidencia?: string;
  devolucionEntregadaEn?: string;
  entregadoEnDepositoEn?: string;
}

export interface HitoEnvio {
  estado: EstadoEnvio;
  fecha: string;
  detalle: string;
}

export function hoyISO(base = new Date()): string {
  const mes = String(base.getMonth() + 1).padStart(2, '0');
  const dia = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${mes}-${dia}`;
}

export function sumarDiasISO(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return hoyISO(fecha);
}

export interface LoteDeposito {
  id: string;
  clienteId: string;
  categoria: string;
  unidades: number;
  ubicacion: string;
  recibidoEn: string;
}

export interface SolicitudRetiro {
  id: string;
  clienteId: string;
  loteId: string;
  unidades: number;
  ventana: string;
  notas: string;
  estado: 'Pendiente' | 'Aprobado';
  creadoEn: string;
}

export interface Actividad {
  id: string;
  tono: 'blue' | 'teal' | 'amber';
  titulo: string;
  detalle: string;
  fecha: string;
}

export interface DB {
  movimientos: MovimientoStock[];
  configOperacion: ConfigOperacion[];
  comisiones: Comision[];
  liquidaciones: Liquidacion[];
  configPagos: ConfigPagos[];
  usuarios: Usuario[];
  tokens: TokenUsuario[];
  correos: CorreoSimulado[];
  clientes: Cliente[];
  productos: Producto[];
  mensajeros: Mensajero[];
  envios: Envio[];
  lotes: LoteDeposito[];
  retiros: SolicitudRetiro[];
  actividades: Actividad[];
}

export interface Producto {
  id: string;
  clienteId: string;
  nombre: string;
  descripcion: string;
  precio: number | null;
  peso: number | null;
  alto: number | null;
  ancho: number | null;
  largo: number | null;
  stock: number;
  creadoEn: string;
}

export type ProductoInput = Omit<Producto, 'id' | 'clienteId' | 'creadoEn' | 'stock'> & { stock?: number };

export const STOCK_BAJO = 5;
export const STOCK_MAXIMO = 99_999;

export type TipoMovimiento = 'INICIAL' | 'AJUSTE' | 'ENVIO' | 'EDICION' | 'CANCELACION' | 'DEVOLUCION';

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  INICIAL: 'Stock inicial',
  AJUSTE: 'Ajuste manual',
  ENVIO: 'Reserva por envío',
  EDICION: 'Cambio en envío',
  CANCELACION: 'Envío cancelado',
  DEVOLUCION: 'Devolución recibida',
};

export interface MovimientoStock {
  id: string;
  clienteId: string;
  productoId: string;
  producto: string;
  tipo: TipoMovimiento;
  cantidad: number;
  saldo: number;
  envioId: string | null;
  retiro: RetiroEnvio | null;
  nota: string;
  creadoEn: string;
}

export function volumenProducto(p: { alto: number | null; ancho: number | null; largo: number | null }): number | null {
  const { alto, ancho, largo } = p;
  if (alto === null || ancho === null || largo === null || alto <= 0 || ancho <= 0 || largo <= 0) return null;
  return Math.round(alto * ancho * largo * 10) / 10;
}

export type RetiroEnvio = 'domicilio' | 'deposito' | 'recoleccion';

export function retiraElMensajero(retiro: RetiroEnvio): boolean {
  return retiro !== 'deposito';
}

export interface ItemEnvio {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number | null;
  peso: number | null;
  alto: number | null;
  ancho: number | null;
  largo: number | null;
}

export interface NuevoEnvio {
  destinatario: string;
  telefono: string;
  direccion: string;
  localidad: string;
  retiro?: RetiroEnvio;
  fechaRetiro?: string | null;
  programado?: boolean;
  franja?: Franja | null;
  borrador?: boolean;
  retiroId?: string;
  items?: { productoId: string; cantidad: number }[];
}

export interface NuevoDestino {
  destinatario: string;
  telefono: string;
  direccion: string;
  localidad: string;
  items: { productoId: string; cantidad: number }[];
}

export interface NuevoPedidoRetiro {
  retiro: RetiroEnvio;
  programado?: boolean;
  fechaRetiro?: string | null;
  franja?: Franja | null;
  borrador?: boolean;
  destinos: NuevoDestino[];
}

export function resumenItems(items: readonly Pick<ItemEnvio, 'cantidad' | 'peso'>[]): { unidades: number; peso: number | null; completo: boolean } {
  const unidades = items.reduce((total, i) => total + i.cantidad, 0);
  const conPeso = items.filter((i) => i.peso !== null);
  const peso = conPeso.length ? Math.round(conPeso.reduce((total, i) => total + (i.peso as number) * i.cantidad, 0) * 1000) / 1000 : null;
  return { unidades, peso, completo: conPeso.length === items.length };
}
export type NuevoLote = Pick<LoteDeposito, 'clienteId' | 'categoria' | 'unidades' | 'ubicacion'>;
export type NuevoRetiro = Pick<SolicitudRetiro, 'loteId' | 'unidades' | 'ventana' | 'notas'>;

export type ConceptoComision = 'ENTREGA' | 'INTENTO_FALLIDO' | 'RETIRO' | 'DEVOLUCION';

export const ETIQUETA_COMISION: Record<ConceptoComision, string> = {
  ENTREGA: 'Entrega',
  INTENTO_FALLIDO: 'Intento fallido',
  RETIRO: 'Retiro',
  DEVOLUCION: 'Devolución',
};

export interface Comision {
  id: string;
  mensajeroId: string;
  envioId: string;
  retiroId: string;
  concepto: ConceptoComision;
  base: number;
  porcentaje: number;
  monto: number;
  fecha: string;
  liquidacionId: string | null;
}

export type EstadoComision = 'Pendiente' | 'Liquidada' | 'Pagada';

export interface AjusteLiquidacion {
  concepto: string;
  monto: number;
}

export interface Liquidacion {
  id: string;
  mensajeroId: string;
  desde: string;
  hasta: string;
  comisionIds: string[];
  bruto: number;
  ajustes: AjusteLiquidacion[];
  neto: number;
  estado: 'Generada' | 'Pagada' | 'Anulada';
  creadaEn: string;
  pagadaEn?: string;
  pago?: string;
}

export interface ConfigPagos {
  porcentajeGeneral: number;
  porZona: Record<string, number>;
  porMensajero: Record<string, number>;
  porcentajeIntentoFallido: number;
  porcentajeDevolucion: number;
  adicionalRetiro: number;
}

export const CONFIG_PAGOS_DEFECTO: ConfigPagos = {
  porcentajeGeneral: 60,
  porZona: {},
  porMensajero: {},
  porcentajeIntentoFallido: 0,
  porcentajeDevolucion: 0,
  adicionalRetiro: 0,
};

export function fechaLocal(iso: string): string {
  return hoyISO(new Date(iso));
}

export type Franja = 'manana' | 'tarde';

export const ETIQUETA_FRANJA: Record<Franja, string> = {
  manana: 'Mañana (9 a 13)',
  tarde: 'Tarde (14 a 18)',
};

export interface ConfigOperacion {
  horaCorte: number;
  feriados: string[];
  recargoRecoleccion: number;
}

export const OPERACION_DEFECTO: ConfigOperacion = { horaCorte: 14, feriados: [], recargoRecoleccion: 0 };

export function fechaDesdeISO(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

export function esDiaHabilISO(iso: string, feriados: readonly string[]): boolean {
  const diaSemana = fechaDesdeISO(iso).getDay();
  return diaSemana !== 0 && diaSemana !== 6 && !feriados.includes(iso);
}

export function proximaFechaHabil(ahora: Date, config: ConfigOperacion): string {
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() >= config.horaCorte) dia.setDate(dia.getDate() + 1);
  for (let i = 0; i < 400 && !esDiaHabilISO(hoyISO(dia), config.feriados); i++) dia.setDate(dia.getDate() + 1);
  return hoyISO(dia);
}
