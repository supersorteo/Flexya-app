import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { TestBed } from '@angular/core/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, MensajeroInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { Pagos } from './pagos';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

registerLocaleData(localeEsAr);

describe('Pantalla de pagos del superadmin', () => {
  let alerta: { exito: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmar: ReturnType<typeof vi.fn>; pedirTexto: ReturnType<typeof vi.fn> };
  let data: DataService;
  let mensajeroId: string;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    alerta = { exito: vi.fn(), advertencia: vi.fn(), confirmar: vi.fn().mockResolvedValue(true), pedirTexto: vi.fn().mockResolvedValue('Transferencia 1') };
    TestBed.configureTestingModule({ providers: [{ provide: AlertService, useValue: alerta }] });
    data = TestBed.inject(DataService);
    const clienteId = data.agregarCliente(cliente).cliente.id;
    mensajeroId = data.agregarMensajero(mensajero).mensajero.id;
    const e = data.crearEnvio({ destinatario: 'Ana', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', retiro: 'deposito' }, clienteId);
    data.recepcionar(e.id);
    data.asignar(e.id, mensajeroId);
    data.entregar(e.id);
  });

  function pantalla() {
    const f = TestBed.createComponent(Pagos);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, comp: f.componentInstance as unknown as { guardar: () => Promise<void>; form: { controls: Record<string, { setValue: (v: unknown) => void }>; getRawValue: () => unknown }; pagar: (l: unknown) => Promise<void>; liquidar: (m: unknown) => void } };
  }

  it('muestra los indicadores, lo que hay por liquidar y la configuración de porcentajes', () => {
    const { el } = pantalla();
    expect(el.textContent).toContain('Ingresos por entregas');
    expect(el.textContent).toContain('Margen de Flexya');
    expect(el.textContent).toContain('Santiago Pereyra');
    expect(el.querySelectorAll('input[type=number]').length).toBeGreaterThan(8);
    expect(el.textContent).toContain('Por zona (opcional)');
    expect(el.textContent).toContain('Por mensajero (opcional)');
  });

  it('guarda los porcentajes con confirmación, solo los overrides cargados', async () => {
    const { f, comp } = pantalla();
    comp.form.controls['general'].setValue(65);
    comp.form.controls['fallido'].setValue(20);
    comp.form.controls['adicionalRetiro'].setValue(300);
    (comp.form.controls['zonas'] as unknown as { controls: Record<string, { setValue: (v: unknown) => void }> }).controls['caba-norte'].setValue('75');
    (comp.form.controls['mensajeros'] as unknown as { controls: Record<string, { setValue: (v: unknown) => void }> }).controls[mensajeroId].setValue('80');

    alerta.confirmar.mockResolvedValueOnce(false);
    await comp.guardar();
    expect(data.configPagos().porcentajeGeneral).toBe(60);

    await comp.guardar();
    f.detectChanges();
    expect(data.configPagos()).toMatchObject({
      porcentajeGeneral: 65, porcentajeIntentoFallido: 20, adicionalRetiro: 300, porZona: { 'caba-norte': 75 }, porMensajero: { [mensajeroId]: 80 },
    });
    expect(alerta.exito).toHaveBeenCalledWith('Comisiones guardadas');
  });

  it('no guarda un porcentaje fuera de 0 a 100', async () => {
    const { comp } = pantalla();
    comp.form.controls['general'].setValue(120);
    await comp.guardar();
    expect(alerta.advertencia).toHaveBeenCalled();
    expect(data.configPagos().porcentajeGeneral).toBe(60);
  });

  it('liquida con el modal, paga con el medio y muestra los estados', async () => {
    const { f, el, comp } = pantalla();
    const abrir = vi.spyOn(TestBed.inject(NgbModal), 'open').mockReturnValue({
      componentInstance: {}, result: Promise.resolve({ desde: '2000-01-01', hasta: '2999-12-31' }),
    } as never);
    comp.liquidar({ id: mensajeroId, nombre: 'Santiago Pereyra' });
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    expect(abrir).toHaveBeenCalled();
    expect(data.liquidaciones()).toHaveLength(1);
    expect(el.textContent).toContain('LQ-');
    expect(el.textContent).toContain('Generada');

    await comp.pagar(data.liquidaciones()[0]);
    f.detectChanges();
    expect(data.liquidaciones()[0]).toMatchObject({ estado: 'Pagada', pago: 'Transferencia 1' });
    expect(el.textContent).toContain('Pagada');
  });
});
