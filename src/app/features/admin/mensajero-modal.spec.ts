import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { MensajeroInput } from '../../core/models';
import { AlertService } from '../../core/services/alert.service';
import { DataService } from '../../core/services/data.service';
import { MensajeroModal } from './mensajero-modal';

const base: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '+54 9 11 5555 3001', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

type Interno = { form: FormGroup; guardar: () => Promise<void>; cancelar: () => Promise<void> };
type Mock = ReturnType<typeof vi.fn>;

describe('MensajeroModal', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: NgbActiveModal, useValue: { close: vi.fn(), dismiss: vi.fn() } },
        { provide: AlertService, useValue: { confirmar: vi.fn().mockResolvedValue(true), advertencia: vi.fn() } },
      ],
    });
  });

  function abrir(editar = true) {
    const data = TestBed.inject(DataService);
    const mensajero = editar ? data.agregarMensajero(base).mensajero : null;
    const fixture = TestBed.createComponent(MensajeroModal);
    fixture.componentInstance.mensajero = mensajero;
    fixture.detectChanges();
    return { data, mensajero, modal: fixture.componentInstance as unknown as Interno };
  }

  it('al editar precarga los datos, con los teléfonos sin el prefijo', () => {
    const { modal } = abrir();
    expect(modal.form.getRawValue()).toEqual({
      nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '1155553000',
      telefonoEmergencia: '1155553001', email: 'santiago@flexya.com', zonaId: 'caba-norte',
    });
    expect(modal.form.valid).toBe(true);
  });

  it('el contacto de emergencia es opcional pero no puede repetir el teléfono', () => {
    const { modal } = abrir(false);
    const emergencia = modal.form.controls['telefonoEmergencia'];
    expect(emergencia.errors).toBeNull();
    modal.form.patchValue({ telefono: '1155553000', telefonoEmergencia: '1155553000' });
    expect(emergencia.errors).toEqual({ mismoTelefono: true });
    modal.form.patchValue({ telefonoEmergencia: '1155553001' });
    expect(emergencia.errors).toBeNull();
    modal.form.patchValue({ telefonoEmergencia: '1555553001' });
    expect(emergencia.errors).toEqual({ telefono: true });
  });

  it('pide nombre y apellido', () => {
    const { modal } = abrir(false);
    const nombre = modal.form.controls['nombre'];
    nombre.setValue('Santiago');
    expect(nombre.errors).toEqual({ persona: true });
    nombre.setValue('Santiago Pereyra');
    expect(nombre.errors).toBeNull();
  });

  it('detecta documento de otro mensajero y correos ya usados, sin marcar los propios', () => {
    const { data, modal } = abrir();
    data.agregarMensajero({ ...base, nombre: 'Micaela Roldán', numeroDocumento: '30211876', email: 'micaela@flexya.com', zonaId: 'caba-centro' });
    expect(modal.form.controls['numeroDocumento'].errors).toBeNull();
    modal.form.patchValue({ numeroDocumento: '30211876', email: 'micaela@flexya.com' });
    expect(modal.form.controls['numeroDocumento'].errors).toEqual({ duplicado: true });
    expect(modal.form.controls['email'].errors).toEqual({ duplicado: true });
    modal.form.patchValue({ email: 'admin@flexya.com' });
    expect(modal.form.controls['email'].errors).toEqual({ duplicado: true });
  });

  it('pide confirmación y devuelve los datos normalizados', async () => {
    const { modal } = abrir();
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock };
    const cerrar = TestBed.inject(NgbActiveModal).close as Mock;
    modal.form.patchValue({ nombre: '  Santiago   Pereyra ', email: 'SANTIAGO@Flexya.com', telefonoEmergencia: '' });
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.guardar();
    expect(cerrar).not.toHaveBeenCalled();
    await modal.guardar();
    expect(cerrar).toHaveBeenCalledWith({
      nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
      telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
    });
  });

  it('avisa si faltan datos y cancelar pide confirmar solo si hay cambios', async () => {
    const { modal } = abrir(false);
    const alerta = TestBed.inject(AlertService) as unknown as { confirmar: Mock; advertencia: Mock };
    await modal.guardar();
    expect(alerta.advertencia).toHaveBeenCalled();
    expect(TestBed.inject(NgbActiveModal).close).not.toHaveBeenCalled();

    const descartar = TestBed.inject(NgbActiveModal).dismiss as Mock;
    await modal.cancelar();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(descartar).toHaveBeenCalledTimes(1);
    modal.form.controls['nombre'].markAsDirty();
    alerta.confirmar.mockResolvedValueOnce(false);
    await modal.cancelar();
    expect(descartar).toHaveBeenCalledTimes(1);
  });
});
