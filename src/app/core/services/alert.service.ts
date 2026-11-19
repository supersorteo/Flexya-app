import { Injectable } from '@angular/core';
import { CONFIG } from '../config';
import { MOTIVOS_INCIDENCIA } from '../models';
import type { SweetAlertCustomClass, SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

export type TipoConfirmacion = 'peligro' | 'advertencia' | 'info';

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje?: string;
  confirmar?: string;
  cancelar?: string;
  tipo?: TipoConfirmacion;
}

export interface OpcionesExitoConAccion {
  titulo: string;
  mensaje?: string;
  accion: string;
  cancelar?: string;
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

export interface OpcionesReprogramacion {
  titulo: string;
  mensaje: string;
  fechaActual?: string;
  minima: string;
  conFranja: boolean;
  validar: (fecha: string) => string | null;
}

export interface OpcionesInvitacion {
  titulo: string;
  nombre: string;
  email: string;
  enlace: string;
  vigencia: string;
  accion: string;
}

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

/** Muestra solo lo necesario del enlace: el servidor, la ruta y el final del código. El enlace completo se copia aparte. */
export function acortarEnlace(enlace: string): string {
  try {
    const url = new URL(enlace);
    const partes = url.pathname.split('/').filter(Boolean);
    const codigo = partes.pop() ?? '';
    return `${url.host}${partes.length ? `/${partes.join('/')}/` : '/'}…${codigo.slice(-6)}`;
  } catch {
    return enlace.length > 34 ? `${enlace.slice(0, 22)}…${enlace.slice(-6)}` : enlace;
  }
}

async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const auxiliar = document.createElement('textarea');
    auxiliar.value = texto;
    auxiliar.setAttribute('readonly', '');
    auxiliar.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(auxiliar);
    auxiliar.select();
    const ok = document.execCommand('copy');
    auxiliar.remove();
    return ok;
  }
}

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
    const resultado = await Swal.fire({
      ...BASE,
      icon: icono,
      title: o.titulo,
      text: o.mensaje,
      showCancelButton: true,
      confirmButtonText: o.confirmar ?? 'Confirmar',
      cancelButtonText: o.cancelar ?? 'Cancelar',
      focusCancel: tipo === 'peligro',
      customClass: { ...CLASES, popup: `fx-swal fx-swal--${tipo}`, confirmButton: tipo === 'peligro' ? 'btn btn-danger' : 'btn btn-primary' },
    });
    return resultado.isConfirmed;
  }

  /** Avisa que algo salió bien y ofrece una acción para seguir (por ejemplo, imprimir la etiqueta); quien no la quiere toca "Listo". */
  async exitoConAccion(o: OpcionesExitoConAccion): Promise<boolean> {
    const Swal = await cargarSwal();
    const resultado = await Swal.fire({
      ...BASE,
      icon: 'success',
      title: o.titulo,
      text: o.mensaje,
      showCancelButton: true,
      confirmButtonText: o.accion,
      cancelButtonText: o.cancelar ?? 'Listo',
    });
    return resultado.isConfirmed;
  }

  async pedirTexto(o: OpcionesTexto): Promise<string | null> {
    const Swal = await cargarSwal();
    const resultado = await Swal.fire({
      ...BASE,
      icon: o.icono ?? 'warning',
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

  async pedirIncidencia(titulo: string): Promise<{ motivoId: string; nota: string } | null> {
    const Swal = await cargarSwal();
    const opciones = MOTIVOS_INCIDENCIA.map((m) => `<option value="${m.id}">${escapar(m.etiqueta)}</option>`).join('');
    const resultado = await Swal.fire({
      ...BASE,
      icon: 'warning',
      title: titulo,
      html:
        '<div class="text-start"><label class="form-label" for="fx-inc-motivo">Motivo</label>' +
        `<select id="fx-inc-motivo" class="form-select mb-3">${opciones}</select>` +
        '<label class="form-label" for="fx-inc-nota">Detalle (opcional)</label>' +
        '<textarea id="fx-inc-nota" class="form-control" rows="3" maxlength="200" placeholder="Ej. toqué timbre dos veces, no respondieron…"></textarea></div>',
      showCancelButton: true,
      confirmButtonText: 'Registrar incidencia',
      cancelButtonText: 'Cancelar',
      preConfirm: () => ({
        motivoId: (document.getElementById('fx-inc-motivo') as HTMLSelectElement).value,
        nota: (document.getElementById('fx-inc-nota') as HTMLTextAreaElement).value.trim(),
      }),
    });
    return resultado.isConfirmed ? (resultado.value as { motivoId: string; nota: string }) : null;
  }

  async pedirReprogramacion(o: OpcionesReprogramacion): Promise<{ fecha: string; franja: 'manana' | 'tarde' | null } | null> {
    const Swal = await cargarSwal();
    const franja = o.conFranja
      ? '<label class="form-label mt-3" for="fx-rep-franja">Franja</label>' +
        '<select id="fx-rep-franja" class="form-select"><option value="manana">A la mañana</option><option value="tarde">A la tarde</option></select>'
      : '';
    const resultado = await Swal.fire({
      ...BASE,
      icon: 'question',
      title: o.titulo,
      html:
        `<p class="fx-swal-aviso">${escapar(o.mensaje)}</p>` +
        '<div class="text-start"><label class="form-label" for="fx-rep-fecha">Nueva fecha de retiro</label>' +
        `<input id="fx-rep-fecha" type="date" class="form-control" min="${escapar(o.minima)}" value="${escapar(o.fechaActual && o.fechaActual >= o.minima ? o.fechaActual : o.minima)}" />` +
        `${franja}</div>`,
      showCancelButton: true,
      confirmButtonText: 'Reprogramar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const fecha = (document.getElementById('fx-rep-fecha') as HTMLInputElement).value;
        const error = o.validar(fecha);
        if (error) {
          Swal.showValidationMessage(error);
          return false;
        }
        const franjaElegida = document.getElementById('fx-rep-franja') as HTMLSelectElement | null;
        return { fecha, franja: franjaElegida ? (franjaElegida.value as 'manana' | 'tarde') : null };
      },
    });
    return resultado.isConfirmed ? (resultado.value as { fecha: string; franja: 'manana' | 'tarde' | null }) : null;
  }

  async invitacion(o: OpcionesInvitacion): Promise<void> {
    const Swal = await cargarSwal();
    const demo = CONFIG.mostrarCorreosSimulados
      ? '<div class="fx-enlace">' +
        '<small class="fx-enlace-rotulo">Enlace de activación · solo demostración</small>' +
        '<div class="fx-enlace-caja">' +
        '<i class="bi bi-link-45deg fx-enlace-icono" aria-hidden="true"></i>' +
        `<span class="fx-enlace-texto" title="${escapar(o.enlace)}">${escapar(acortarEnlace(o.enlace))}</span>` +
        `<button type="button" class="fx-copiar" data-enlace="${escapar(o.enlace)}" aria-label="Copiar el enlace completo"><i class="bi bi-clipboard" aria-hidden="true"></i><span>Copiar</span></button>` +
        '</div>' +
        '<a class="fx-enlace-correo" href="/correos" target="_blank" rel="noopener"><i class="bi bi-envelope-open" aria-hidden="true"></i>Ver el correo en la bandeja de demostración</a>' +
        '</div>'
      : '';

    await Swal.fire({
      ...BASE,
      icon: 'success',
      title: o.titulo,
      html:
        `<p class="fx-swal-aviso"><strong>${escapar(o.nombre)}</strong><br>Enviamos un correo a <strong>${escapar(o.email)}</strong> con el enlace para ${escapar(o.accion)}. Vence en ${escapar(o.vigencia)}.</p>` +
        demo,
      confirmButtonText: 'Listo',
      didOpen: (popup) => {
        popup.querySelectorAll<HTMLButtonElement>('.fx-copiar').forEach((boton) =>
          boton.addEventListener('click', async () => {
            const copiado = await copiarAlPortapapeles(boton.dataset['enlace'] ?? o.enlace);
            const icono = boton.querySelector('i')!;
            const texto = boton.querySelector('span')!;
            boton.classList.toggle('copiado', copiado);
            icono.className = copiado ? 'bi bi-check2-circle' : 'bi bi-exclamation-circle';
            texto.textContent = copiado ? 'Copiado' : 'No se pudo copiar';
            setTimeout(() => {
              boton.classList.remove('copiado');
              icono.className = 'bi bi-clipboard';
              texto.textContent = 'Copiar';
            }, 2200);
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
