import { inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AlertService } from '../../core/services/alert.service';

export interface Paso {
  titulo: string;
  campos: readonly string[];
}

export type Mensajes = Record<string, Record<string, string>>;

export abstract class WizardModal {
  protected readonly modal = inject(NgbActiveModal);
  protected readonly alert = inject(AlertService);
  protected readonly paso = signal(0);

  protected abstract readonly pasos: readonly Paso[];
  protected abstract readonly mensajes: Mensajes;
  protected abstract readonly form: FormGroup;
  protected abstract guardar(): Promise<void>;

  protected esUltimo() {
    return this.paso() === this.pasos.length - 1;
  }

  protected pasoConError(i: number): boolean {
    return this.pasos[i].campos.some((n) => {
      const c = this.form.get(n);
      return !!c && c.invalid && c.touched;
    });
  }

  protected pasoValido(i: number): boolean {
    this.pasos[i].campos.forEach((n) => this.form.get(n)?.markAsTouched());
    return this.pasos[i].campos.every((n) => {
      const c = this.form.get(n);
      return !c || c.disabled || c.valid;
    });
  }

  protected anterior() {
    this.paso.update((p) => Math.max(0, p - 1));
  }

  protected ir(destino: number) {
    if (destino <= this.paso()) {
      this.paso.set(destino);
      return;
    }
    while (this.paso() < destino && this.pasoValido(this.paso())) this.paso.update((p) => p + 1);
    if (this.paso() < destino) this.avisarErrores();
  }

  protected enviar() {
    if (!this.esUltimo()) {
      if (this.pasoValido(this.paso())) this.paso.update((p) => p + 1);
      else this.avisarErrores();
      return;
    }
    void this.guardar();
  }

  protected async cancelar() {
    if (this.form.dirty) {
      const descartar = await this.alert.confirmar({
        titulo: '¿Descartar los cambios?',
        mensaje: 'Los datos que cargaste no se van a guardar.',
        confirmar: 'Sí, descartar',
        cancelar: 'Seguir editando',
        tipo: 'advertencia',
      });
      if (!descartar) return;
    }
    this.modal.dismiss();
  }

  protected irAlPrimerPasoConError() {
    this.form.markAllAsTouched();
    const malo = this.pasos.findIndex((p) => p.campos.some((n) => this.form.get(n)?.invalid));
    if (malo >= 0) this.paso.set(malo);
    this.avisarErrores();
  }

  protected avisarErrores() {
    this.alert.advertencia('Revisá los campos marcados en rojo para continuar.');
  }

  protected error(name: string): string {
    const c = this.form.get(name);
    if (!c || !c.invalid || !(c.touched || c.dirty)) return '';
    const key = Object.keys(c.errors ?? {})[0];
    return this.mensajes[name]?.[key] ?? 'Valor inválido.';
  }
}
