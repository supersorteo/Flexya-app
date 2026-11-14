import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Cliente, Usuario, direccionCompleta, identificacionCliente } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { AlertService } from '../../core/services/alert.service';
import { GestionCuentas } from '../../core/services/gestion-cuentas';
import { CuentaEstado, PageHeader } from '../../shared/ui/ui';
import { ClienteModal } from './cliente-modal';

@Component({
  selector: 'fx-clientes',
  imports: [PageHeader, DatePipe, CuentaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Clientes" subtitle="Dueños de los paquetes: alta, edición y baja de cuentas.">
      <button type="button" class="btn btn-primary" (click)="nuevo()"><i class="bi bi-person-plus"></i>Crear cliente</button>
    </fx-page-header>

    <section class="fx-panel">
      <div class="fx-panel-head flex-wrap gap-2">
        <div class="fx-muted small">{{ filas().length }} de {{ data.clientes().length }} clientes</div>
        <input type="search" class="form-control fx-search" placeholder="Buscar por nombre, documento, CUIT o email…"
          aria-label="Buscar clientes" [value]="q()" (input)="q.set($any($event.target).value)" />
      </div>
      @if (filas().length) {
      <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Tabla de clientes">
        <table class="fx-table fx-table--filas">
          <thead>
            <tr><th>Cliente</th><th>Tipo</th><th>Identificación</th><th>Teléfono</th><th>Plan</th><th>Cuenta</th><th>Envíos</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            @for (c of filas(); track c.id) {
              <tr>
                <td data-label="Cliente">
                  <strong>{{ c.nombre }}</strong>
                  @if (c.nombreComercial) { <span class="fx-sub">{{ c.nombreComercial }}</span> }
                  <span class="fx-sub">{{ c.email }}</span>
                  <span class="fx-sub">{{ direccionCompleta(c) }}@if (c.direccionVerificada) { <i class="bi bi-patch-check-fill fx-verified" title="Dirección verificada" aria-label="Dirección verificada"></i> } @else { <i class="bi bi-exclamation-circle-fill fx-unverified" title="Dirección sin verificar" aria-label="Dirección sin verificar"></i> }</span>
                </td>
                <td data-label="Tipo"><span [class]="'fx-status ' + (c.tipoCliente === 'empresa' ? 'st-deposit' : 'st-route')">{{ c.tipoCliente === 'empresa' ? 'Empresa' : 'Persona' }}</span></td>
                <td data-label="Identificación">
                  {{ identificacion(c) }}
                  @if (c.tipoCliente === 'persona' && c.cuit) { <span class="fx-sub">CUIL/CUIT {{ c.cuit }}</span> }
                  @if (c.tipoCliente === 'empresa' && c.condicionIva) { <span class="fx-sub">IVA: {{ c.condicionIva }}</span> }
                </td>
                <td data-label="Teléfono">
                  {{ c.telefono }}
                  @if (c.responsableNombre) { <span class="fx-sub">Resp.: {{ c.responsableNombre }}</span> }
                </td>
                <td data-label="Plan"><span class="fx-status st-route">{{ c.plan }}</span></td>
                <td data-label="Cuenta">
                  @if (c.usuario; as u) {
                    <fx-cuenta-estado [estado]="u.estado" />
                    @if (u.ultimoAcceso) { <span class="fx-sub">Último acceso {{ u.ultimoAcceso | date: 'd MMM, HH:mm' }}</span> }
                  }
                </td>
                <td data-label="Envíos">{{ c.envios }} <span class="fx-muted">({{ c.activos }} activos)</span></td>
                <td data-label="Acciones" class="fx-actions">
                  @if (c.usuario; as u) {
                    @if (u.estado === 'PENDIENTE') {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="invitar(c)" [attr.aria-label]="'Enviar invitación a ' + c.nombre" title="Enviar invitación a">
                        <i class="bi bi-envelope-paper"></i><span class="d-none d-xl-inline">Invitación</span>
                      </button>
                    }
                    @if (u.estado === 'ACTIVO') {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="enviarClave(c)" [attr.aria-label]="'Enviar enlace de nueva contraseña a ' + c.nombre" title="Enviar enlace de nueva contraseña a">
                        <i class="bi bi-key"></i><span class="d-none d-xl-inline">Clave</span>
                      </button>
                    }
                    @if (u.estado === 'SUSPENDIDO') {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="reactivar(c)" [attr.aria-label]="'Reactivar la cuenta de ' + c.nombre" title="Reactivar la cuenta de">
                        <i class="bi bi-person-check"></i><span class="d-none d-xl-inline">Reactivar</span>
                      </button>
                    } @else {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="suspender(c)" [attr.aria-label]="'Suspender la cuenta de ' + c.nombre" title="Suspender la cuenta de">
                        <i class="bi bi-slash-circle"></i><span class="d-none d-xl-inline">Suspender</span>
                      </button>
                    }
                  }
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="editar(c.id)" [attr.aria-label]="'Editar ' + c.nombre" title="Editar cliente">
                    <i class="bi bi-pencil"></i><span class="d-none d-xl-inline">Editar</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="eliminar(c)" [attr.aria-label]="'Eliminar ' + c.nombre" title="Eliminar cliente">
                    <i class="bi bi-trash3"></i><span class="d-none d-xl-inline">Eliminar</span>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      } @else {
        <div class="text-center fx-muted py-5 px-3">
          <i class="bi bi-people fs-2 d-block mb-2"></i>
          {{ q() ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no hay clientes. Creá el primero.' }}
        </div>
      }
    </section>
  `,
})
export class Clientes {
  protected readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly modals = inject(NgbModal);
  private readonly cuentas = inject(GestionCuentas);

  protected readonly direccionCompleta = direccionCompleta;
  protected readonly q = signal('');

  protected readonly filas = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.data
      .clientes()
      .map((c) => {
        const envios = this.data.envios().filter((e) => e.clienteId === c.id);
        return { ...c, usuario: this.cuentas.usuarioDe({ clienteId: c.id }), envios: envios.length, activos: envios.filter((e) => !['Entregado', 'Cancelado'].includes(e.estado)).length };
      })
      .filter(
        (c) =>
          !q ||
          [c.nombre, c.email, c.numeroDocumento, c.cuit ?? '', (c.cuit ?? '').replace(/\D/g, ''), c.nombreComercial, c.responsableNombre, c.telefono, c.plan, direccionCompleta(c)].join(' ').toLowerCase().includes(q),
      );
  });

  protected readonly identificacion = identificacionCliente;

  protected nuevo() {
    this.abrir(null);
  }

  protected editar(id: string) {
    const cliente = this.data.clientes().find((c) => c.id === id);
    if (cliente) this.abrir(cliente);
  }

  private abrir(cliente: Cliente | null) {
    const ref = this.modals.open(ClienteModal, {
      centered: true,
      scrollable: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
      modalDialogClass: 'fx-modal',
      backdropClass: 'fx-backdrop',
    });
    ref.componentInstance.cliente = cliente;
    ref.result.then(
      (input) => {
        if (cliente) {
          this.data.actualizarCliente(cliente.id, input);
          this.alert.exito(`Cliente ${input.nombre} actualizado`);
        } else {
          const { cliente: nuevo, usuario } = this.data.agregarCliente(input);
          void this.cuentas.invitar(usuario, nuevo.nombre, 'Cliente creado');
        }
      },
      () => undefined,
    );
  }

  protected invitar(x: { nombre: string; usuario?: Usuario }) {
    if (x.usuario) void this.cuentas.invitar(x.usuario, x.nombre);
  }

  protected enviarClave(x: { nombre: string; usuario?: Usuario }) {
    if (x.usuario) void this.cuentas.enviarClave(x.usuario, x.nombre);
  }

  protected suspender(x: { nombre: string; usuario?: Usuario }) {
    if (x.usuario) void this.cuentas.suspender(x.usuario, x.nombre);
  }

  protected reactivar(x: { nombre: string; usuario?: Usuario }) {
    if (x.usuario) void this.cuentas.reactivar(x.usuario, x.nombre);
  }

  protected async eliminar(c: Cliente) {
    const bloqueo = this.data.motivoClienteNoEliminable(c.id);
    if (bloqueo) {
      this.alert.advertencia(`No se puede eliminar a ${c.nombre}. ${bloqueo}`);
      return;
    }
    const r = this.data.resumenCliente(c.id);
    const confirmado = await this.alert.confirmar({
      titulo: `¿Eliminar a ${c.nombre}?`,
      mensaje: `Se borra todo lo suyo de forma definitiva: ${r.productos} producto(s), ${r.envios} envío(s) (${r.enCurso} en curso, ${r.borradores} borrador(es)), ${r.movimientos} movimiento(s) de stock y su acceso a la app.${r.enCurso ? ' Atención: tiene envíos en curso.' : ''} Esta acción no se puede deshacer.`,
      confirmar: 'Sí, eliminar',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    this.data.eliminarCliente(c.id);
    this.alert.exito(`Cliente ${c.nombre} eliminado`);
  }
}
