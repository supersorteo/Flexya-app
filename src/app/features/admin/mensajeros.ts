import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Mensajero, ZONAS } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { PageHeader } from '../../shared/ui/ui';
import { MensajeroModal } from './mensajero-modal';

@Component({
  selector: 'fx-mensajeros',
  imports: [PageHeader, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Mensajeros y zonas" subtitle="Quién reparte en cada zona y cómo viene su jornada.">
      <button type="button" class="btn btn-primary" (click)="nuevo()"><i class="bi bi-person-plus"></i>Agregar mensajero</button>
    </fx-page-header>

    <section class="fx-panel">
      <div class="fx-panel-head flex-wrap gap-2">
        <div class="fx-muted small">{{ filas().length }} de {{ data.mensajeros().length }} mensajeros</div>
        <input type="search" class="form-control fx-search" placeholder="Buscar por nombre, documento, correo o zona…"
          aria-label="Buscar mensajeros" [value]="q()" (input)="q.set($any($event.target).value)" />
      </div>
      @if (filas().length) {
      <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Tabla de mensajeros">
        <table class="fx-table fx-table--filas">
          <thead>
            <tr><th>Mensajero</th><th>Documento</th><th>Teléfono</th><th>Emergencia</th><th>Zona</th><th>En reparto</th><th>Entregados</th><th>Incidencias</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            @for (m of filas(); track m.id) {
              <tr>
                <td data-label="Mensajero">
                  <strong>{{ m.nombre }}</strong>
                  <span class="fx-sub">{{ m.email }}</span>
                </td>
                <td data-label="Documento">{{ m.tipoDocumento === 'DNI' ? 'DNI ' + formatoDni(m.numeroDocumento) : 'Pas. ' + m.numeroDocumento }}</td>
                <td data-label="Teléfono">{{ m.telefono }}</td>
                <td data-label="Emergencia">{{ m.telefonoEmergencia || '—' }}</td>
                <td data-label="Zona"><span class="fx-status st-deposit">{{ data.nombreZona(m.zonaId) }}</span></td>
                <td data-label="En reparto">{{ m.enReparto }}</td>
                <td data-label="Entregados">{{ m.entregados }}</td>
                <td data-label="Incidencias">{{ m.incidencias }}</td>
                <td data-label="Acciones" class="fx-actions">
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="acceso(m)" [attr.aria-label]="'Generar nueva clave de ' + m.nombre" title="Generar nueva clave de acceso">
                    <i class="bi bi-key"></i><span class="d-none d-xl-inline">Acceso</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="editar(m.id)" [attr.aria-label]="'Editar ' + m.nombre" title="Editar mensajero">
                    <i class="bi bi-pencil"></i><span class="d-none d-xl-inline">Editar</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="eliminar(m)" [attr.aria-label]="'Eliminar ' + m.nombre" title="Eliminar mensajero">
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
          <i class="bi bi-truck fs-2 d-block mb-2"></i>
          {{ q() ? 'No hay mensajeros que coincidan con la búsqueda.' : 'Todavía no hay mensajeros. Agregá el primero.' }}
        </div>
      }
    </section>

    <h2 class="h6 mt-4 mb-3">Cobertura por zona</h2>
    <div class="row g-3">
      @for (z of cobertura(); track z.id) {
        <div class="col-12 col-md-6 col-xl-4">
          <section class="fx-panel h-100 p-3">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div class="fx-panel-title">{{ z.nombre }}</div>
              <span class="fx-status st-route">{{ z.tarifa | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</span>
            </div>
            <div class="fx-muted small mb-2">{{ z.mensajeros }} mensajero(s) · {{ z.envios }} envío(s) · {{ z.localidades.length }} localidades</div>
            <div class="fx-chips">
              @for (l of z.localidades; track l) { <span>{{ l }}</span> }
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class Mensajeros {
  protected readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly modals = inject(NgbModal);

  protected readonly q = signal('');

  protected readonly filas = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.data
      .mensajeros()
      .map((m) => {
        const envios = this.data.envios().filter((e) => e.mensajeroId === m.id);
        const n = (estado: string) => envios.filter((e) => e.estado === estado).length;
        return { ...m, enReparto: n('En reparto'), entregados: n('Entregado'), incidencias: n('Incidencia') };
      })
      .filter(
        (m) =>
          !q ||
          [m.nombre, m.email, m.numeroDocumento, m.telefono, this.data.nombreZona(m.zonaId)].join(' ').toLowerCase().includes(q),
      );
  });

  protected readonly cobertura = computed(() =>
    ZONAS.map((z) => ({
      ...z,
      mensajeros: this.data.mensajeros().filter((m) => m.zonaId === z.id).length,
      envios: this.data.envios().filter((e) => e.zonaId === z.id).length,
    })),
  );

  protected formatoDni(dni: string) {
    return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  protected nuevo() {
    this.abrir(null);
  }

  protected editar(id: string) {
    const mensajero = this.data.mensajeros().find((m) => m.id === id);
    if (mensajero) this.abrir(mensajero);
  }

  private abrir(mensajero: Mensajero | null) {
    const ref = this.modals.open(MensajeroModal, {
      centered: true,
      scrollable: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
      modalDialogClass: 'fx-modal',
      backdropClass: 'fx-backdrop',
    });
    ref.componentInstance.mensajero = mensajero;
    ref.result.then(
      (input) => {
        if (mensajero) {
          this.data.actualizarMensajero(mensajero.id, input);
          this.alert.exito(`Mensajero ${input.nombre} actualizado`);
        } else {
          const { mensajero: nuevo, clave } = this.data.agregarMensajero(input);
          this.mostrarAcceso(nuevo.nombre, nuevo.email, clave, 'Mensajero creado');
        }
      },
      () => undefined,
    );
  }

  protected acceso(m: Mensajero) {
    const r = this.data.regenerarClaveMensajero(m.id);
    if (r) this.mostrarAcceso(m.nombre, r.email, r.clave, 'Nueva clave de acceso');
  }

  private mostrarAcceso(nombre: string, email: string, clave: string, titulo: string) {
    void this.alert.credenciales({ titulo, nombre, email, clave });
  }

  protected async eliminar(m: Mensajero) {
    const motivo = this.data.motivoMensajeroNoEliminable(m.id);
    if (motivo) {
      this.alert.advertencia(`No se puede eliminar a ${m.nombre}. ${motivo}`);
      return;
    }
    const confirmado = await this.alert.confirmar({
      titulo: `¿Eliminar a ${m.nombre}?`,
      mensaje: 'Esta acción no se puede deshacer. Su historial de entregas se conserva y se elimina su acceso.',
      confirmar: 'Sí, eliminar',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    this.data.eliminarMensajero(m.id);
    this.alert.exito(`Mensajero ${m.nombre} eliminado`);
  }
}
