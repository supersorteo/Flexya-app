import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService, StockInsuficienteError } from '../../core/services/data.service';
import { EnvioModal } from './envio-modal';
import { RetiroModal } from './retiro-modal';

const OPCIONES = {
  centered: true,
  scrollable: true,
  size: 'lg',
  backdrop: 'static',
  keyboard: false,
  modalDialogClass: 'fx-modal',
  backdropClass: 'fx-backdrop',
} as const;

const OPCIONES_RETIRO = { ...OPCIONES, size: 'xl' } as const;

@Injectable({ providedIn: 'root' })
export class CrearEnvio {
  private readonly modals = inject(NgbModal);
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);

  abrir() {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return;
    const ref = this.modals.open(RetiroModal, OPCIONES_RETIRO);
    ref.componentInstance.clienteId = clienteId;
    ref.result.then(
      (pedido) => {
        try {
          const creados = this.data.crearRetiro(pedido, clienteId);
          if (!creados.length) return;
          const [primero] = creados;
          const mensaje = pedido.borrador
            ? creados.length > 1 ? `Retiro ${primero.retiroId} guardado como borrador: ${creados.length} envíos` : `Borrador ${primero.id} guardado`
            : creados.length > 1 ? `Retiro ${primero.retiroId} listo: ${creados.length} envíos` : `Envío ${primero.id} creado correctamente`;
          this.alert.exito(mensaje);
          void this.router.navigate(['/cliente/envios']);
        } catch (e) {
          if (!(e instanceof StockInsuficienteError)) throw e;
          this.alert.advertencia(`No hay stock suficiente. ${e.message}`);
        }
      },
      () => undefined,
    );
  }

  editar(envio: Envio) {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId || envio.clienteId !== clienteId) return;
    const ref = this.modals.open(EnvioModal, OPCIONES);
    ref.componentInstance.clienteId = clienteId;
    ref.componentInstance.envio = envio;
    ref.result.then(
      (input) => {
        try {
          if (this.data.actualizarEnvio(envio.id, clienteId, input)) {
            const borrador = envio.estado === 'Borrador';
            this.alert.exito(borrador ? (input.borrador ? `Borrador ${envio.id} guardado` : `Envío ${envio.id} solicitado`) : `Envío ${envio.id} actualizado`);
          }
          else this.alert.advertencia('Este envío ya no se puede editar.');
        } catch (e) {
          if (!(e instanceof StockInsuficienteError)) throw e;
          this.alert.advertencia(`No hay stock suficiente. ${e.message}`);
        }
      },
      () => undefined,
    );
  }
}
