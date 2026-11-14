import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Cliente, ClienteInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { ClienteModal } from './cliente-modal';

const base: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '3° B', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '20-30211999-7',
  tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};

type Interno = { form: FormGroup; guardar: () => Promise<void>; cancelar: () => Promise<void>; enviar: () => void };
type Mock = ReturnType<typeof vi.fn>;

describe('ClienteModal reutilizado para editar', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgbActiveModal, useValue: { close: vi.fn(), dismiss: vi.fn() } },
        { provide: AlertService, useValue: { confirmar: vi.fn().mockResolvedValue(true), advertencia: vi.fn() } },
      ],
    });
  });

  function abrirParaEditar() {
    const data = TestBed.inject(DataService);
    const { cliente } = data.agregarCliente(base);
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.componentInstance.cliente = cliente;
    fixture.detectChanges();
    return { data, cliente, fixture, modal: fixture.componentInstance as unknown as Interno };
  }

  it('precarga los datos del cliente y no marca como duplicados los propios', () => {
    const { modal } = abrirParaEditar();
    expect(modal.form.getRawValue()).toMatchObject({
      nombre: 'Taller Sur', telefono: '1155552000', plan: 'Crecimiento', numeroDocumento: '30211999', email: 'hola@tallersur.com',
      tipoCliente: 'persona', cuit: '20-30211999-7', calle: 'Av. Mitre', altura: '100', pisoDepto: '3° B', localidad: 'Avellaneda',
    });
    expect(modal.form.valid).toBe(true);
  });

  it('ignora propiedades extra del cliente, como las que agrega la lista', () => {
    const data = TestBed.inject(DataService);
    const { cliente } = data.agregarCliente(base);
    const fila = { ...cliente, envios: 3, activos: 1 } as Cliente;
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.componentInstance.cliente = fila;
    expect(() => fixture.detectChanges()).not.toThrow();
    expect((fixture.componentInstance as unknown as Interno).form.getRawValue()).toMatchObject({ nombre: 'Taller Sur', localidad: 'Avellaneda' });
  });

  it('detecta correo, documento y CUIL que pertenecen a otro cliente', () => {
    const { data, modal } = abrirParaEditar();
    data.agregarCliente({ ...base, nombre: 'Otro', email: 'otro@x.com', numeroDocumento: '25678902', cuit: '20-25678902-8' });
    modal.form.patchValue({ email: 'otro@x.com', numeroDocumento: '25678902', cuit: '20-25678902-8' });
    expect(modal.form.controls['email'].errors).toEqual({ duplicado: true });
    expect(modal.form.controls['numeroDocumento'].errors).toEqual({ duplicado: true });
    expect(modal.form.controls['cuit'].errors).toEqual({ duplicado: true });
  });

  it('pide confirmación antes de guardar y no guarda si se cancela', async () => {
    const { modal } = abrirParaEditar();
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.guardar();
    expect(cerrar).not.toHaveBeenCalled();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Guardar los cambios?' }));
    await modal.guardar();
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('al crear la confirmación habla de dar de alta y avisa si faltan datos', async () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const modal = fixture.componentInstance as unknown as Interno;
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock; advertencia: Mock };
    await modal.guardar();
    expect(alerta.advertencia).toHaveBeenCalled();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(TestBed.inject(NgbActiveModal).close).not.toHaveBeenCalled();
  });

  it('cancelar pide confirmar solo si hay cambios sin guardar', async () => {
    const { modal } = abrirParaEditar();
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    const descartar = TestBed.inject(NgbActiveModal).dismiss as Mock;
    await modal.cancelar();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(descartar).toHaveBeenCalledTimes(1);

    modal.form.controls['nombre'].markAsDirty();
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.cancelar();
    expect(descartar).toHaveBeenCalledTimes(1);
    await modal.cancelar();
    expect(descartar).toHaveBeenCalledTimes(2);
  });

  it('la calle, la altura y el piso se habilitan recién al elegir la localidad', () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const form = (fixture.componentInstance as unknown as Interno).form;
    expect(['calle', 'altura', 'pisoDepto'].every((c) => form.controls[c].disabled)).toBe(true);
    form.controls['localidad'].setValue('Belgrano');
    expect(['calle', 'altura', 'pisoDepto'].every((c) => form.controls[c].enabled)).toBe(true);
    form.controls['localidad'].setValue('');
    expect(form.controls['calle'].disabled).toBe(true);
  });

  it('al elegir Empresa se pide CUIT con prefijo de empresa y no se pide documento', () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const form = (fixture.componentInstance as unknown as Interno).form;
    form.controls['tipoCliente'].setValue('empresa');
    expect(form.controls['tipoDocumento'].disabled && form.controls['numeroDocumento'].disabled).toBe(true);
    expect(form.controls['condicionIva'].enabled && form.controls['responsableNombre'].enabled).toBe(true);
    expect(form.controls['cuit'].errors).toEqual({ required: true });
    form.controls['cuit'].setValue('20-12345678-6');
    expect(form.controls['cuit'].errors).toEqual({ cuitEmpresa: true });
    form.controls['cuit'].setValue('30-71234567-1');
    expect(form.controls['cuit'].errors).toBeNull();
    form.controls['tipoCliente'].setValue('persona');
    expect(form.controls['numeroDocumento'].enabled && form.controls['nombreComercial'].disabled).toBe(true);
    expect(form.controls['cuit'].errors).toEqual({ cuilPersona: true });
  });

  it('el nombre de una persona pide nombre y apellido; el de una empresa acepta razón social', () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const form = (fixture.componentInstance as unknown as Interno).form;
    form.controls['nombre'].setValue('Casa Nómade & Hijos 2');
    expect(form.controls['nombre'].errors).toEqual({ persona: true });
    form.controls['tipoCliente'].setValue('empresa');
    expect(form.controls['nombre'].errors).toBeNull();
  });

  it('guarda una empresa sin documento y con sus datos opcionales normalizados', async () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const modal = fixture.componentInstance as unknown as Interno;
    modal.form.controls['tipoCliente'].setValue('empresa');
    modal.form.controls['localidad'].setValue('Avellaneda');
    modal.form.patchValue({
      nombre: ' Casa Nómade  S.R.L. ', nombreComercial: 'Casa Nómade', cuit: '30-71234567-1', condicionIva: 'Responsable Inscripto',
      telefono: '1155552000', email: 'INFO@casanomade.com', responsableNombre: 'Lucía Márquez', responsableTelefono: '1166667777',
      calle: 'Av. Mitre', altura: '100', plan: 'Crecimiento',
    });
    expect(modal.form.valid).toBe(true);
    await modal.guardar();
    expect(TestBed.inject(NgbActiveModal).close).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoCliente: 'empresa', nombre: 'Casa Nómade S.R.L.', nombreComercial: 'Casa Nómade', tipoDocumento: 'DNI', numeroDocumento: '',
        cuit: '30-71234567-1', condicionIva: 'Responsable Inscripto', email: 'info@casanomade.com', responsableNombre: 'Lucía Márquez',
        responsableTelefono: '+54 9 11 6666 7777', zonaId: 'gba-sur',
      }),
    );
  });

  it('una persona se guarda sin datos de empresa', async () => {
    const { modal } = abrirParaEditar();
    await modal.guardar();
    expect(TestBed.inject(NgbActiveModal).close).toHaveBeenCalledWith(
      expect.objectContaining({ tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '', numeroDocumento: '30211999' }),
    );
  });

  it('el correo del superadmin no se puede usar para un cliente', () => {
    const fixture = TestBed.createComponent(ClienteModal);
    fixture.detectChanges();
    const modal = fixture.componentInstance as unknown as Interno;
    modal.form.controls['email'].setValue('admin@flexya.com');
    expect(modal.form.controls['email'].errors).toEqual({ duplicado: true });
  });

  it('al guardar devuelve los datos normalizados con su zona', async () => {
    const { modal } = abrirParaEditar();
    modal.form.patchValue({ nombre: '  Taller   Sur SRL ', email: 'HOLA@TallerSur.com', telefono: '1166667777' });
    await modal.guardar();
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    expect(cerrar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Taller Sur SRL', email: 'hola@tallersur.com', telefono: '+54 9 11 6666 7777', zonaId: 'gba-sur', direccionVerificada: false,
      }),
    );
  });
});
