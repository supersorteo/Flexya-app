import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-historial',
  imports: [PageHeader, EnviosTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Historial" subtitle="Envíos ya cerrados: entregados, cancelados y con incidencias." />
    <section class="fx-panel"><fx-envios-table [envios]="cerrados()" /></section>
  `,
})
export class Historial {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  protected readonly cerrados = computed(() =>
    this.data.enviosDe(this.auth.user()).filter((e) => ['Entregado', 'Cancelado', 'Incidencia'].includes(e.estado)),
  );
}
