export type Rol = 'admin' | 'cliente' | 'mensajero';

export type EstadoEnvio =
  | 'Pendiente'
  | 'En depósito'
  | 'En reparto'
  | 'Entregado'
  | 'Incidencia'
  | 'Cancelado';

export * from './zonas';

export const CATEGORIAS = ['Indumentaria', 'Papelería', 'Hogar', 'Accesorios'] as const;

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
  clienteId?: string;
  mensajeroId?: string;
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
  nota?: string;
  recibidoPor?: string;
  entregadoEn?: string;
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
  usuarios: Usuario[];
  clientes: Cliente[];
  mensajeros: Mensajero[];
  envios: Envio[];
  lotes: LoteDeposito[];
  retiros: SolicitudRetiro[];
  actividades: Actividad[];
}

export type NuevoEnvio = Pick<Envio, 'destinatario' | 'telefono' | 'direccion' | 'localidad'>;
export type NuevoLote = Pick<LoteDeposito, 'clienteId' | 'categoria' | 'unidades' | 'ubicacion'>;
export type NuevoRetiro = Pick<SolicitudRetiro, 'loteId' | 'unidades' | 'ventana' | 'notas'>;
