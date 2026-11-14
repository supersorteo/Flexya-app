import { Directive, ElementRef, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

export type MaskTipo = 'phone' | 'dni' | 'pasaporte' | 'cuil' | 'calle' | 'altura' | 'piso';

export function aplicarMascara(tipo: MaskTipo, raw: string): string {
  switch (tipo) {
    case 'phone':
      return raw.replace(/\D/g, '').slice(0, 10);
    case 'dni':
      return raw.replace(/\D/g, '').slice(0, 8);
    case 'pasaporte':
      return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
    case 'calle':
      return raw.replace(/[^\p{L}\p{N} .,'’°º/&#-]/gu, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, 60);
    case 'altura':
      return raw.replace(/\D/g, '').slice(0, 5);
    case 'piso':
      return raw.replace(/[^\p{L}\p{N} °º./-]/gu, '').replace(/^\s+/, '').slice(0, 12);
    case 'cuil': {
      const d = raw.replace(/\D/g, '').slice(0, 11);
      return d.length <= 2 ? d : d.length <= 10 ? `${d.slice(0, 2)}-${d.slice(2)}` : `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
    }
  }
}

export const MAX_MASCARA: Record<MaskTipo, number> = { phone: 10, dni: 8, pasaporte: 9, cuil: 13, calle: 60, altura: 5, piso: 12 };

@Directive({
  selector: 'input[fxMask]',
  host: { '(input)': 'filtrar()', '[attr.maxlength]': 'maximo()' },
})
export class MaskDirective {
  readonly fxMask = input.required<MaskTipo>();
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  protected maximo() {
    return MAX_MASCARA[this.fxMask()];
  }

  protected filtrar() {
    const input = this.el.nativeElement;
    const limpio = aplicarMascara(this.fxMask(), input.value);
    if (limpio === input.value && this.ngControl?.value === limpio) return;
    input.value = limpio;
    this.ngControl?.control?.setValue(limpio);
  }
}
