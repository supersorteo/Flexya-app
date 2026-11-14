import { telefonoNacional } from '../forms/validators';

function nacional(telefono: string): string | null {
  const n = telefonoNacional(telefono);
  return /^\d{10}$/.test(n) ? n : null;
}

export function telefonoLink(telefono: string): string | null {
  const n = nacional(telefono);
  return n ? `tel:+549${n}` : null;
}

export function whatsappLink(telefono: string, mensaje = ''): string | null {
  const n = nacional(telefono);
  if (!n) return null;
  return `https://wa.me/549${n}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}

export function mapaLink(direccion: string, localidad: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${direccion}, ${localidad}, Argentina`)}`;
}
