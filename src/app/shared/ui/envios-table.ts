import { etiquetaArrastre } from '../../core/periodos';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Envio, resumenItems } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { AccionesEnvio } from '../../core/services/envio-acciones';
import { EnvioDetalleModal } from '../../features/envios/envio-detalle-modal';
import { CorregirDestinoModal } from '../../features/envios/corregir-destino-modal';
import { CrearEnvio } from '../../features/envios/crear-envio';
import { Empty } from './empty';
import { slugEstado, StatusPill } from './ui';

interface Fila {
  clave: string;
  envio?: Envio;
  grupo?: { retiroId: string; envios: Envio[] };
}

@Component({
  selector: 'fx-envios-table',
  imports: [StatusPill, DatePipe, Empty, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #fechasTpl let-e>
                  <span>Creado {{ e.creadoEn | date: 'dd/MM/yy' }}</span>
                  @if (e.fechaRetiro) { <span class="fx-sub">{{ e.retiro === 'deposito' ? 'Llega' : 'Retiro' }} {{ e.fechaRetiro | date: 'dd/MM/yy' }}{{ e.retiroProgramado ? ' · programado' : '' }}{{ e.franja ? ' · ' + (e.franja === 'manana' ? 'mañana' : 'tarde') : '' }}</span> }
                  @if (e.entregadoEn) { <span class="fx-sub">Entregado {{ e.entregadoEn | date: 'dd/MM/yy HH:mm' }}</span> }
    </ng-template>

    <ng-template #accionesTpl let-e>
                    @if (rol() !== 'mensajero') {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="ver(e)" [attr.aria-label]="'Ver detalle de ' + e.id" title="Ver detalle">
                        <i class="bi bi-eye"></i><span class="d-none d-xl-inline">Detalle</span>
                      </button>
                    }
                    @if (rol() !== 'mensajero' && data.puedeReprogramar(e) && arrastre(e)) {
                      <button type="button" class="btn btn-sm btn-primary" (click)="reprogramar(e)" [attr.aria-label]="'Reprogramar el retiro de ' + e.id" title="Reprogramar retiro">
                        <i class="bi bi-calendar-event"></i><span class="d-none d-xl-inline">Reprogramar</span>
                      </button>
                    }
                    @if (rol() === 'cliente' && data.editableCliente(e)) {
                      <button type="button" class="btn btn-sm btn-outline-warning" (click)="editar(e)" [attr.aria-label]="'Editar ' + e.id" title="Editar envío">
                        <i class="bi bi-pencil"></i><span class="d-none d-xl-inline">Editar</span>
                      </button>
                      @if (e.estado === 'Borrador') {
                        <button type="button" class="btn btn-sm btn-primary" (click)="solicitar(e)" [attr.aria-label]="'Solicitar ' + e.id" title="Solicitar envío">
                          <i class="bi bi-send"></i><span class="d-none d-xl-inline">Solicitar</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger" (click)="eliminarBorrador(e)" [attr.aria-label]="'Eliminar borrador ' + e.id" title="Eliminar borrador">
                          <i class="bi bi-trash3"></i><span class="d-none d-xl-inline">Eliminar</span>
                        </button>
                      } @else {
                        <button type="button" class="btn btn-sm btn-outline-danger" (click)="cancelar(e)" [attr.aria-label]="'Cancelar ' + e.id" title="Cancelar envío">
                          <i class="bi bi-x-circle"></i><span class="d-none d-xl-inline">Cancelar</span>
                        </button>
                      }
                    }
                    @if (rol() === 'admin' && data.puedeRecepcionar(e)) {
                      <button type="button" class="btn btn-sm btn-success" (click)="recepcionar(e)" [attr.aria-label]="'Recepcionar ' + e.id" title="Recepcionar en depósito">
                        <i class="bi bi-box-arrow-in-down"></i><span class="d-none d-xl-inline">Recepcionar</span>
                      </button>
                    }
                    @if (rol() === 'admin' && data.puedeAsignarse(e)) {
                      @if (!data.mensajeros().length) {
                        <small class="fx-muted">Primero creá un mensajero.</small>
                      } @else {
                        <select #sel class="form-select form-select-sm" [attr.aria-label]="'Mensajero para ' + e.id">
                          @for (m of mensajerosPara(e); track m.id) {
                            <option [value]="m.id">{{ m.nombre }} · {{ data.nombreZona(m.zonaId) }}{{ m.zonaId === e.zonaId ? ' (zona)' : '' }}</option>
                          }
                        </select>
                        <button type="button" class="btn btn-sm btn-primary" (click)="asignar(e, sel.value)" [attr.aria-label]="'Asignar ' + e.id" title="Asignar al mensajero">
                          <i class="bi bi-person-check"></i><span class="d-none d-xl-inline">Asignar</span>
                        </button>
                      }
                    }
                    @if (rol() === 'admin' && data.puedeObservar(e)) {
                      <button type="button" class="btn btn-sm btn-outline-warning" (click)="observar(e)" [attr.aria-label]="'Reportar diferencia en ' + e.id" title="Reportar diferencia">
                        <i class="bi bi-exclamation-triangle"></i><span class="d-none d-xl-inline">Diferencia</span>
                      </button>
                    }
                    @if (rol() === 'admin' && e.estado === 'En revisión') {
                      <button type="button" class="btn btn-sm btn-primary" (click)="reanudar(e)" [attr.aria-label]="'Reanudar ' + e.id" title="Reanudar envío">
                        <i class="bi bi-play-circle"></i><span class="d-none d-xl-inline">Reanudar</span>
                      </button>
                    }
                    @if (rol() === 'admin' && e.estado === 'Incidencia') {
                      <button type="button" class="btn btn-sm btn-success" (click)="reingresar(e)" [attr.aria-label]="'Confirmar reingreso de ' + e.id" title="Confirmar reingreso al depósito">
                        <i class="bi bi-box-arrow-in-down"></i><span class="d-none d-xl-inline">Reingreso</span>
                      </button>
                    }
                    @if (rol() === 'cliente' && e.estado === 'En devolución') {
                      <button type="button" class="btn btn-sm btn-success" (click)="confirmarDevolucion(e)" [attr.aria-label]="'Confirmar que recibí ' + e.id" title="Confirmar que recibí la devolución">
                        <i class="bi bi-check2-circle"></i><span class="d-none d-xl-inline">Recibí</span>
                      </button>
                    }
                    @if ((rol() === 'admin' || rol() === 'cliente') && data.puedeCorregirDestino(e)) {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="corregirDestino(e)" [attr.aria-label]="'Corregir destino de ' + e.id" title="Corregir datos de entrega">
                        <i class="bi bi-geo-alt"></i><span class="d-none d-xl-inline">Destino</span>
                      </button>
                    }
                    @if (rol() === 'admin' && data.puedeDevolver(e)) {
                      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="devolver(e)" [attr.aria-label]="'Devolver ' + e.id + ' al cliente'" title="Devolver al cliente">
                        <i class="bi bi-arrow-return-left"></i><span class="d-none d-xl-inline">Devolver</span>
                      </button>
                    }
                    @if (rol() === 'admin' && data.puedeCancelarAdmin(e)) {
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="cancelarAdmin(e)" [attr.aria-label]="'Cancelar ' + e.id" title="Cancelar envío">
                        <i class="bi bi-x-circle"></i><span class="d-none d-xl-inline">Cancelar</span>
                      </button>
                    }
                    @if (rol() === 'admin' && data.puedeEliminarAdmin(e)) {
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="eliminarAdmin(e)" [attr.aria-label]="'Eliminar ' + e.id" title="Eliminar envío">
                        <i class="bi bi-trash3"></i><span class="d-none d-xl-inline">Eliminar</span>
                      </button>
                    }
                    @if (rol() === 'mensajero' && e.estado === 'En reparto') {
                      <button type="button" class="btn btn-sm btn-success" (click)="entregar(e)" [attr.aria-label]="'Marcar ' + e.id + ' como entregado'" title="Marcar como entregado">
                        <i class="bi bi-check2-circle"></i><span class="d-none d-xl-inline">Entregado</span>
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-warning" (click)="incidencia(e)" [attr.aria-label]="'Reportar incidencia en ' + e.id" title="Reportar incidencia">
                        <i class="bi bi-exclamation-triangle"></i><span class="d-none d-xl-inline">Incidencia</span>
                      </button>
                    }
    </ng-template>

    @if (envios().length) {
      @if (esMovil()) {
        <div class="fx-cards" role="list" aria-label="Envíos">
          @for (f of filas(); track f.clave) {
            @if (f.grupo; as g) {
              <div class="fx-card-grupo" role="listitem">
                <button type="button" class="fx-grupo-titulo" (click)="alternarGrupo(g.retiroId)" [attr.aria-expanded]="!cerrados().has(g.retiroId)" [attr.aria-label]="'Retiro ' + g.retiroId">
                  <i [class]="'bi ' + (cerrados().has(g.retiroId) ? 'bi-chevron-right' : 'bi-chevron-down')" aria-hidden="true"></i>
                  <strong>Retiro {{ g.retiroId }}</strong>
                  <span>{{ g.envios.length }} destinatarios</span>
                </button>
                <span class="fx-muted fx-card-grupo-progreso">{{ progreso(g.envios) }}</span>
                @if (rol() === 'cliente' && cancelables(g.envios) > 0) {
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="cancelarRetiro(g.retiroId, g.envios)" [attr.aria-label]="'Cancelar el retiro ' + g.retiroId" title="Cancelar el retiro completo">
                    <i class="bi bi-x-circle"></i>Cancelar retiro
                  </button>
                }
              </div>
            } @else {
              @let e = f.envio!;
              <article role="listitem" [class]="'fx-envio-card riel-' + slug(e)">
                <header class="fx-card-cab">
                  <strong class="fx-card-id">{{ e.id }}</strong>
                  <fx-status [estado]="e.estado" />
                </header>
                @if (arrastre(e); as a) {
                  <span class="fx-arrastre"><i class="bi bi-arrow-return-right" aria-hidden="true"></i>{{ a }}</span>
                }
                <h3 class="fx-card-nombre">{{ e.destinatario }}</h3>
                @if (rol() !== 'cliente') {
                  <p class="fx-card-linea"><i class="bi bi-shop" aria-hidden="true"></i><span>{{ data.nombreCliente(e.clienteId) }}</span></p>
                }
                <p class="fx-card-linea"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span>{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></span></p>
                <p class="fx-card-linea fx-card-linea--suave"><i class="bi bi-box-seam" aria-hidden="true"></i><span>{{ detalle(e) }}</span></p>
                @if (rol() === 'admin') {
                  <p class="fx-card-linea fx-card-linea--suave"><i class="bi bi-truck" aria-hidden="true"></i><span>{{ e.mensajeroId ? data.nombreMensajero(e.mensajeroId) : 'Sin mensajero asignado' }}</span></p>
                }
                <div class="fx-card-fechas">
                  <ng-container [ngTemplateOutlet]="fechasTpl" [ngTemplateOutletContext]="{ $implicit: e }" />
                </div>
                @if (acciones()) {
                  <div class="fx-card-acciones">
                    <ng-container [ngTemplateOutlet]="accionesTpl" [ngTemplateOutletContext]="{ $implicit: e }" />
                  </div>
                }
              </article>
            }
          }
        </div>
      } @else {
        <div class="fx-table-scroll" tabindex="0" role="region" aria-label="Tabla de envíos">
          <table class="fx-table fx-table--filas">
            <thead>
              <tr>
                <th>Envío</th>
                <th>Estado</th>
                @if (rol() !== 'cliente') {
                  <th>Cliente</th>
                }
                <th>Destinatario</th>
                <th>Destino</th>
                <th>Fechas</th>
                @if (rol() === 'admin') {
                  <th>Mensajero</th>
                }
                @if (acciones()) {
                  <th>Acciones</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.clave) {
                @if (f.grupo; as g) {
                  <tr class="fx-grupo-fila">
                    <td [attr.colspan]="columnas()">
                      <div class="fx-grupo">
                        <button type="button" class="fx-grupo-titulo" (click)="alternarGrupo(g.retiroId)" [attr.aria-expanded]="!cerrados().has(g.retiroId)" [attr.aria-label]="'Retiro ' + g.retiroId">
                          <i [class]="'bi ' + (cerrados().has(g.retiroId) ? 'bi-chevron-right' : 'bi-chevron-down')" aria-hidden="true"></i>
                          <strong>Retiro {{ g.retiroId }}</strong>
                          <span>{{ g.envios.length }} destinatarios</span>
                          <span class="fx-muted">· {{ progreso(g.envios) }}</span>
                        </button>
                        @if (rol() === 'cliente' && cancelables(g.envios) > 0) {
                          <button type="button" class="btn btn-sm btn-outline-danger" (click)="cancelarRetiro(g.retiroId, g.envios)" [attr.aria-label]="'Cancelar el retiro ' + g.retiroId" title="Cancelar el retiro completo">
                            <i class="bi bi-x-circle"></i><span class="d-none d-xl-inline">Cancelar retiro</span>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                } @else {
                @let e = f.envio!;
                <tr>
                  <td data-label="Envío"><strong>{{ e.id }}</strong><span class="fx-sub">{{ detalle(e) }}</span>@if (arrastre(e); as a) {<span class="fx-arrastre"><i class="bi bi-arrow-return-right" aria-hidden="true"></i>{{ a }}</span>}</td>
                  <td data-label="Estado"><fx-status [estado]="e.estado" /></td>
                  @if (rol() !== 'cliente') {
                    <td data-label="Cliente">{{ data.nombreCliente(e.clienteId) }}</td>
                  }
                  <td data-label="Destinatario">{{ e.destinatario }}</td>
                  <td data-label="Destino">{{ e.direccion }} · {{ e.localidad }} <span class="fx-zone">{{ data.nombreZona(e.zonaId) }}</span></td>
                  <td data-label="Fechas">
                    <ng-container [ngTemplateOutlet]="fechasTpl" [ngTemplateOutletContext]="{ $implicit: e }" />
                  </td>
                  @if (rol() === 'admin') {
                    <td data-label="Mensajero">{{ data.nombreMensajero(e.mensajeroId) }}</td>
                  }
                  @if (acciones()) {
                    <td data-label="Acciones" class="fx-actions">
                      <ng-container [ngTemplateOutlet]="accionesTpl" [ngTemplateOutletContext]="{ $implicit: e }" />
                    </td>
                  }
                </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <fx-empty icono="inbox" titulo="No hay envíos para mostrar" descripcion="Cuando haya movimientos, los vas a ver acá." />
    }
  `,
})
export class EnviosTable {
  protected readonly data = inject(DataService);
  private readonly alert = inject(AlertService);
  private readonly accionesEnvio = inject(AccionesEnvio);
  private readonly auth = inject(AuthService);
  private readonly modals = inject(NgbModal);
  private readonly crear = inject(CrearEnvio);

  readonly envios = input.required<Envio[]>();
  readonly acciones = input(false);
  protected readonly rol = () => this.auth.user()?.rol;

  /** En teléfono cada envío es una tarjeta; en pantallas más grandes sigue la tabla. */
  protected readonly esMovil = signal(false);

  constructor() {
    const consulta = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(max-width: 767px)') : null;
    if (!consulta) return;
    this.esMovil.set(consulta.matches);
    const alCambiar = (e: { matches: boolean }) => this.esMovil.set(e.matches);
    consulta.addEventListener?.('change', alCambiar);
    inject(DestroyRef).onDestroy(() => consulta.removeEventListener?.('change', alCambiar));
  }

  protected slug(e: Envio): string {
    return slugEstado(e.estado);
  }

  protected readonly cerrados = signal<ReadonlySet<string>>(new Set());

  protected readonly filas = computed<Fila[]>(() => {
    const lista = this.envios();
    const clave = (e: Envio) => e.retiroId || e.id;
    const porRetiro = new Map<string, Envio[]>();
    for (const e of lista) porRetiro.set(clave(e), [...(porRetiro.get(clave(e)) ?? []), e]);
    const salida: Fila[] = [];
    const vistos = new Set<string>();
    for (const e of lista) {
      const grupo = porRetiro.get(clave(e))!;
      if (grupo.length < 2) {
        salida.push({ clave: e.id, envio: e });
        continue;
      }
      if (vistos.has(clave(e))) continue;
      vistos.add(clave(e));
      salida.push({ clave: 'g-' + clave(e), grupo: { retiroId: clave(e), envios: grupo } });
      if (!this.cerrados().has(clave(e))) for (const g of grupo) salida.push({ clave: g.id, envio: g });
    }
    return salida;
  });

  protected columnas(): number {
    return 5 + (this.rol() !== 'cliente' ? 1 : 0) + (this.rol() === 'admin' ? 1 : 0) + (this.acciones() ? 1 : 0);
  }

  protected alternarGrupo(retiroId: string) {
    const nuevo = new Set(this.cerrados());
    if (!nuevo.delete(retiroId)) nuevo.add(retiroId);
    this.cerrados.set(nuevo);
  }

  protected progreso(envios: Envio[]): string {
    const entregados = envios.filter((e) => e.estado === 'Entregado').length;
    const cancelados = envios.filter((e) => e.estado === 'Cancelado' || e.estado === 'Devuelto').length;
    const incidencias = envios.filter((e) => e.estado === 'Incidencia' || e.estado === 'En revisión').length;
    const partes = [`${entregados} de ${envios.length} entregados`];
    if (cancelados) partes.push(`${cancelados} ${cancelados === 1 ? 'cancelado' : 'cancelados'}`);
    if (incidencias) partes.push(`${incidencias} con novedades`);
    return partes.join(' · ');
  }

  protected cancelables(envios: Envio[]): number {
    return envios.filter((e) => this.data.cancelableCliente(e)).length;
  }

  protected cancelarRetiro(retiroId: string, envios: Envio[]) {
    void this.accionesEnvio.cancelarRetiro(retiroId, envios);
  }

  protected arrastre(e: Envio) {
    return etiquetaArrastre(e, new Date());
  }

  protected detalle(e: Envio): string {
    const r = resumenItems(e.items ?? []);
    const partes: string[] = [];
    if (r.unidades) partes.push(`${r.unidades} u.`);
    if (r.peso !== null) partes.push(`${r.peso.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg${r.completo ? '' : '+'}`);
    partes.push(e.retiro === 'domicilio' ? 'Retiro en domicilio' : e.retiro === 'recoleccion' ? 'Retiro y depósito' : 'Lo lleva al depósito');
    return partes.join(' · ');
  }

  protected mensajerosPara(e: Envio) {
    const todos = this.data.mensajeros();
    return [...todos.filter((m) => m.zonaId === e.zonaId), ...todos.filter((m) => m.zonaId !== e.zonaId)];
  }

  protected ver(e: Envio) {
    const ref = this.modals.open(EnvioDetalleModal, { centered: true, scrollable: true, size: 'lg', modalDialogClass: 'fx-modal', backdropClass: 'fx-backdrop' });
    ref.componentInstance.envio = e;
    ref.result.then(
      () => undefined,
      () => undefined,
    );
  }

  protected reprogramar(e: Envio) {
    void this.accionesEnvio.reprogramar(e);
  }

  protected editar(e: Envio) {
    this.crear.editar(e);
  }

  protected cancelar(e: Envio) {
    void this.accionesEnvio.cancelar(e);
  }

  protected observar(e: Envio) {
    void this.accionesEnvio.observar(e);
  }

  protected reanudar(e: Envio) {
    void this.accionesEnvio.reanudar(e);
  }

  protected cancelarAdmin(e: Envio) {
    void this.accionesEnvio.cancelarComoAdmin(e);
  }

  protected reingresar(e: Envio) {
    void this.accionesEnvio.reingresar(e);
  }

  protected devolver(e: Envio) {
    void this.accionesEnvio.devolver(e);
  }

  protected confirmarDevolucion(e: Envio) {
    void this.accionesEnvio.confirmarDevolucion(e);
  }

  protected corregirDestino(e: Envio) {
    const ref = this.modals.open(CorregirDestinoModal, {
      centered: true, scrollable: true, backdrop: 'static', keyboard: false, modalDialogClass: 'fx-modal', backdropClass: 'fx-backdrop',
    });
    ref.componentInstance.envio = e;
    const clienteId = this.rol() === 'cliente' ? this.auth.user()?.clienteId : undefined;
    ref.result.then(
      (datos) => {
        if (this.data.corregirDestino(e.id, datos, clienteId)) this.alert.exito(`Datos de ${e.id} corregidos`);
        else this.alert.advertencia('No se pudieron corregir los datos.');
      },
      () => undefined,
    );
  }

  protected solicitar(e: Envio) {
    void this.accionesEnvio.solicitar(e);
  }

  protected eliminarBorrador(e: Envio) {
    void this.accionesEnvio.eliminarBorrador(e);
  }

  protected eliminarAdmin(e: Envio) {
    void this.accionesEnvio.eliminarComoAdmin(e);
  }

  protected recepcionar(e: Envio) {
    void this.accionesEnvio.recepcionar(e);
  }

  protected asignar(e: Envio, mensajeroId: string) {
    void this.accionesEnvio.asignar(e, mensajeroId);
  }

  protected entregar(e: Envio) {
    void this.accionesEnvio.entregar(e);
  }

  protected incidencia(e: Envio) {
    void this.accionesEnvio.incidencia(e);
  }
}
