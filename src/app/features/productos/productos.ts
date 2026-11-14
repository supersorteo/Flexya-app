import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Producto, STOCK_BAJO, volumenProducto } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { PageHeader } from '../../shared/ui/ui';
import { MovimientosModal } from './movimientos-modal';
import { ProductoModal } from './producto-modal';

@Component({
  selector: 'fx-productos',
  imports: [PageHeader, CurrencyPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Productos" subtitle="Cargá lo que enviás: medidas, peso y precio. Con estos datos armás tus envíos.">
      <button type="button" class="btn btn-primary" (click)="nuevo()"><i class="bi bi-plus-lg"></i>Nuevo producto</button>
    </fx-page-header>

    <section class="fx-panel">
      <div class="fx-panel-head flex-wrap gap-2">
        <div class="fx-muted small">{{ filas().length }} de {{ propios().length }} productos</div>
        <input type="search" class="form-control fx-search" placeholder="Buscar por nombre o descripción…"
          aria-label="Buscar productos" [value]="q()" (input)="q.set($any($event.target).value)" />
      </div>
      @if (filas().length) {
      <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Tabla de productos">
        <table class="fx-table fx-table--filas">
          <thead>
            <tr><th>Producto</th><th>Medidas (alto × ancho × largo)</th><th>Peso</th><th>Volumen</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            @for (p of filas(); track p.id) {
              <tr>
                <td data-label="Producto">
                  <strong>{{ p.nombre }}</strong>
                  @if (p.descripcion) { <span class="fx-sub fx-sub--corto">{{ p.descripcion }}</span> }
                </td>
                <td data-label="Medidas">
                  @if (p.alto !== null || p.ancho !== null || p.largo !== null) {
                    {{ (p.alto | number: '1.0-1') ?? '—' }} × {{ (p.ancho | number: '1.0-1') ?? '—' }} × {{ (p.largo | number: '1.0-1') ?? '—' }} cm
                  } @else {
                    <span class="fx-muted">—</span>
                  }
                </td>
                <td data-label="Peso">
                  @if (p.peso !== null) { {{ p.peso | number: '1.0-3' }} kg } @else { <span class="fx-muted">—</span> }
                </td>
                <td data-label="Volumen">
                  @if (volumen(p); as v) { {{ v | number: '1.0-1' }} cm³ } @else { <span class="fx-muted">—</span> }
                </td>
                <td data-label="Precio">
                  @if (p.precio !== null) { <strong>{{ p.precio | currency: 'ARS' : 'symbol-narrow' : '1.2-2' }}</strong> } @else { <span class="fx-muted">—</span> }
                </td>
                <td data-label="Stock">
                  @if (p.stock === 0) {
                    <span class="badge text-bg-danger">Agotado</span>
                  } @else {
                    <strong>{{ p.stock | number: '1.0-0' }}</strong>
                    @if (p.stock <= stockBajo) { <span class="badge text-bg-warning ms-1">Bajo</span> }
                  }
                </td>
                <td data-label="Acciones" class="fx-actions">
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="movimientos(p)" [attr.aria-label]="'Movimientos de ' + p.nombre" title="Movimientos de stock">
                    <i class="bi bi-clock-history"></i><span class="d-none d-xl-inline">Stock</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="editar(p.id)" [attr.aria-label]="'Editar ' + p.nombre" title="Editar producto">
                    <i class="bi bi-pencil"></i><span class="d-none d-xl-inline">Editar</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="eliminar(p)" [attr.aria-label]="'Eliminar ' + p.nombre" title="Eliminar producto">
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
          <i class="bi bi-box-seam fs-2 d-block mb-2"></i>
          @if (q()) {
            No hay productos que coincidan con la búsqueda.
          } @else {
            <p class="mb-3">Todavía no cargaste ningún producto.</p>
            <button type="button" class="btn btn-primary" (click)="nuevo()"><i class="bi bi-plus-lg"></i>Crear mi primer producto</button>
          }
        </div>
      }
    </section>
  `,
})
export class Productos {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly modals = inject(NgbModal);

  protected readonly q = signal('');
  protected readonly volumen = volumenProducto;
  protected readonly stockBajo = STOCK_BAJO;
  protected readonly propios = computed(() => this.data.productosDe(this.auth.user()));
  protected readonly filas = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.propios().filter((p) => !q || `${p.nombre} ${p.descripcion}`.toLowerCase().includes(q));
  });

  protected nuevo() {
    this.abrir(null);
  }

  protected editar(id: string) {
    const producto = this.propios().find((p) => p.id === id);
    if (producto) this.abrir(producto);
  }

  private abrir(producto: Producto | null) {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return;
    const ref = this.modals.open(ProductoModal, {
      centered: true,
      scrollable: true,
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
      modalDialogClass: 'fx-modal',
      backdropClass: 'fx-backdrop',
    });
    ref.componentInstance.producto = producto;
    ref.componentInstance.clienteId = clienteId;
    ref.result.then(
      (input) => {
        if (producto) {
          this.data.actualizarProducto(producto.id, clienteId, input);
          this.alert.exito(`Producto ${input.nombre} actualizado`);
        } else {
          this.data.agregarProducto(clienteId, input);
          this.alert.exito(`Producto ${input.nombre} creado`);
        }
      },
      () => undefined,
    );
  }

  protected movimientos(p: Producto) {
    const ref = this.modals.open(MovimientosModal, { centered: true, scrollable: true, size: 'lg', modalDialogClass: 'fx-modal', backdropClass: 'fx-backdrop' });
    ref.componentInstance.producto = p;
  }

  protected async eliminar(p: Producto) {
    const clienteId = this.auth.user()?.clienteId;
    if (!clienteId) return;
    const motivo = this.data.motivoProductoNoEliminable(p.id);
    if (motivo) {
      this.alert.advertencia(`No se puede eliminar ${p.nombre}. ${motivo}`);
      return;
    }
    const confirmado = await this.alert.confirmar({
      titulo: `¿Eliminar ${p.nombre}?`,
      mensaje: `${p.stock > 0 ? `Perdés ${p.stock} unidades de stock y ` : 'Se elimina '}su historial de movimientos. Los envíos ya hechos conservan sus datos. Esta acción no se puede deshacer.`,
      confirmar: 'Sí, eliminar',
      tipo: 'peligro',
    });
    if (!confirmado) return;
    this.data.eliminarProducto(p.id, clienteId);
    this.alert.exito(`Producto ${p.nombre} eliminado`);
  }
}
