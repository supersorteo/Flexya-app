export type GrupoZona = 'CABA' | 'GBA' | 'La Plata';

export interface Zona {
  id: string;
  nombre: string;
  grupo: GrupoZona;
  tarifa: number;
  localidades: readonly string[];
}

export const ZONAS: readonly Zona[] = [
  {
    id: 'caba-centro', nombre: 'CABA Centro', grupo: 'CABA', tarifa: 2200,
    localidades: ['Balvanera', 'Constitución', 'Monserrat', 'Puerto Madero', 'Retiro', 'San Cristóbal', 'San Nicolás', 'San Telmo'],
  },
  {
    id: 'caba-norte', nombre: 'CABA Norte', grupo: 'CABA', tarifa: 2200,
    localidades: ['Agronomía', 'Belgrano', 'Chacarita', 'Coghlan', 'Colegiales', 'La Paternal', 'Núñez', 'Palermo', 'Parque Chas', 'Recoleta', 'Saavedra', 'Villa Ortúzar', 'Villa Pueyrredón', 'Villa Urquiza'],
  },
  {
    id: 'caba-oeste', nombre: 'CABA Oeste', grupo: 'CABA', tarifa: 2200,
    localidades: ['Almagro', 'Boedo', 'Caballito', 'Flores', 'Floresta', 'Liniers', 'Monte Castro', 'Parque Chacabuco', 'Vélez Sarsfield', 'Versalles', 'Villa Crespo', 'Villa del Parque', 'Villa Devoto', 'Villa General Mitre', 'Villa Luro', 'Villa Real', 'Villa Santa Rita'],
  },
  {
    id: 'caba-sur', nombre: 'CABA Sur', grupo: 'CABA', tarifa: 2200,
    localidades: ['Barracas', 'La Boca', 'Mataderos', 'Nueva Pompeya', 'Parque Avellaneda', 'Parque Patricios', 'Villa Lugano', 'Villa Riachuelo', 'Villa Soldati'],
  },
  {
    id: 'gba-norte', nombre: 'GBA Norte', grupo: 'GBA', tarifa: 3200,
    localidades: ['Escobar', 'General San Martín', 'José C. Paz', 'Malvinas Argentinas', 'Pilar', 'San Fernando', 'San Isidro', 'San Miguel', 'Tigre', 'Vicente López'],
  },
  {
    id: 'gba-oeste', nombre: 'GBA Oeste', grupo: 'GBA', tarifa: 3200,
    localidades: ['Hurlingham', 'Ituzaingó', 'La Matanza', 'Merlo', 'Morón', 'Moreno', 'Tres de Febrero'],
  },
  {
    id: 'gba-sur', nombre: 'GBA Sur', grupo: 'GBA', tarifa: 3200,
    localidades: ['Almirante Brown', 'Avellaneda', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'Lanús', 'Lomas de Zamora', 'Quilmes'],
  },
  {
    id: 'la-plata', nombre: 'La Plata', grupo: 'La Plata', tarifa: 4500,
    localidades: ['Berisso', 'Ensenada', 'La Plata'],
  },
];

export const LOCALIDADES: readonly string[] = ZONAS.flatMap((z) => z.localidades);

export function zonaDe(localidad: string): Zona | undefined {
  return ZONAS.find((z) => z.localidades.includes(localidad));
}

export function zonaPorId(id: string): Zona | undefined {
  return ZONAS.find((z) => z.id === id);
}
