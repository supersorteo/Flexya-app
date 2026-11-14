import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClienteInput, MensajeroInput } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EntregaDetalle } from './entrega-detalle';
import { MisParadas } from './mis-paradas';

const cliente: ClienteInput = {
  tipoCliente: 'persona', nombre: 'Taller Sur', nombreComercial: '', condicionIva: '', responsableNombre: '', responsableTelefono: '',
  telefono: '+54 9 11 5555 2000', plan: 'Crecimiento', tipoDocumento: 'DNI', numeroDocumento: '30211999', email: 'hola@tallersur.com',
  calle: 'Av. Mitre', altura: '100', pisoDepto: '', localidad: 'Avellaneda', zonaId: 'gba-sur', direccionVerificada: false, cuit: '',
};

const mensajero: MensajeroInput = {
  nombre: 'Santiago Pereyra', tipoDocumento: 'DNI', numeroDocumento: '28456123', telefono: '+54 9 11 5555 3000',
  telefonoEmergencia: '', email: 'santiago@flexya.com', zonaId: 'caba-norte',
};

describe('Pantallas del mensajero', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of ['groupCollapsed', 'groupEnd', 'log', 'table'] as const) vi.spyOn(console, m).mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function escenario() {
    const data = TestBed.inject(DataService);
    const { cliente: c } = data.agregarCliente(cliente);
    const santiago = data.agregarMensajero(mensajero);
    const micaela = data.agregarMensajero({ ...mensajero, nombre: 'Micaela Roldán', numeroDocumento: '30211876', email: 'micaela@flexya.com', zonaId: 'caba-centro' });
    const nuevo = (destinatario: string, mensajeroId: string) => {
      const e = data.crearEnvio({ destinatario, telefono: '11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano' }, c.id);
      data.recepcionar(e.id);
      data.asignar(e.id, mensajeroId);
      return e;
    };
    const ana = nuevo('Ana Gómez', santiago.mensajero.id);
    const bruno = nuevo('Bruno Díaz', santiago.mensajero.id);
    const carla = nuevo('Carla Ruiz', micaela.mensajero.id);
    data.entregar(bruno.id, 'Portería');
    const auth = TestBed.inject(AuthService);
    const emision = await auth.invitar(santiago.usuario.id);
    await auth.activar(emision!.enlace.split('/').pop()!, 'Clave12345');
    await auth.login('santiago@flexya.com', 'Clave12345');
    return { ana, bruno, carla };
  }

  it('Mis envíos muestra solo las paradas propias, separadas en por entregar y cerradas', async () => {
    await escenario();
    const fixture = TestBed.createComponent(MisParadas);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('fx-parada')).toHaveLength(1);
    expect(el.textContent).toContain('Ana Gómez');
    expect(el.textContent).not.toContain('Carla Ruiz');
    expect(el.textContent).not.toContain('Bruno Díaz');

    (el.querySelectorAll('.fx-tabs button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('fx-parada')).toHaveLength(1);
    expect(el.textContent).toContain('Bruno Díaz');
    expect(el.textContent).toContain('Recibió: Portería');
  });

  it('cada parada trae llamar, WhatsApp y mapa, y las acciones solo si está en reparto', async () => {
    const { ana } = await escenario();
    const fixture = TestBed.createComponent(MisParadas);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const hrefs = [...el.querySelectorAll('a.btn')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('tel:+5491155550000');
    expect(hrefs.some((h) => h?.startsWith('https://wa.me/5491155550000?text='))).toBe(true);
    expect(hrefs.some((h) => h?.includes('google.com/maps') && h.includes('Belgrano'))).toBe(true);
    expect(el.querySelector('.fx-parada-acciones')).not.toBeNull();
    expect(el.textContent).toContain(ana.id);
  });

  it('el detalle muestra las acciones de un envío en reparto', async () => {
    const { ana } = await escenario();
    const fixture = TestBed.createComponent(EntregaDetalle);
    fixture.componentRef.setInput('id', ana.id);
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ana Gómez');
    expect(texto).toContain('Marcar entregado');
    expect(texto).toContain('Incidencia');
    expect(texto).toContain('Cómo llegar');
  });

  it('el detalle de un envío entregado muestra quién recibió y no ofrece acciones', async () => {
    const { bruno } = await escenario();
    const fixture = TestBed.createComponent(EntregaDetalle);
    fixture.componentRef.setInput('id', bruno.id);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Recibió: Portería');
    expect(el.querySelector('.fx-barra-acciones')).toBeNull();
  });

  it('el detalle muestra qué productos lleva el envío y el peso total', async () => {
    await escenario();
    const data = TestBed.inject(DataService);
    const clienteId = data.clientes()[0].id;
    const taza = data.agregarProducto(clienteId, { stock: 100, nombre: 'Taza', descripcion: '', precio: null, peso: 0.3, alto: null, ancho: null, largo: null });
    const envio = data.crearEnvio(
      { destinatario: 'Dora Paz', telefono: '11 5555 0000', direccion: 'Av. Cabildo 1840', localidad: 'Belgrano', items: [{ productoId: taza.id, cantidad: 4 }] },
      clienteId,
    );
    data.recepcionar(envio.id);
    data.asignar(envio.id, data.mensajeros()[0].id);

    const fixture = TestBed.createComponent(EntregaDetalle);
    fixture.componentRef.setInput('id', envio.id);
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Contenido');
    expect(texto).toContain('4 ×');
    expect(texto).toContain('Taza');
    expect(texto).toContain('Peso total: 1.2 kg');
  });

  it('el detalle de un envío ajeno no se muestra', async () => {
    const { carla } = await escenario();
    const fixture = TestBed.createComponent(EntregaDetalle);
    fixture.componentRef.setInput('id', carla.id);
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('No encontramos este envío');
    expect(texto).not.toContain('Carla Ruiz');
  });
});
