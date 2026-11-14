import { Injectable, inject } from '@angular/core';
import { CONFIG } from '../config';
import { Usuario } from '../models';
import { AlertService } from './alert.service';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class GestionCuentas {
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly data = inject(DataService);

  usuarioDe(origen: { clienteId?: string; mensajeroId?: string }): Usuario | undefined {
    return this.data.usuarios().find((u) => (origen.clienteId ? u.clienteId === origen.clienteId : u.mensajeroId === origen.mensajeroId));
  }

  async invitar(usuario: Usuario, nombre: string, titulo = 'Invitación enviada') {
    const emision = await this.auth.invitar(usuario.id);
    if (!emision) {
      this.alert.advertencia('Esta cuenta ya está activa.');
      return;
    }
    await this.alert.invitacion({
      titulo,
      nombre,
      email: usuario.email,
      enlace: emision.enlace,
      vigencia: `${CONFIG.vigenciaInvitacionHoras} horas`,
      accion: 'activar su cuenta y elegir su contraseña',
    });
  }

  async enviarClave(usuario: Usuario, nombre: string) {
    const emision = await this.auth.recuperacionAdmin(usuario.id);
    if (!emision) {
      this.alert.advertencia('Solo se puede enviar un enlace de nueva contraseña a cuentas activas.');
      return;
    }
    await this.alert.invitacion({
      titulo: 'Enlace enviado',
      nombre,
      email: usuario.email,
      enlace: emision.enlace,
      vigencia: `${CONFIG.vigenciaRecuperacionMinutos} minutos`,
      accion: 'elegir una nueva contraseña',
    });
  }

  async suspender(usuario: Usuario, nombre: string) {
    const motivo = this.data.motivoNoSuspender(usuario.id);
    if (motivo) {
      this.alert.advertencia(`No se puede suspender a ${nombre}. ${motivo}`);
      return;
    }
    const confirmado = await this.alert.confirmar({
      titulo: `¿Suspender la cuenta de ${nombre}?`,
      mensaje: 'No va a poder ingresar hasta que la reactives. Si tiene una sesión abierta, se cierra.',
      confirmar: 'Sí, suspender',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    this.auth.suspender(usuario.id);
    this.alert.exito(`Cuenta de ${nombre} suspendida`);
  }

  async reactivar(usuario: Usuario, nombre: string) {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Reactivar la cuenta de ${nombre}?`,
      mensaje: 'Va a poder ingresar de nuevo con su contraseña.',
      confirmar: 'Sí, reactivar',
      tipo: 'info',
    });
    if (!confirmado) return;
    this.auth.reactivar(usuario.id);
    this.alert.exito(`Cuenta de ${nombre} reactivada`);
  }
}
