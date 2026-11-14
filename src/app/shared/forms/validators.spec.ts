import { FormControl, FormGroup } from '@angular/forms';
import { aplicarMascara } from './mask.directive';
import {
  aNumero, aNumeroONulo, direccionEnvioValidator, enteroValidator, decimalValidator, productoNombreValidator, alturaValidator, calleValidator, localidadValidator, pisoValidator, cuilValido, cuitValidator, documentoValidator, emailValidator, formatearTelefono, telefonoNacional, telefonoValidator,
} from './validators';

describe('Validadores de cliente', () => {
  it('CUIL: valida prefijo y dígito verificador', () => {
    expect(cuilValido('27-28456123-1')).toBe(true);
    expect(cuilValido('20-25678902-8')).toBe(true);
    expect(cuilValido('20-12345678-6')).toBe(true);
    expect(cuilValido('27-28456123-2')).toBe(false);
    expect(cuilValido('99-28456123-1')).toBe(false);
    expect(cuilValido('2728456')).toBe(false);
  });

  it('CUIL debe coincidir con el DNI', () => {
    const g = new FormGroup({
      tipoDocumento: new FormControl('DNI'),
      numeroDocumento: new FormControl('30211876'),
      tipoCliente: new FormControl('persona'),
      cuit: new FormControl('27-28456123-1', cuitValidator),
    });
    g.controls['cuit'].updateValueAndValidity();
    expect(g.controls['cuit'].errors).toEqual({ cuilDni: true });
    g.controls['cuit'].setValue('27-30211876-6');
    expect(g.controls['cuit'].errors).toBeNull();
  });

  it('CUIT de empresa: obligatorio y con prefijo 30, 33 o 34', () => {
    const g = new FormGroup({ tipoCliente: new FormControl('empresa'), cuit: new FormControl('', cuitValidator) });
    const cuit = g.controls['cuit'];
    cuit.updateValueAndValidity();
    expect(cuit.errors).toEqual({ required: true });
    for (const ok of ['30-71234567-1', '33-12345678-0', '34-12345678-7', '30-50001091-2']) {
      cuit.setValue(ok);
      expect(cuit.errors).toBeNull();
    }
    cuit.setValue('27-28456123-1');
    expect(cuit.errors).toEqual({ cuitEmpresa: true });
    cuit.setValue('30-71234567-2');
    expect(cuit.errors).toEqual({ cuil: true });
  });

  it('CUIL de persona: opcional y sin prefijo de empresa', () => {
    const g = new FormGroup({ tipoCliente: new FormControl('persona'), cuit: new FormControl('', cuitValidator) });
    const cuit = g.controls['cuit'];
    expect(cuit.errors).toBeNull();
    cuit.setValue('30-71234567-1');
    expect(cuit.errors).toEqual({ cuilPersona: true });
    cuit.setValue('20-12345678-6');
    expect(cuit.errors).toBeNull();
  });

  it('DNI 7-8 dígitos y pasaporte alfanumérico con número', () => {
    const g = new FormGroup({ tipoDocumento: new FormControl('DNI'), numeroDocumento: new FormControl('', documentoValidator) });
    const doc = g.controls['numeroDocumento'];
    doc.setValue('123456');
    expect(doc.errors).toEqual({ dni: true });
    doc.setValue('12345678');
    expect(doc.errors).toBeNull();
    g.controls['tipoDocumento'].setValue('Pasaporte');
    doc.setValue('AAB123456');
    expect(doc.errors).toBeNull();
    doc.setValue('ABCDEFG');
    expect(doc.errors).toEqual({ pasaporte: true });
  });

  it('teléfono argentino y email', () => {
    const tel = new FormControl('', telefonoValidator);
    for (const ok of ['1155550000', '3515550000', '2901123456']) {
      tel.setValue(ok);
      expect(tel.errors).toBeNull();
    }
    for (const mal of ['123', '011155550000', '1555550000', '0115555000', '115555']) {
      tel.setValue(mal);
      expect(tel.errors).toEqual({ telefono: true });
    }
    const mail = new FormControl('', emailValidator);
    mail.setValue('a@b');
    expect(mail.errors).toEqual({ email: true });
    mail.setValue('hola@casa.com');
    expect(mail.errors).toBeNull();
  });

  it('normaliza el teléfono con +54 9', () => {
    expect(telefonoNacional('+54 9 11 5555 0000')).toBe('1155550000');
    expect(telefonoNacional('11 5555 0000')).toBe('1155550000');
    expect(formatearTelefono('1155550000')).toBe('+54 9 11 5555 0000');
  });

  it('domicilio: calle, altura, piso y localidad', () => {
    const calle = new FormControl('', calleValidator);
    for (const ok of ['Av. Cabildo', 'Juan B. Justo', '9 de Julio', "O'Higgins", 'Calle 7', 'Av. Santa Fe & Callao', 'Av/Cabildo']) { calle.setValue(ok); expect(calle.errors).toBeNull(); }
    for (const mal of ['###', '...', 'Calle <5>']) { calle.setValue(mal); expect(calle.errors).toEqual({ calle: true }); }

    const altura = new FormControl('', alturaValidator);
    for (const ok of ['1', '1840', '99999']) { altura.setValue(ok); expect(altura.errors).toBeNull(); }
    for (const mal of ['0', '01840', '123456', '12a']) { altura.setValue(mal); expect(altura.errors).toEqual({ altura: true }); }

    const piso = new FormControl('', pisoValidator);
    for (const ok of ['PB', '3° B', '4 C', '12-A']) { piso.setValue(ok); expect(piso.errors).toBeNull(); }
    piso.setValue('piso trece de la torre');
    expect(piso.errors).toEqual({ piso: true });

    const loc = new FormControl('', localidadValidator);
    loc.setValue('Palermo'); expect(loc.errors).toBeNull();
    loc.setValue('Springfield'); expect(loc.errors).toEqual({ localidad: true });
  });

  it('números con coma: formato y rango', () => {
    const peso = new FormControl('', decimalValidator(0.001, 100));
    for (const ok of ['0,75', '1', '100', '12,', '0,001']) { peso.setValue(ok); expect(peso.errors).toBeNull(); }
    for (const mal of ['1,2,3', '1.5', '-1', 'abc', ',5']) { peso.setValue(mal); expect(peso.errors).toEqual({ decimal: true }); }
    for (const fuera of ['0', '100,1', '0,0001']) { peso.setValue(fuera); expect(peso.errors).toEqual({ rango: true }); }
    expect(aNumero('12,5')).toBe(12.5);
    expect(aNumero('')).toBe(0);
    expect(aNumeroONulo('')).toBeNull();
    expect(aNumeroONulo('  ')).toBeNull();
    expect(aNumeroONulo('0,5')).toBe(0.5);
  });

  it('cantidades enteras con límites', () => {
    const cantidad = new FormControl('', enteroValidator(1, 10000));
    for (const ok of ['1', '250', '10000']) { cantidad.setValue(ok); expect(cantidad.errors).toBeNull(); }
    for (const mal of ['1,5', 'abc', '-3']) { cantidad.setValue(mal); expect(cantidad.errors).toEqual({ entero: true }); }
    for (const fuera of ['0', '10001']) { cantidad.setValue(fuera); expect(cantidad.errors).toEqual({ rango: true }); }
    cantidad.setValue('');
    expect(cantidad.errors).toBeNull();
  });

  it('dirección de entrega: letras y número', () => {
    const dir = new FormControl('', direccionEnvioValidator);
    for (const ok of ['Av. Cabildo 1840, 3° B', 'Honduras 4800', '9 de Julio 123 (timbre 2)', 'Juan B. Justo 2300 - PB']) { dir.setValue(ok); expect(dir.errors).toBeNull(); }
    for (const mal of ['Palermo', '1234', 'Calle <5>']) { dir.setValue(mal); expect(dir.errors).toEqual({ direccion: true }); }
  });

  it('nombre de producto', () => {
    const nombre = new FormControl('', productoNombreValidator);
    for (const ok of ['Remera 100% algodón (M)', 'Cable USB-C', 'Kit #2 / pack']) { nombre.setValue(ok); expect(nombre.errors).toBeNull(); }
    for (const mal of ['<b>Taza</b>', '%Taza', '*oferta*']) { nombre.setValue(mal); expect(nombre.errors).toEqual({ nombre: true }); }
  });

  it('las máscaras de peso, medida y precio aceptan coma o punto y limitan los decimales', () => {
    expect(aplicarMascara('peso', '1.2345')).toBe('1,234');
    expect(aplicarMascara('peso', '12345')).toBe('123');
    expect(aplicarMascara('medida', '12,345')).toBe('12,3');
    expect(aplicarMascara('medida', ',5')).toBe('0,5');
    expect(aplicarMascara('precio', '15990.567')).toBe('15990,56');
    expect(aplicarMascara('precio', '1a5,5,5')).toBe('15,55');
    expect(aplicarMascara('precio', '12,')).toBe('12,');
  });

  it('las máscaras filtran caracteres inválidos', () => {
    expect(aplicarMascara('dni', '28.456.123x9')).toBe('28456123');
    expect(aplicarMascara('pasaporte', 'aab-123456789')).toBe('AAB123456');
    expect(aplicarMascara('cuil', '27284561231')).toBe('27-28456123-1');
    expect(aplicarMascara('altura', '18a40999')).toBe('18409');
    expect(aplicarMascara('calle', '  Av.   Cabildo <#1>')).toBe('Av. Cabildo #1');
    expect(aplicarMascara('phone', '11 55a55-0000999')).toBe('1155550000');
  });
});
