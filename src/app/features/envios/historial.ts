import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fechaCierre } from '../../core/periodos';
import { PeriodoService } from '../../core/services/periodo.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EnviosTable } from '../../shared/ui/envios-table';
import { PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'fx-historial',
  imports: [PageHeader, EnviosTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fx-page-header title="Historial" subtitle="Envíos cerrados en el período elegido: entregados, devueltos y cancelados." />
    <section class="fx-panel"><fx-envios-table [envios]="cerrados()" /></section>
  `,
})
export class Historial {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  protected readonly periodo = inject(PeriodoService).rango;

  protected readonly cerrados = computed(() => {
    const { desde, hasta } = this.periodo();
    return this.data
      .enviosDe(this.auth.user())
      .filter((e) => ['Entregado', 'Devuelto', 'Cancelado'].includes(e.estado) && fechaCierre(e) >= desde && fechaCierre(e) < hasta)
      .sort((a, b) => fechaCierre(b) - fechaCierre(a));
  });
}
