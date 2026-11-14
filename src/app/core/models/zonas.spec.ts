import { LOCALIDADES, ZONAS, zonaDe } from './zonas';

describe('Zonas de Buenos Aires', () => {
  it('CABA tiene los 48 barrios, cada uno en una sola zona', () => {
    const caba = ZONAS.filter((z) => z.grupo === 'CABA').flatMap((z) => z.localidades);
    expect(caba.length).toBe(48);
    expect(new Set(caba).size).toBe(48);
  });

  it('no hay localidades repetidas entre zonas', () => {
    expect(new Set(LOCALIDADES).size).toBe(LOCALIDADES.length);
  });

  it('los 24 partidos del conurbano están cubiertos', () => {
    const partidos = ['Almirante Brown', 'Avellaneda', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'General San Martín', 'Hurlingham', 'Ituzaingó', 'José C. Paz', 'La Matanza', 'Lanús', 'Lomas de Zamora', 'Malvinas Argentinas', 'Merlo', 'Moreno', 'Morón', 'Quilmes', 'San Fernando', 'San Isidro', 'San Miguel', 'Tigre', 'Tres de Febrero', 'Vicente López'];
    expect(partidos.filter((p) => !zonaDe(p))).toEqual([]);
  });
});
