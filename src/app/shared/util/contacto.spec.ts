import { mapaLink, telefonoLink, whatsappLink } from './contacto';

describe('Enlaces de contacto', () => {
  it('arma el enlace para llamar con el código de país', () => {
    expect(telefonoLink('11 5555 0000')).toBe('tel:+5491155550000');
    expect(telefonoLink('+54 9 11 5555 0000')).toBe('tel:+5491155550000');
  });

  it('arma el enlace de WhatsApp con el mensaje codificado', () => {
    expect(whatsappLink('11 5555 0000')).toBe('https://wa.me/5491155550000');
    expect(whatsappLink('11 5555 0000', 'Hola, ¿estás?')).toBe('https://wa.me/5491155550000?text=Hola%2C%20%C2%BFest%C3%A1s%3F');
  });

  it('no arma enlaces si el teléfono no tiene 10 dígitos', () => {
    expect(telefonoLink('5555 0000')).toBeNull();
    expect(whatsappLink('123')).toBeNull();
    expect(telefonoLink('')).toBeNull();
  });

  it('arma el enlace del mapa con la dirección y la localidad', () => {
    expect(mapaLink('Av. Cabildo 1840', 'Belgrano')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Av.%20Cabildo%201840%2C%20Belgrano%2C%20Argentina',
    );
  });
});
