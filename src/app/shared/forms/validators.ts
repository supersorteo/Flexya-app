import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { LOCALIDADES } from '../../core/models/zonas';

export const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

const PREFIJOS_CUIL = ['20', '23', '24', '27', '30', '33', '34'];
const PESOS_CUIL = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function cuilValido(valor: string): boolean {
  const d = soloDigitos(valor);
  if (d.length !== 11 || !PREFIJOS_CUIL.includes(d.slice(0, 2))) return false;
  const suma = PESOS_CUIL.reduce((s, peso, i) => s + peso * Number(d[i]), 0);
  const r = 11 - (suma % 11);
  const verificador = r === 11 ? 0 : r;
  return verificador < 10 && verificador === Number(d[10]);
}

export const nombreValidator: ValidatorFn = (c) =>
  !String(c.value ?? '').trim() || /^[\p{L}\p{N}][\p{L}\p{N} .,&'’-]*$/u.test(String(c.value).trim()) ? null : { nombre: true };

export const personaValidator: ValidatorFn = (c) => {
  const v = String(c.value ?? '').trim();
  return !v || /^\p{L}[\p{L}.'’-]*(\s+\p{L}[\p{L}.'’-]*)+$/u.test(v) ? null : { persona: true };
};

export const telefonoDistintoValidator: ValidatorFn = (c) => {
  const v = String(c.value ?? '');
  const principal = String(c.parent?.get('telefono')?.value ?? '');
  return v && principal && v === principal ? { mismoTelefono: true } : null;
};

export const telefonoValidator: ValidatorFn = (c) => {
  const v = String(c.value ?? '');
  if (!v) return null;
  return /^\d{10}$/.test(v) && !v.startsWith('0') && !v.startsWith('15') ? null : { telefono: true };
};

export function telefonoNacional(valor: string): string {
  const d = soloDigitos(valor);
  const sinPais = d.startsWith('549') ? d.slice(3) : d.startsWith('54') ? d.slice(2) : d;
  return sinPais.slice(-10);
}

export function formatearTelefono(nacional: string): string {
  return `+54 9 ${nacional.slice(0, 2)} ${nacional.slice(2, 6)} ${nacional.slice(6)}`;
}

export const emailValidator: ValidatorFn = (c) =>
  !c.value || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.value) ? null : { email: true };

export const calleValidator: ValidatorFn = (c) =>
  !c.value || /^(?=.*[\p{L}\p{N}])[\p{L}\p{N} .,'’°º/&#-]+$/u.test(c.value) ? null : { calle: true };

export const alturaValidator: ValidatorFn = (c) =>
  !c.value || /^[1-9]\d{0,4}$/.test(c.value) ? null : { altura: true };

export const pisoValidator: ValidatorFn = (c) =>
  !c.value || /^[\p{L}\p{N} °º./-]{1,12}$/u.test(c.value) ? null : { piso: true };

export const localidadValidator: ValidatorFn = (c) =>
  !c.value || LOCALIDADES.includes(c.value) ? null : { localidad: true };

export const documentoValidator: ValidatorFn = (c) => {
  const v = String(c.value ?? '');
  if (!v) return null;
  const tipo = c.parent?.get('tipoDocumento')?.value;
  if (tipo === 'DNI') return /^\d{7,8}$/.test(v) ? null : { dni: true };
  return /^[A-Z0-9]{6,9}$/.test(v) && /\d/.test(v) ? null : { pasaporte: true };
};

const PREFIJOS_EMPRESA = ['30', '33', '34'];
const PREFIJOS_PERSONA = ['20', '23', '24', '27'];

export const cuitValidator: ValidatorFn = (c) => {
  const v = String(c.value ?? '');
  const empresa = c.parent?.get('tipoCliente')?.value === 'empresa';
  if (!v) return empresa ? { required: true } : null;
  if (!cuilValido(v)) return { cuil: true };
  const prefijo = soloDigitos(v).slice(0, 2);
  if (empresa) return PREFIJOS_EMPRESA.includes(prefijo) ? null : { cuitEmpresa: true };
  if (!PREFIJOS_PERSONA.includes(prefijo)) return { cuilPersona: true };
  const tipo = c.parent?.get('tipoDocumento')?.value;
  const dni = String(c.parent?.get('numeroDocumento')?.value ?? '');
  if (tipo === 'DNI' && /^\d{7,8}$/.test(dni) && soloDigitos(v).slice(2, 10) !== dni.padStart(8, '0')) {
    return { cuilDni: true };
  }
  return null;
};

export const nombreClienteValidator: ValidatorFn = (c) =>
  c.parent?.get('tipoCliente')?.value === 'empresa' ? nombreValidator(c) : personaValidator(c);

export function unico(existe: (valor: string, control: AbstractControl) => boolean): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null =>
    c.value && existe(String(c.value), c) ? { duplicado: true } : null;
}

export type FuerzaClave = 0 | 1 | 2 | 3 | 4;

export function evaluarClave(clave: string) {
  const longitud = clave.length >= 8;
  const letra = /\p{L}/u.test(clave);
  const numero = /\d/.test(clave);
  const mezcla = /\p{Ll}/u.test(clave) && /\p{Lu}/u.test(clave);
  const simbolo = /[^\p{L}\d]/u.test(clave);
  const puntos = [longitud, clave.length >= 12, mezcla, letra && numero, simbolo].filter(Boolean).length;
  return { longitud, letra, numero, fuerza: Math.min(4, puntos) as FuerzaClave };
}

export const claveValida = (clave: string) => {
  const e = evaluarClave(clave);
  return e.longitud && e.letra && e.numero;
};

export const claveValidator: ValidatorFn = (c) => (!c.value || claveValida(String(c.value)) ? null : { clave: true });

export const coincidenValidator =
  (campo: string, confirmacion: string): ValidatorFn =>
  (g) => {
    const a = g.get(campo)?.value;
    const b = g.get(confirmacion)?.value;
    return a && b && a !== b ? { noCoinciden: true } : null;
  };

export const aNumero = (texto: unknown): number => Number(String(texto ?? '').replace(',', '.'));

export const aNumeroONulo = (texto: unknown): number | null => (String(texto ?? '').trim() === '' ? null : aNumero(texto));

export const decimalValidator =
  (min: number, max: number): ValidatorFn =>
  (c) => {
    const v = String(c.value ?? '');
    if (!v) return null;
    if (!/^\d+(,\d*)?$/.test(v)) return { decimal: true };
    const n = aNumero(v);
    return n < min || n > max ? { rango: true } : null;
  };

export const productoNombreValidator: ValidatorFn = (c) =>
  !String(c.value ?? '').trim() || /^[\p{L}\p{N}][\p{L}\p{N} .,&'’\-/()+#%º°]*$/u.test(String(c.value).trim()) ? null : { nombre: true };

export const enteroValidator =
  (min: number, max: number): ValidatorFn =>
  (c) => {
    const v = String(c.value ?? '');
    if (!v) return null;
    if (!/^\d+$/.test(v)) return { entero: true };
    const n = Number(v);
    return n < min || n > max ? { rango: true } : null;
  };

export const direccionEnvioValidator: ValidatorFn = (c) =>
  !String(c.value ?? '').trim() || /^(?=.*\p{L})(?=.*\d)[\p{L}\p{N} .,'’°º/#&()\-]+$/u.test(String(c.value).trim()) ? null : { direccion: true };
