import { Injectable, inject } from '@angular/core';
import { Envio, enCustodiaFlexya, hoyISO } from '../models';
import { AlertService } from './alert.service';
import { AuthService } from './auth.service';
import { DataService, StockInsuficienteError } from './data.service';

@Injectable({ providedIn: 'root' })
export class AccionesEnvio {
  private readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly auth = inject(AuthService);

  async entregar(e: Envio): Promise<boolean> {
    const recibio = await this.alert.pedirTexto({
      titulo: `¿Marcar ${e.id} como entregado?`,
      mensaje: `Destinatario: ${e.destinatario}`,
      etiqueta: 'Quién recibió (opcional)',
      placeholder: 'Ej. el destinatario, portería, un familiar…',
      confirmar: 'Sí, entregado',
      obligatorio: false,
      multilinea: false,
      icono: 'question',
    });
    if (recibio === null) return false;
    if (!this.data.entregar(e.id, recibio, this.auth.user())) {
      this.alert.advertencia('Este envío no está en reparto o no es tuyo.');
      return false;
    }
    this.alert.exito(`${e.id} marcado como entregado`);
    return true;
  }

  async reprogramar(e: Envio): Promise<boolean> {
    const usuario = this.auth.user();
    if (!usuario) return false;
    const esAdmin = usuario.rol === 'admin';
    const pedido = await this.alert.pedirReprogramacion({
      titulo: `Reprogramar el retiro de ${e.id}`,
      mensaje: esAdmin
        ? e.mensajeroId
          ? 'El mensajero asignado deja de tener este retiro: vas a tener que asignarlo de nuevo para el día nuevo.'
          : 'Elegí cuándo se va a retirar. Todos los destinatarios de este retiro se mueven juntos.'
        : 'Flexya vuelve a coordinar el retiro para esa fecha. Todos los destinatarios de este retiro se mueven juntos.',
      fechaActual: e.fechaRetiro ?? undefined,
      minima: hoyISO(),
      conFranja: e.retiro !== 'deposito',
      validar: (fecha) => this.data.validarFechaRetiro(fecha),
    });
    if (!pedido) return false;
    if (!this.data.reprogramarRetiro(e.id, pedido.fecha, pedido.franja, usuario)) {
      this.alert.advertencia('Este retiro ya no se puede reprogramar.');
      return false;
    }
    this.alert.exito(`Retiro de ${e.id} reprogramado para el ${pedido.fecha.split('-').reverse().slice(0, 2).join('/')}`);
    return true;
  }

  async cancelar(e: Envio): Promise<boolean> {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return false;
    const confirmado = await this.alert.confirmar({
      titulo: `¿Cancelar el envío ${e.id}?`,
      mensaje: enCustodiaFlexya(e)
        ? 'El paquete ya está en Flexya: te lo devolvemos y vas a confirmar cuando lo recibas. Las unidades vuelven a tu stock recién ahí.'
        : 'Las unidades vuelven a tu stock. Esta acción no se puede deshacer.',
      confirmar: 'Sí, cancelar envío',
      cancelar: 'No, mantenerlo',
      tipo: 'peligro',
    });
    if (!confirmado) return false;
    if (!this.data.cancelarEnvio(e.id, clienteId)) {
      this.alert.advertencia('Este envío ya no se puede cancelar.');
      return false;
    }
    this.alert.exito(enCustodiaFlexya(e) ? `Devolución de ${e.id} solicitada` : `Envío ${e.id} cancelado`);
    return true;
  }

  async observar(e: Envio): Promise<boolean> {
    const motivo = await this.alert.pedirTexto({
      titulo: `¿Lo recibido no coincide con ${e.id}?`,
      mensaje: 'El envío queda en pausa. El cliente verá el motivo y podrá corregirlo o cancelarlo.',
      etiqueta: 'Qué no coincide',
      placeholder: 'Ej. llegaron 2 tazas en lugar de 3, falta la remera…',
      confirmar: 'Poner en revisión',
      icono: 'warning',
    });
    if (motivo === null) return false;
    if (!this.data.observar(e.id, motivo)) {
      this.alert.advertencia('Este envío no se puede poner en revisión.');
      return false;
    }
    this.alert.advertencia(`${e.id} en revisión: el cliente fue notificado`);
    return true;
  }

  async reanudar(e: Envio): Promise<boolean> {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Reanudar el envío ${e.id}?`,
      mensaje: 'Verificaste que el contenido ya coincide. Vuelve a estar listo para asignar.',
      confirmar: 'Sí, reanudar',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.reanudar(e.id)) {
      this.alert.advertencia('Este envío no está en revisión.');
      return false;
    }
    this.alert.exito(`Envío ${e.id} reanudado`);
    return true;
  }

  async cancelarRetiro(retiroId: string, envios: Envio[]): Promise<boolean> {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return false;
    const cancelables = envios.filter((e) => this.data.cancelableCliente(e));
    const enFlexya = cancelables.filter((e) => enCustodiaFlexya(e)).length;
    const confirmado = await this.alert.confirmar({
      titulo: `¿Cancelar el retiro ${retiroId}?`,
      mensaje: `Se cancelan ${cancelables.length} envíos que todavía se pueden cancelar. Los que ya salieron o se entregaron no se tocan.${enFlexya ? ` ${enFlexya} ya están en Flexya: se te devuelven.` : ''} Las unidades vuelven a tu stock.`,
      confirmar: 'Sí, cancelar retiro',
      cancelar: 'No, mantenerlo',
      tipo: 'peligro',
    });
    if (!confirmado) return false;
    const n = this.data.cancelarRetiro(retiroId, clienteId);
    if (!n) {
      this.alert.advertencia('Ningún envío del retiro se puede cancelar.');
      return false;
    }
    this.alert.exito(`Retiro ${retiroId}: ${n} ${n === 1 ? 'envío cancelado' : 'envíos cancelados'}`);
    return true;
  }

  async solicitar(e: Envio): Promise<boolean> {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return false;
    const confirmado = await this.alert.confirmar({
      titulo: `¿Solicitar el envío ${e.id}?`,
      mensaje: 'Se reservan las unidades de tu stock y Flexya lo empieza a coordinar. Después solo se puede cancelar.',
      confirmar: 'Sí, solicitar',
      tipo: 'info',
    });
    if (!confirmado) return false;
    try {
      if (!this.data.solicitarEnvio(e.id, clienteId)) {
        this.alert.advertencia('Este borrador ya no se puede solicitar.');
        return false;
      }
    } catch (error) {
      if (!(error instanceof StockInsuficienteError)) throw error;
      this.alert.advertencia(`No hay stock suficiente. ${error.message}`);
      return false;
    }
    this.alert.exito(`Envío ${e.id} solicitado`);
    return true;
  }

  async eliminarBorrador(e: Envio): Promise<boolean> {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return false;
    const confirmado = await this.alert.confirmar({
      titulo: `¿Eliminar el borrador ${e.id}?`,
      mensaje: 'Todavía no pediste el servicio, por eso se puede eliminar. Esta acción no se puede deshacer.',
      confirmar: 'Sí, eliminar',
      cancelar: 'No, conservarlo',
      tipo: 'peligro',
    });
    if (!confirmado) return false;
    if (!this.data.eliminarBorrador(e.id, clienteId)) {
      this.alert.advertencia('Este envío no se puede eliminar.');
      return false;
    }
    this.alert.exito(`Borrador ${e.id} eliminado`);
    return true;
  }

  async eliminarComoAdmin(e: Envio): Promise<boolean> {
    const activo = !['Entregado', 'Cancelado'].includes(e.estado);
    const enManos = e.estado === 'Retirado' || e.estado === 'En reparto';
    const confirmado = await this.alert.confirmar({
      titulo: `¿Eliminar el envío ${e.id}?`,
      mensaje: `Se borra el envío y todo su historial, también para el cliente.${activo ? ' Las unidades reservadas vuelven al stock del cliente.' : ''}${enManos ? ' Atención: el paquete está en manos del mensajero.' : ''} Esta acción no se puede deshacer.`,
      confirmar: 'Sí, eliminar',
      cancelar: 'No, conservarlo',
      tipo: 'peligro',
    });
    if (!confirmado) return false;
    if (!this.data.eliminarEnvio(e.id)) {
      this.alert.advertencia('Este envío no se puede eliminar.');
      return false;
    }
    this.alert.exito(`Envío ${e.id} eliminado`);
    return true;
  }

  async cancelarComoAdmin(e: Envio): Promise<boolean> {
    const motivo = await this.alert.pedirTexto({
      titulo: `¿Cancelar el envío ${e.id}?`,
      mensaje: 'El paquete todavía lo tiene el cliente. Las unidades vuelven a su stock.',
      etiqueta: 'Motivo (se lo mostramos al cliente)',
      placeholder: 'Ej. dirección inexistente, el cliente lo pidió…',
      confirmar: 'Sí, cancelar envío',
      icono: 'warning',
    });
    if (motivo === null) return false;
    if (!this.data.cancelarPorAdmin(e.id, motivo)) {
      this.alert.advertencia('Este envío ya no se puede cancelar.');
      return false;
    }
    this.alert.exito(`Envío ${e.id} cancelado`);
    return true;
  }

  private resumenPaquetes(paquetes: Envio[]): string {
    const unidades = paquetes.reduce((total, p) => total + (p.items ?? []).reduce((n, i) => n + i.cantidad, 0), 0);
    const lineas = paquetes
      .map((p) => `${p.destinatario}: ${(p.items ?? []).map((i) => `${i.cantidad} × ${i.nombre}`).join(', ') || 'sin productos detallados'}`)
      .join(' · ');
    return `${paquetes.length} ${paquetes.length === 1 ? 'paquete' : 'paquetes'}, ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}. ${lineas}.`;
  }

  async recepcionar(e: Envio): Promise<boolean> {
    const paquetes = this.data.paquetesRecepcionables(e);
    const observaciones = await this.alert.pedirTexto({
      titulo: paquetes.length > 1 ? `¿Recibiste los ${paquetes.length} paquetes del retiro?` : `¿Recibiste el envío ${e.id}?`,
      mensaje: `De ${this.data.nombreCliente(e.clienteId)}: ${this.resumenPaquetes(paquetes)} Verificá que coincida con lo que llegó.`,
      etiqueta: 'Observaciones (opcional)',
      placeholder: 'Ej. caja con golpes, falta una unidad…',
      confirmar: paquetes.length > 1 ? 'Sí, los recibí' : 'Sí, lo recibí',
      obligatorio: false,
      multilinea: true,
      icono: 'question',
    });
    if (observaciones === null) return false;
    if (!this.data.recepcionar(e.id, observaciones.trim())) {
      this.alert.advertencia('Este envío no se puede recepcionar.');
      return false;
    }
    this.alert.exito(paquetes.length > 1 ? `${paquetes.length} paquetes recepcionados en depósito` : `${e.id} recepcionado en depósito`);
    return true;
  }
  async asignar(e: Envio, mensajeroId: string): Promise<boolean> {
    const mensajero = this.data.nombreMensajero(mensajeroId);
    const devolucion = e.estado === 'En devolución';
    const directo = e.estado === 'Pendiente' || e.estado === 'Retiro fallido';
    const confirmado = await this.alert.confirmar({
      titulo: `¿Asignar ${e.id} a ${mensajero}?`,
      mensaje: devolucion
        ? `Lleva el paquete de vuelta a ${this.data.domicilioCliente(e.clienteId) || 'el domicilio del cliente'}. Las unidades vuelven al stock cuando el cliente confirme que lo recibió.`
        : directo
        ? `Primero retira ${this.data.paquetesDelRetiro(e, e.estado).length > 1 ? `los ${this.data.paquetesDelRetiro(e, e.estado).length} paquetes del retiro` : 'el paquete'} en ${e.origen || 'el domicilio del cliente'} ${e.retiro === 'recoleccion' ? 'y los lleva al depósito de Flexya' : 'y después los entrega, sin pasar por el depósito'}.`
        : `Entrega a ${e.destinatario} en ${e.localidad}.`,
      confirmar: 'Sí, asignar',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.asignar(e.id, mensajeroId)) {
      this.alert.advertencia('Este envío no se puede asignar.');
      return false;
    }
    this.alert.exito(`${e.id} asignado a ${mensajero}`);
    return true;
  }

  private get mensajeroId(): string {
    return this.auth.user()?.mensajeroId ?? '';
  }

  async retirar(e: Envio): Promise<boolean> {
    const paquetes = this.data.paquetesDelRetiro(e, 'Retiro asignado');
    const observaciones = await this.alert.pedirTexto({
      titulo: paquetes.length > 1 ? `¿Retiraste los ${paquetes.length} paquetes?` : `¿Retiraste ${e.id}?`,
      mensaje: `Tiene que haber ${this.resumenPaquetes(paquetes)} Si algo no coincide, cancelá y usá "Diferencia" en ese envío.`,
      etiqueta: 'Observaciones (opcional)',
      placeholder: 'Ej. la caja venía abierta…',
      confirmar: 'Sí, lo retiré',
      obligatorio: false,
      multilinea: true,
      icono: 'question',
    });
    if (observaciones === null) return false;
    if (!this.data.retirar(e.id, this.mensajeroId, observaciones.trim())) {
      this.alert.advertencia('Este envío no se puede marcar como retirado.');
      return false;
    }
    this.alert.exito(paquetes.length > 1 ? `${paquetes.length} paquetes retirados` : `${e.id} retirado`);
    return true;
  }
  async entregarEnDeposito(e: Envio): Promise<boolean> {
    const paquetes = this.data.paquetesDelRetiro(e, 'Retirado');
    const confirmado = await this.alert.confirmar({
      titulo: paquetes.length > 1 ? `¿Entregaste los ${paquetes.length} paquetes en el depósito?` : `¿Entregaste ${e.id} en el depósito?`,
      mensaje: 'Quien atiende el depósito tiene que confirmar la recepción y revisar el contenido.',
      confirmar: 'Sí, los entregué',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.entregarEnDeposito(e.id, this.mensajeroId)) {
      this.alert.advertencia('No se pudo registrar la entrega en el depósito.');
      return false;
    }
    this.alert.exito(paquetes.length > 1 ? `${paquetes.length} paquetes entregados en el depósito` : `${e.id} entregado en el depósito`);
    return true;
  }

  salirAEntregar(e: Envio): boolean {
    if (!this.data.salirAEntregar(e.id, this.mensajeroId)) {
      this.alert.advertencia('Este envío no se puede poner en reparto.');
      return false;
    }
    this.alert.exito(`${e.id} en reparto`);
    return true;
  }

  async retiroFallido(e: Envio): Promise<boolean> {
    const motivo = await this.alert.pedirTexto({
      titulo: `No pudiste retirar ${e.id}`,
      mensaje: 'Flexya lo va a reprogramar y el cliente va a ver el motivo.',
      etiqueta: 'Motivo',
      placeholder: 'Ej. no había nadie, el paquete no estaba listo…',
      confirmar: 'Registrar',
    });
    if (motivo === null) return false;
    if (!this.data.retiroFallido(e.id, this.mensajeroId, motivo)) {
      this.alert.advertencia('No se pudo registrar el retiro fallido.');
      return false;
    }
    this.alert.advertencia(`Retiro fallido en ${e.id}`);
    return true;
  }

  async diferenciaEnRetiro(e: Envio): Promise<boolean> {
    const motivo = await this.alert.pedirTexto({
      titulo: `¿Lo que hay no coincide con ${e.id}?`,
      mensaje: 'No te lo lleves. El envío queda en pausa y el cliente lo corrige o lo cancela.',
      etiqueta: 'Qué no coincide',
      placeholder: 'Ej. hay 2 tazas y el envío dice 3…',
      confirmar: 'Reportar diferencia',
      icono: 'warning',
    });
    if (motivo === null) return false;
    if (!this.data.diferenciaEnRetiro(e.id, this.mensajeroId, motivo)) {
      this.alert.advertencia('No se pudo reportar la diferencia.');
      return false;
    }
    this.alert.advertencia(`${e.id} en revisión: el cliente fue notificado`);
    return true;
  }

  async incidencia(e: Envio): Promise<boolean> {
    const r = await this.alert.pedirIncidencia(`Incidencia en ${e.id}`);
    if (!r) return false;
    if (!this.data.reportarIncidencia(e.id, r.nota, r.motivoId, this.auth.user())) {
      this.alert.advertencia('Este envío no está en reparto o no es tuyo.');
      return false;
    }
    this.alert.advertencia(`Incidencia registrada en ${e.id}. Llevá el paquete al depósito.`);
    return true;
  }

  async reingresar(e: Envio): Promise<boolean> {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Recibiste ${e.id} en el depósito?`,
      mensaje: 'Confirmá que el mensajero te entregó el paquete. Queda en depósito para reintentar la entrega o devolverlo al cliente.',
      confirmar: 'Sí, lo recibí',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.reingresar(e.id)) {
      this.alert.advertencia('Este envío no está en incidencia.');
      return false;
    }
    this.alert.exito(`${e.id} reingresó al depósito`);
    return true;
  }

  async devolver(e: Envio): Promise<boolean> {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Devolver ${e.id} al cliente?`,
      mensaje: `Después asignás un mensajero que lo lleve a ${this.data.nombreCliente(e.clienteId)}. Las unidades vuelven a su stock cuando el cliente confirme que lo recibió.`,
      confirmar: 'Sí, devolver',
      cancelar: 'No',
      tipo: 'advertencia',
    });
    if (!confirmado) return false;
    if (!this.data.devolverAlCliente(e.id)) {
      this.alert.advertencia('Este envío no se puede devolver.');
      return false;
    }
    this.alert.exito(`${e.id} en devolución: falta asignar un mensajero`);
    return true;
  }

  async entregarDevolucion(e: Envio): Promise<boolean> {
    const confirmado = await this.alert.confirmar({
      titulo: `¿Entregaste la devolución de ${e.id}?`,
      mensaje: 'El cliente tiene que confirmar que recibió el paquete.',
      confirmar: 'Sí, entregué',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.entregarDevolucion(e.id, this.auth.user()?.mensajeroId ?? '')) {
      this.alert.advertencia('No se pudo registrar la entrega.');
      return false;
    }
    this.alert.exito(`Devolución de ${e.id} entregada`);
    return true;
  }

  async confirmarDevolucion(e: Envio): Promise<boolean> {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return false;
    const confirmado = await this.alert.confirmar({
      titulo: `¿Recibiste el paquete ${e.id}?`,
      mensaje: 'Confirmá solo si ya lo tenés en tus manos. Las unidades vuelven a tu stock y el envío queda cerrado.',
      confirmar: 'Sí, lo recibí',
      tipo: 'info',
    });
    if (!confirmado) return false;
    if (!this.data.confirmarDevolucion(e.id, clienteId)) {
      this.alert.advertencia('Este envío no está en devolución.');
      return false;
    }
    this.alert.exito(`Recibiste ${e.id}: las unidades volvieron a tu stock`);
    return true;
  }}
