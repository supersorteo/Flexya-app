import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { enCursoMensajero } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ParadaCard } from '../../shared/ui/parada-card';
import { PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-mis-paradas',
  imports: [PageHeader, ParadaCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Mis envíos" subtitle="Tus paradas, con llamada, WhatsApp y mapa a un toque." />

    <div class="fx-tabs" role="tablist" aria-label="Estado de los envíos">
      <button type="button" role="tab" [class.active]="vista() === 'activas'" [attr.aria-selected]="vista() === 'activas'" (click)="vista.set('activas')">
        En curso <span class="fx-tab-count">{{ activas().length }}</span>
      </button>
      <button type="button" role="tab" [class.active]="vista() === 'cerradas'" [attr.aria-selected]="vista() === 'cerradas'" (click)="vista.set('cerradas')">
        Cerradas <span class="fx-tab-count">{{ cerradas().length }}</span>
      </button>
    </div>

    <div class="fx-paradas">
      @for (e of lista(); track e.id) {
        <fx-parada [envio]="e" />
      } @empty {
        <div class="fx-panel text-center fx-muted py-5 px-3 fx-paradas-vacio">
          <i class="bi bi-inbox fs-2 d-block mb-2"></i>
          {{ vista() === 'activas' ? 'No tenés envíos en curso por ahora.' : 'Todavía no cerraste ningún envío.' }}
        </div>
      }
    </div>
  `,
})
export class MisParadas {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  protected readonly vista = signal<'activas' | 'cerradas'>('activas');
  private readonly propios = computed(() => this.data.enviosDe(this.auth.user()));
  protected readonly activas = computed(() => this.propios().filter((e) => enCursoMensajero(e)));
  protected readonly cerradas = computed(() => this.propios().filter((e) => !enCursoMensajero(e)));
  protected readonly lista = computed(() => (this.vista() === 'activas' ? this.activas() : this.cerradas()));
}
