import { Injectable } from '@angular/core';
import type { SweetAlertCustomClass, SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

export type TipoConfirmacion = 'peligro' | 'advertencia' | 'info';

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje?: string;
  confirmar?: string;
  cancelar?: string;
  tipo?: TipoConfirmacion;
}

export interface OpcionesTexto {
  titulo: string;
  mensaje?: string;
  etiqueta?: string;
  placeholder?: string;
  confirmar?: string;
  obligatorio?: boolean;
  icono?: SweetAlertIcon;
  multilinea?: boolean;
}

export interface OpcionesCredenciales {
  titulo: string;
  nombre: string;
  email: string;
  clave: string;
}

const COLORES: Record<SweetAlertIcon, string> = {
  success: '#20b898',
  error: '#e86c7b',
  warning: '#f3a63b',
  info: '#356ae6',
  question: '#8c6be8',
};

const CLASES: SweetAlertCustomClass = {
  popup: 'fx-swal',
  title: 'fx-swal-title',
  htmlContainer: 'fx-swal-html',
  actions: 'fx-swal-actions',
  confirmButton: 'btn btn-primary',
  cancelButton: 'btn btn-outline-secondary',
  input: 'form-control',
  inputLabel: 'form-label',
  validationMessage: 'fx-swal-error',
};

const BASE: SweetAlertOptions = {
  buttonsStyling: false,
  heightAuto: false,
  scrollbarPadding: false,
  reverseButtons: true,
  customClass: CLASES,
};

const cargarSwal = () => import('sweetalert2').then((m) => m.default);

const escapar = (valor: string) =>
  valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

@Injectable({ providedIn: 'root' })
export class AlertService {
  exito(mensaje: string) {
    void this.notificar('success', mensaje);
  }

  error(mensaje: string) {
    void this.notificar('error', mensaje, 5000);
  }

  advertencia(mensaje: string) {
    void this.notificar('warning', mensaje, 5000);
  }

  info(mensaje: string) {
    void this.notificar('info', mensaje);
  }

  async confirmar(o: OpcionesConfirmacion): Promise<boolean> {
    const Swal = await cargarSwal();
    const tipo = o.tipo ?? 'advertencia';
    const icono: SweetAlertIcon = tipo === 'info' ? 'question' : 'warning';
    const color = tipo === 'peligro' ? COLORES.error : tipo === 'info' ? COLORES.info : COLORES.warning;
    const resultado = await Swal.fire({
      ...BASE,
      icon: icono,
      iconColor: color,
      title: o.titulo,
      text: o.mensaje,
      showCancelButton: true,
      confirmButtonText: o.confirmar ?? 'Confirmar',
      cancelButtonText: o.cancelar ?? 'Cancelar',
      focusCancel: tipo === 'peligro',
      customClass: { ...CLASES, confirmButton: tipo === 'peligro' ? 'btn btn-danger' : 'btn btn-primary' },
    });
    return resultado.isConfirmed;
  }

  async pedirTexto(o: OpcionesTexto): Promise<string | null> {
    const Swal = await cargarSwal();
    const resultado = await Swal.fire({
      ...BASE,
      icon: o.icono ?? 'warning',
      iconColor: COLORES[o.icono ?? 'warning'],
      title: o.titulo,
      text: o.mensaje,
      input: o.multilinea === false ? 'text' : 'textarea',
      inputLabel: o.etiqueta,
      inputPlaceholder: o.placeholder,
      inputAttributes: { maxlength: '200' },
      showCancelButton: true,
      confirmButtonText: o.confirmar ?? 'Aceptar',
      cancelButtonText: 'Cancelar',
      inputValidator: (valor: string) => (o.obligatorio !== false && !valor.trim() ? 'Este dato es obligatorio.' : undefined),
    });
    return resultado.isConfirmed ? String(resultado.value ?? '').trim() : null;
  }

  async credenciales(o: OpcionesCredenciales): Promise<void> {
    const Swal = await cargarSwal();
    const fila = (etiqueta: string, valor: string, campo: string) =>
      `<div class="fx-cred"><div><small>${etiqueta}</small><code>${escapar(valor)}</code></div>` +
      `<button type="button" class="btn btn-sm btn-outline-secondary" data-copiar="${campo}"><i class="bi bi-clipboard"></i> Copiar</button></div>`;

    await Swal.fire({
      ...BASE,
      icon: 'success',
      iconColor: COLORES.success,
      title: o.titulo,
      html:
        `<p class="fx-muted small mb-3"><strong>${escapar(o.nombre)}</strong><br>Compartí estos datos para que pueda ingresar. La clave temporal solo se muestra ahora.</p>` +
        fila('Usuario (correo)', o.email, 'email') +
        fila('Clave temporal', o.clave, 'clave'),
      confirmButtonText: 'Listo',
      didOpen: (popup) => {
        popup.querySelectorAll<HTMLButtonElement>('[data-copiar]').forEach((boton) =>
          boton.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(boton.dataset['copiar'] === 'email' ? o.email : o.clave);
              const icono = document.createElement('i');
              icono.className = 'bi bi-check2';
              boton.replaceChildren(icono, document.createTextNode(' Copiado'));
            } catch {
              boton.textContent = 'No se pudo copiar';
            }
          }),
        );
      },
    });
  }

  private async notificar(icono: SweetAlertIcon, mensaje: string, duracion = 3500) {
    const Swal = await cargarSwal();
    await Swal.fire({
      ...BASE,
      toast: true,
      position: 'top-end',
      icon: icono,
      iconColor: COLORES[icono],
      title: mensaje,
      showConfirmButton: false,
      timer: duracion,
      timerProgressBar: true,
      customClass: { ...CLASES, popup: 'fx-swal fx-swal-toast' },
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });
  }
}
