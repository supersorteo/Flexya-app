export interface GeorefDepto {
  provincia: string;
  departamento: string;
  etiqueta: string;
}

const BARRIOS_POR_COMUNA: Record<number, readonly string[]> = {
  1: ['Retiro', 'San Nicolás', 'Puerto Madero', 'San Telmo', 'Monserrat', 'Constitución'],
  2: ['Recoleta'],
  3: ['Balvanera', 'San Cristóbal'],
  4: ['La Boca', 'Barracas', 'Parque Patricios', 'Nueva Pompeya'],
  5: ['Almagro', 'Boedo'],
  6: ['Caballito'],
  7: ['Flores', 'Parque Chacabuco'],
  8: ['Villa Soldati', 'Villa Riachuelo', 'Villa Lugano'],
  9: ['Liniers', 'Mataderos', 'Parque Avellaneda'],
  10: ['Villa Real', 'Monte Castro', 'Versalles', 'Floresta', 'Vélez Sarsfield', 'Villa Luro'],
  11: ['Villa General Mitre', 'Villa Devoto', 'Villa del Parque', 'Villa Santa Rita'],
  12: ['Coghlan', 'Saavedra', 'Villa Urquiza', 'Villa Pueyrredón'],
  13: ['Núñez', 'Belgrano', 'Colegiales'],
  14: ['Palermo'],
  15: ['Chacarita', 'Villa Crespo', 'La Paternal', 'Villa Ortúzar', 'Agronomía', 'Parque Chas'],
};

const PARTIDOS_BA: Record<string, string> = {
  'Almirante Brown': '06028',
  Avellaneda: '06035',
  Berazategui: '06091',
  Berisso: '06098',
  Ensenada: '06245',
  Escobar: '06252',
  'Esteban Echeverría': '06260',
  Ezeiza: '06270',
  'Florencio Varela': '06274',
  'General San Martín': '06371',
  Hurlingham: '06408',
  'Ituzaingó': '06410',
  'José C. Paz': '06412',
  'La Matanza': '06427',
  'La Plata': '06441',
  'Lanús': '06434',
  'Lomas de Zamora': '06490',
  'Malvinas Argentinas': '06515',
  Merlo: '06539',
  Moreno: '06560',
  'Morón': '06568',
  Pilar: '06638',
  Quilmes: '06658',
  'San Fernando': '06749',
  'San Isidro': '06756',
  'San Miguel': '06760',
  Tigre: '06805',
  'Tres de Febrero': '06840',
  'Vicente López': '06861',
};

const COMUNA_DE_BARRIO = new Map<string, number>(
  Object.entries(BARRIOS_POR_COMUNA).flatMap(([comuna, barrios]) => barrios.map((b) => [b, Number(comuna)] as const)),
);

export function georefDe(localidad: string): GeorefDepto | null {
  const comuna = COMUNA_DE_BARRIO.get(localidad);
  if (comuna) {
    return { provincia: '02', departamento: `02${String(comuna * 7).padStart(3, '0')}`, etiqueta: `Comuna ${comuna}` };
  }
  const partido = PARTIDOS_BA[localidad];
  return partido ? { provincia: '06', departamento: partido, etiqueta: localidad } : null;
}
