const ITERACIONES = 100_000;

const aHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export const generarSal = () => aHex(crypto.getRandomValues(new Uint8Array(16)));

export const generarToken = () => aHex(crypto.getRandomValues(new Uint8Array(32)));

export async function hashClave(clave: string, sal: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(sal), iterations: ITERACIONES, hash: 'SHA-256' },
    material,
    256,
  );
  return aHex(bits);
}

export async function hashToken(token: string): Promise<string> {
  return aHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}
