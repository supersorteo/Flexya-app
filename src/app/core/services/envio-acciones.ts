import { Injectable, inject } from '@angular/core';
import { Envio } from '../models';
import { AlertService } from './alert.service';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class AccionesEnvio {
  private readonly data = inject(DataService);
  private readonly alert = inject(AlertService);

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
    this.data.entregar(e.id, recibio);
    this.alert.exito(`${e.id} marcado como entregado`);
    return true;
  }

  async incidencia(e: Envio): Promise<boolean> {
    const motivo = await this.alert.pedirTexto({
      titulo: `Incidencia en ${e.id}`,
      etiqueta: 'Motivo',
      placeholder: 'Ej. Nadie atendió, la dirección no existe…',
      confirmar: 'Registrar incidencia',
    });
    if (motivo === null) return false;
    this.data.reportarIncidencia(e.id, motivo);
    this.alert.advertencia(`Incidencia registrada en ${e.id}`);
    return true;
  }
}
