import { TestBed } from '@angular/core/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ClienteInput, Envio } from '../../core/models';
import { DataService } from '../../core/services/data.service';
import { EtiquetasModal } from '../../features/envios/etiquetas-modal';
import { QrModal } from '../../features/envios/qr-modal';
import { EtiquetaEnvio } from './etiqueta-envio';
import { imprimirEtiquetas } from '../util/imprimir';

const cliente: ClienteInput = {
  nombre: 'Taller Sur', telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999',
  email: 'hola@tallersur.com', calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur',
  direccionVerificada: false, cuit: '', tipoCliente: 'persona', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
};
const destino = { destinatario: 'Ana Gómez', telefono: '+54 9 11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' };

const esperar = async (condicion: () => boolean) => {
  for (let i = 0; i < 100 && !condicion(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('Etiqueta del envío', () => {
  let data: DataService;
  let clienteId: string;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [{ provide: NgbActiveModal, useValue: { dismiss: vi.fn(), close: vi.fn() } }] });
    data = TestBed.inject(DataService);
    clienteId = data.agregarCliente(cliente).cliente.id;
  });

  function etiqueta(envio: Envio, posicion = 1, total = 1) {
    const f = TestBed.createComponent(EtiquetaEnvio);
    f.componentRef.setInput('envio', envio);
    f.componentRef.setInput('posicion', posicion);
    f.componentRef.setInput('total', total);
    f.detectChanges();
    return f;
  }

  it('muestra el número, el código para escribir a mano, el destinatario, la dirección y de quién es', async () => {
    const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
    const f = etiqueta(e, 2, 3);
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain(e.id);
    expect(el.textContent).toContain(`${e.codigo.slice(0, 4)}-${e.codigo.slice(4)}`);
    expect(el.textContent).toContain('Ana Gómez');
    expect(el.textContent).toContain('Av. Cabildo 1840');
    expect(el.textContent).toContain('Belgrano');
    expect(el.textContent).toContain('Taller Sur');
    expect(el.textContent).toContain('Paquete 2 de 3');
    expect(el.textContent).toContain(`Retiro ${e.retiroId}`);
  });

  it('dibuja el QR con el enlace del envío y no lleva importes ni datos de la cuenta', async () => {
    const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
    const f = etiqueta(e);
    const el = f.nativeElement as HTMLElement;
    await esperar(() => !!el.querySelector('svg path'));
    f.detectChanges();
    const camino = el.querySelector('svg path')!;
    expect(camino.getAttribute('d')!.length).toBeGreaterThan(200);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe(`Código QR del envío ${e.id}`);
    expect(el.textContent).not.toContain('$');
    expect(el.textContent).not.toContain('hola@tallersur.com');
    expect(el.textContent).not.toContain('5555 0000');
    expect(el.textContent).not.toContain('Tel');
  });

  it('el mismo envío dibuja siempre el mismo QR y dos envíos dibujan QR distintos', async () => {
    const a = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
    const b = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
    const dibujo = async (e: Envio) => {
      const f = etiqueta(e);
      const el = f.nativeElement as HTMLElement;
      await esperar(() => !!el.querySelector('svg path'));
      return el.querySelector('svg path')!.getAttribute('d');
    };
    expect(await dibujo(a)).toBe(await dibujo(a));
    expect(await dibujo(a)).not.toBe(await dibujo(b));
  });

  describe('el modal de etiquetas', () => {
    function modal(envios: Envio[]) {
      const f = TestBed.createComponent(EtiquetasModal);
      f.componentInstance.envios = envios;
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement };
    }

    it('un retiro con varios destinatarios muestra una etiqueta por paquete, numeradas', () => {
      const envios = data.crearRetiro({ retiro: 'domicilio', destinos: [{ ...destino, items: [] }, { ...destino, destinatario: 'Bruno Díaz', items: [] }, { ...destino, destinatario: 'Carla Ruiz', items: [] }] }, clienteId);
      const { el } = modal([...envios].reverse());
      expect(el.querySelectorAll('fx-etiqueta')).toHaveLength(3);
      const posiciones = [...el.querySelectorAll('.fx-etq-pos')].map((p) => p.textContent!.trim());
      expect(posiciones.sort()).toEqual(['Paquete 1 de 3', 'Paquete 2 de 3', 'Paquete 3 de 3']);
      expect(el.textContent).toContain('Imprimir 3 etiquetas');
    });

    it('el formato A6 es el de partida y se puede pasar a A4 con 4 por hoja', () => {
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      const { f, el } = modal([e]);
      expect(el.querySelector('.fx-etiquetas')!.classList.contains('fx-etiquetas--a4')).toBe(false);
      expect(el.textContent).toContain('Imprimir la etiqueta');
      const a4 = [...el.querySelectorAll<HTMLInputElement>('input[name="formato"]')][1];
      a4.checked = true;
      a4.dispatchEvent(new Event('change'));
      f.detectChanges();
      expect(el.querySelector('.fx-etiquetas')!.classList.contains('fx-etiquetas--a4')).toBe(true);
    });

    it('imprimir abre el diálogo de impresión con el tamaño de hoja del formato elegido', () => {
      const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
      const e = data.crearEnvio({ ...destino, retiro: 'deposito' }, clienteId);
      const { el } = modal([e]);
      [...el.querySelectorAll<HTMLButtonElement>('.modal-footer button')].find((b) => b.textContent!.includes('Imprimir'))!.click();
      expect(imprimir).toHaveBeenCalledTimes(1);
      expect(document.getElementById('fx-pagina-impresion')!.textContent).toContain('100mm 150mm');
      expect(document.documentElement.classList.contains('fx-imprimiendo')).toBe(true);
      window.dispatchEvent(new Event('afterprint'));
      expect(document.getElementById('fx-pagina-impresion')).toBeNull();
      expect(document.documentElement.classList.contains('fx-imprimiendo')).toBe(false);
    });
  });
});

describe('Impresión de etiquetas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.getElementById('fx-pagina-impresion')?.remove();
    document.documentElement.classList.remove('fx-imprimiendo');
  });

  it('en A4 usa la hoja A4 con margen chico', () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    imprimirEtiquetas('a4');
    expect(document.getElementById('fx-pagina-impresion')!.textContent).toContain('A4');
    window.dispatchEvent(new Event('afterprint'));
  });

  it('si el navegador falla al imprimir, deja la página como estaba', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {
      throw new Error('sin impresora');
    });
    imprimirEtiquetas('a6');
    expect(document.getElementById('fx-pagina-impresion')).toBeNull();
    expect(document.documentElement.classList.contains('fx-imprimiendo')).toBe(false);
  });
});

describe('QR para mostrar en pantalla (sin impresora)', () => {
  let data: DataService;
  let envio: Envio;

  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [{ provide: NgbActiveModal, useValue: { dismiss: vi.fn(), close: vi.fn() } }] });
    data = TestBed.inject(DataService);
    envio = data.crearEnvio({ ...destino, retiro: 'deposito' }, data.agregarCliente(cliente).cliente.id);
  });

  it('muestra solo el QR, el número y el código: ningún dato del destinatario ni del cliente', async () => {
    const f = TestBed.createComponent(QrModal);
    f.componentInstance.envio = envio;
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    await esperar(() => !!el.querySelector('svg path'));
    f.detectChanges();
    expect(el.querySelector('svg path')!.getAttribute('d')!.length).toBeGreaterThan(200);
    expect(el.textContent).toContain(envio.id);
    expect(el.textContent).toContain(`${envio.codigo.slice(0, 4)}-${envio.codigo.slice(4)}`);
    for (const dato of ['Ana Gómez', 'Av. Cabildo 1840', 'Belgrano', '5555 0000', 'Taller Sur']) expect(el.textContent).not.toContain(dato);
  });

  it('el botón Listo lo cierra', () => {
    const f = TestBed.createComponent(QrModal);
    f.componentInstance.envio = envio;
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.modal-footer .btn-primary')!.click();
    expect(TestBed.inject(NgbActiveModal).dismiss).toHaveBeenCalled();
  });
});
