import { detallePendiente, tarjetaGanancias } from './tarjeta-ganancias';

const pesos = (n: number) => `$${n}`;
const g = (extra: Partial<Parameters<typeof tarjetaGanancias>[0]> = {}) => ({ hoy: 0, semana: 0, pendiente: 0, acumulado: 0, liquidado: 0, cobrado: 0, ultimoPago: null, ...extra });
const pagado = (importe: number, dia = 14) => ({ importe, fecha: new Date(2030, 0, dia, 12).toISOString() });

describe('Tarjeta de dinero del mensajero', () => {
  describe('mientras falte cobrar', () => {
    it('dice "A cobrar" con la cifra que va a recibir', () => {
      expect(tarjetaGanancias(g({ pendiente: 3000, acumulado: 3000 }), pesos)).toMatchObject({ label: 'A cobrar', value: '$3000', tone: 'amber' });
    });

    it('lo ya liquidado cuenta por lo que realmente le van a pagar, y lo dice', () => {
      const t = tarjetaGanancias(g({ pendiente: 7773, liquidado: 7773 }), pesos);
      expect(t).toMatchObject({ label: 'A cobrar', value: '$7773', foot: 'Ya liquidado: falta que te lo paguen' });
    });

    it('si tiene de las dos cosas, las separa', () => {
      expect(detallePendiente({ acumulado: 1200, liquidado: 7773 }, pesos)).toBe('$7773 por pagar y $1200 sin liquidar');
      expect(detallePendiente({ acumulado: 1200, liquidado: 0 }, pesos)).toBe('Lo que ganaste, todavía sin liquidar');
      expect(detallePendiente({ acumulado: 0, liquidado: 0 }, pesos)).toBe('No tenés nada pendiente');
    });

    it('se mantiene igual aunque ya haya cobrado antes', () => {
      const t = tarjetaGanancias(g({ pendiente: 500, acumulado: 500, cobrado: 9000, ultimoPago: pagado(9000) }), pesos);
      expect(t).toMatchObject({ label: 'A cobrar', value: '$500' });
    });
  });

  describe('al cobrarse', () => {
    it('la misma tarjeta pasa a decir "Cobrado" con la cifra que le pagaron', () => {
      const antes = tarjetaGanancias(g({ pendiente: 7773, liquidado: 7773 }), pesos);
      const despues = tarjetaGanancias(g({ cobrado: 7773, ultimoPago: pagado(7773) }), pesos);
      expect(antes).toMatchObject({ label: 'A cobrar', value: '$7773' });
      expect(despues).toMatchObject({ label: 'Cobrado', value: '$7773', tone: 'teal', foot: 'Pagado el 14/01' });
    });

    it('con varios pagos muestra el último y, abajo, el total', () => {
      const t = tarjetaGanancias(g({ cobrado: 12000, ultimoPago: pagado(7773, 20) }), pesos);
      expect(t).toMatchObject({ label: 'Cobrado', value: '$7773', foot: 'Pagado el 20/01 · $12000 en total' });
    });

    it('nunca muestra la ganancia bruta ni los descuentos', () => {
      const t = tarjetaGanancias(g({ semana: 8500, cobrado: 7773, ultimoPago: pagado(7773) }), pesos);
      expect(`${t.value} ${t.foot}`).not.toContain('8500');
      expect(`${t.value} ${t.foot}`).not.toContain('descuento');
    });
  });

  it('sin nada de nada invita a completar una entrega', () => {
    expect(tarjetaGanancias(g(), pesos)).toMatchObject({ label: 'A cobrar', value: '$0', foot: 'Aparece cuando completes una entrega' });
  });
});
