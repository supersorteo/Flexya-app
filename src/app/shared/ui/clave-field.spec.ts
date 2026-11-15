import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { claveValidator } from '../forms/validators';
import { ClaveField } from './clave-field';

@Component({
  imports: [ClaveField],
  template: `<fx-clave-field inputId="c" [medidor]="true" [control]="control" />`,
})
class Anfitrion {
  control = new FormControl('', { nonNullable: true, validators: [Validators.required, claveValidator] });
}

describe('Campo de contraseña', () => {
  function montar() {
    const f = TestBed.createComponent(Anfitrion);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    const escribir = (v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      f.detectChanges();
    };
    const salir = () => {
      input.dispatchEvent(new Event('blur'));
      f.detectChanges();
    };
    return { f, el, escribir, salir };
  }

  it('al entrar no muestra ninguna regla ni medidor', () => {
    const { el } = montar();
    expect(el.querySelector('.fx-requisitos')).toBeNull();
    expect(el.querySelector('.fx-fuerza')).toBeNull();
    expect(el.querySelector('.fx-ayuda-error')).toBeNull();
  });

  it('mientras escribe solo muestra el medidor; las reglas no aparecen hasta salir del campo', () => {
    const { el, escribir } = montar();
    escribir('abc');
    expect(el.querySelector('.fx-fuerza')).not.toBeNull();
    expect(el.querySelector('.fx-requisitos')).toBeNull();
  });

  it('al salir con la contraseña incompleta muestra solo lo que falta', () => {
    const { el, escribir, salir } = montar();
    escribir('abc');
    salir();
    const reglas = [...el.querySelectorAll('.fx-requisitos li')].map((li) => li.textContent!.trim());
    expect(reglas).toEqual(['Al menos 8 caracteres', 'Un número']);
    expect(el.querySelector<HTMLInputElement>('input')!.classList.contains('is-invalid')).toBe(true);
  });

  it('a medida que corrige, las reglas cumplidas desaparecen, y con todo correcto se va el aviso', () => {
    const { el, escribir, salir } = montar();
    escribir('abc');
    salir();
    escribir('abcdefgh');
    expect([...el.querySelectorAll('.fx-requisitos li')].map((li) => li.textContent!.trim())).toEqual(['Un número']);
    escribir('abcdefg1');
    expect(el.querySelector('.fx-requisitos')).toBeNull();
    expect(el.querySelector('.fx-ayuda-error')).toBeNull();
  });

  it('si sale sin escribir pide la contraseña, sin listar reglas', () => {
    const { el, salir } = montar();
    salir();
    expect(el.querySelector('.fx-ayuda-msg')!.textContent).toContain('Ingresá la contraseña.');
    expect(el.querySelector('.fx-requisitos')).toBeNull();
  });
});
