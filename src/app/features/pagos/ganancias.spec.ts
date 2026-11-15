import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { TestBed } from '@angular/core/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, MensajeroInput } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { Ganancias } from './ganancias';

registerLocaleData(localeEsAr);

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };
const TODO = ['2000-01-01', '2999-12-31'] as const;

describe('Ganancias del mensajero: ve lo que va a cobrar', () => {
  let data: DataService;
  let mensajeroId: string;
  let otroId: string;

  function entrega(m: string) {
    const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, data.clientes()[0].id);
    data.recepcionar(e.id);
    data.asignar(e.id, m);
    data.entregar(e.id);
  }
  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: () => ({ rol: 'mensajero', mensajeroId }) } }],
    });
    data = TestBed.inject(DataService);
    data.agregarCliente(cliente);
    mensajeroId = data.agregarMensajero(mensajero).mensajero.id;
    otroId = data.agregarMensajero({ ...mensajero, numeroDocumento: '28456124', email: 'otro@flexya.com' }).mensajero.id;
  });

  describe('lo que va a cobrar', () => {
    it('antes de liquidar es lo acumulado', () => {
      entrega(mensajeroId);
      entrega(mensajeroId);
      const g = data.gananciasDe(mensajeroId);
      expect(g.pendiente).toBe(g.semana);
      expect(g.acumulado).toBe(g.pendiente);
      expect(g.liquidado).toBe(0);
    });

    it('al liquidar con descuento, "a cobrar" pasa a ser lo que realmente le van a pagar', () => {
      entrega(mensajeroId);
      entrega(mensajeroId);
      const ganado = data.gananciasDe(mensajeroId).semana;
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 100 })!;
      const g = data.gananciasDe(mensajeroId);
      expect(l.neto).toBe(Math.round((ganado - 100) * 100) / 100);
      expect(g.pendiente).toBe(l.neto);
      expect(g.liquidado).toBe(l.neto);
      expect(g.acumulado).toBe(0);
      expect(g.cobrado).toBe(0);
    });

    it('al pagarle, pasa de "a cobrar" a "cobrado" por el mismo importe', () => {
      entrega(mensajeroId);
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 50 })!;
      data.pagarLiquidacion(l.id, 'Transferencia');
      const g = data.gananciasDe(mensajeroId);
      expect(g.pendiente).toBe(0);
      expect(g.cobrado).toBe(l.neto);
    });

    it('guarda el último pago para que la tarjeta pueda decir "Cobrado" con esa cifra', () => {
      entrega(mensajeroId);
      expect(data.gananciasDe(mensajeroId).ultimoPago).toBeNull();
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 50 })!;
      expect(data.gananciasDe(mensajeroId).ultimoPago).toBeNull();
      data.pagarLiquidacion(l.id, 'Transferencia');
      expect(data.gananciasDe(mensajeroId).ultimoPago).toMatchObject({ importe: l.neto });

      entrega(mensajeroId);
      const l2 = data.generarLiquidacion(mensajeroId, ...TODO)!;
      data.pagarLiquidacion(l2.id, 'Transferencia');
      expect(data.gananciasDe(mensajeroId).ultimoPago?.importe).toBe(l2.neto);
    });

    it('lo nuevo se suma a lo ya liquidado sin pisarlo', () => {
      entrega(mensajeroId);
      const l = data.generarLiquidacion(mensajeroId, ...TODO)!;
      entrega(mensajeroId);
      const g = data.gananciasDe(mensajeroId);
      expect(g.liquidado).toBe(l.neto);
      expect(g.acumulado).toBeGreaterThan(0);
      expect(g.pendiente).toBe(Math.round((g.liquidado + g.acumulado) * 100) / 100);
    });

    it('si se anula la liquidación, vuelve a ser lo acumulado, sin descuento', () => {
      entrega(mensajeroId);
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 100 })!;
      data.anularLiquidacion(l.id);
      const g = data.gananciasDe(mensajeroId);
      expect(g.liquidado).toBe(0);
      expect(g.pendiente).toBe(g.semana);
    });

    it('el superadmin cuenta lo mismo: debe el neto de lo liquidado y lo bruto de lo que falta liquidar', () => {
      entrega(mensajeroId);
      entrega(otroId);
      const bruto = data.comisiones().find((c) => c.mensajeroId === otroId)!.monto;
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 100 })!;
      expect(data.resumenPagos().pendiente).toBe(Math.round((l.neto + bruto) * 100) / 100);
    });
  });

  describe('la pantalla', () => {
    it('muestra primero lo que va a cobrar, sin tarifas, porcentajes ni cuentas', () => {
      entrega(mensajeroId);
      const l = data.generarLiquidacion(mensajeroId, ...TODO, { concepto: 'Adelanto', monto: 200 })!;
      const f = TestBed.createComponent(Ganancias);
      f.detectChanges();
      const t = texto(f);
      expect(t).toContain('A cobrar');
      expect(t).toContain('Ya liquidado: falta que te lo paguen');
      expect(t).toContain('Por cobrar');
      expect(t).toContain(l.id);
      const pagos = (f.nativeElement as HTMLElement).querySelector('table[role], .fx-table')!.closest('section')!.querySelectorAll('th');
      expect([...pagos].map((th) => th.textContent!.trim())).toEqual(['Pago', 'Período', 'Importe', 'Estado', 'Recibo']);
      expect(t).not.toContain('Descuentos');
      expect(t).not.toContain('menos los descuentos');
      expect(t).not.toContain('Adelanto');
      expect(t).not.toContain('%');
    });

    it('cada entrega muestra solo lo que ganó y su estado en palabras del mensajero', () => {
      entrega(mensajeroId);
      entrega(mensajeroId);
      data.generarLiquidacion(mensajeroId, ...TODO);
      entrega(mensajeroId);
      const f = TestBed.createComponent(Ganancias);
      f.detectChanges();
      const celdas = [...(f.nativeElement as HTMLElement).querySelectorAll('td[data-label="Estado"]')].map((c) => c.textContent!.trim());
      expect(celdas).toEqual(expect.arrayContaining(['Acumulado', 'Liquidado']));
      expect(celdas).not.toContain('Pendiente');
      expect(celdas).not.toContain('Pagada');
    });

    it('el recibo se abre en vista de mensajero, y el pago pagado figura como cobrado', () => {
      entrega(mensajeroId);
      const l = data.generarLiquidacion(mensajeroId, ...TODO)!;
      data.pagarLiquidacion(l.id, 'Efectivo');
      const abrir = vi.spyOn(TestBed.inject(NgbModal), 'open').mockReturnValue({ componentInstance: {}, result: Promise.resolve() } as never);
      const f = TestBed.createComponent(Ganancias);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(texto(f)).toContain('Cobrado el');
      el.querySelector<HTMLButtonElement>('[title="Ver recibo"]')!.click();
      expect(abrir).toHaveBeenCalled();
      const instancia = abrir.mock.results[0].value.componentInstance;
      expect(instancia).toMatchObject({ paraMensajero: true });
      expect(instancia.liquidacion.id).toBe(l.id);
    });

    it('sin pagos explica cuándo van a aparecer', () => {
      const f = TestBed.createComponent(Ganancias);
      f.detectChanges();
      expect(texto(f)).toContain('Todavía no tenés pagos');
    });
  });

  it('cada mensajero ve solo sus pagos, sin los anulados', () => {
    entrega(mensajeroId);
    entrega(otroId);
    const propia = data.generarLiquidacion(mensajeroId, ...TODO)!;
    data.generarLiquidacion(otroId, ...TODO);
    data.anularLiquidacion(propia.id);
    const usuario = (id: string) => ({ rol: 'mensajero' as const, mensajeroId: id }) as never;
    expect(data.liquidacionesDe(usuario(mensajeroId))).toHaveLength(0);
    expect(data.liquidacionesDe(usuario(otroId))).toHaveLength(1);
    expect(data.liquidacionesDe(null)).toEqual([]);
  });
});
