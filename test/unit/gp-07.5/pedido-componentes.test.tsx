/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react-native';

import { AvisoTienda } from '@/features/tienda/components/AvisoTienda';
import { SeccionDevoluciones } from '@/features/tienda/components/SeccionDevoluciones';
import { TarjetaPedido } from '@/features/tienda/components/TarjetaPedido';
import type { DevolucionVisible, PagoVisible } from '@/features/tienda/viewmodels/detallePedido';
import type { TextosDevoluciones } from '@/features/tienda/viewmodels/useDetallePedidoViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { insignia } from '@/shared/ui/tokens';

import { espiarConsola } from '../../helpers/consola';
import { pedidoNormalizado } from '../../helpers/tiendaFicticia';

// Esquema del teléfono controlable: el tema oscuro sigue a la preferencia del sistema.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

/**
 * GP-07.5: componentes nuevos o cambiados del detalle del pedido y de Mis pedidos, solos y con datos
 * ficticios: el aviso de la tienda (tono claro y oscuro, cerrar y llamar al salón), la sección de
 * devoluciones y reembolsos en cada estado (cargando, error con Reintentar, vacía y con datos) y la
 * tarjeta de Mis pedidos con el pago en proceso.
 */

const TEXTOS: TextosDevoluciones = {
  titulo: 'Devoluciones y reembolsos',
  cargando: 'Cargando devoluciones',
  vacia: 'No hay solicitudes para este pedido.',
  error: 'No pudimos cargar las devoluciones.',
  reintentar: 'Reintentar',
  pagosTitulo: 'Pagos',
  notaTitulo: 'Respuesta del salón',
};

const COMPLETA: DevolucionVisible = {
  id: 1,
  insignia: { texto: 'Aprobada', tono: 'exito' },
  tipo: 'Reembolso',
  monto: 'Monto: $380',
  motivo: 'Llegó abierto',
  metodo: 'Se reembolsa por el mismo medio con el que pagaste.',
  fecha: 'Resuelta el martes 20 de octubre, 11:00 a. m.',
  nota: 'Te reembolsamos completo.',
  puedeRetirar: false,
};

const MINIMA: DevolucionVisible = {
  id: 2,
  insignia: { texto: 'Pendiente', tono: 'aviso' },
  tipo: null,
  monto: null,
  motivo: null,
  metodo: null,
  fecha: null,
  nota: null,
  puedeRetirar: true,
};

const PAGOS: PagoVisible[] = [
  { id: 1, insignia: { texto: 'Reembolsado', tono: 'info' }, monto: '$1,142.50', detalle: 'Te lo reembolsamos.' },
  { id: 2, insignia: { texto: 'Pago aprobado', tono: 'exito' }, monto: '$500', detalle: null },
];

beforeEach(() => {
  reiniciarConfiguracionPublica();
  esquema.mockReturnValue('light');
});

espiarConsola(() => Promise.resolve(), true);

describe('AvisoTienda', () => {
  it.each<['light' | 'dark', 'claro' | 'oscuro']>([
    ['light', 'claro'],
    ['dark', 'oscuro'],
  ])('con el teléfono en %s usa el tono %s de la insignia y cada renglón se lee', async (sistema, tema) => {
    esquema.mockReturnValue(sistema);
    await render(<AvisoTienda tipo="aviso" textos={['Uno ya no está.', 'Otro tampoco.']} />);
    const texto = screen.getByText('Uno ya no está.');
    expect(texto).toHaveStyle({ color: insignia[tema].aviso.texto });
    expect(screen.getByText('Otro tampoco.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('cerrar y llamar al salón responden al tocarlos', async () => {
    const cerrar = jest.fn();
    const llamar = jest.fn();
    await render(
      <AvisoTienda
        tipo="info"
        textos={['Comunícate con el salón.']}
        cerrar={{ etiqueta: 'Cerrar aviso', onPress: cerrar }}
        llamar={{ texto: 'Llamar al +52 700 000 0000', onPress: llamar }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar aviso' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Llamar al +52 700 000 0000' }));
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(llamar).toHaveBeenCalledTimes(1);
  });
});

describe('SeccionDevoluciones', () => {
  const props = {
    devoluciones: [] as DevolucionVisible[],
    pagos: [] as PagoVisible[],
    textos: TEXTOS,
    onReintentar: jest.fn(),
    textoRetirar: 'Retirar solicitud',
    onRetirar: jest.fn(),
  };

  it('cargando: un esqueleto que se anuncia', async () => {
    await render(<SeccionDevoluciones {...props} estado="cargando" />);
    expect(screen.getByLabelText(TEXTOS.cargando)).toBeOnTheScreen();
  });

  it('con error: lo dice y Reintentar vuelve a pedirlas', async () => {
    const onReintentar = jest.fn();
    await render(<SeccionDevoluciones {...props} estado="error" onReintentar={onReintentar} />);
    expect(screen.getByText(TEXTOS.error)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: TEXTOS.reintentar }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('vacía y sin pagos: solo el texto del catálogo', async () => {
    await render(<SeccionDevoluciones {...props} estado="listo" />);
    expect(screen.getByText(TEXTOS.vacia)).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: TEXTOS.pagosTitulo })).not.toBeOnTheScreen();
  });

  it('con datos: cada devolución con lo que traiga y los pagos con su detalle', async () => {
    await render(<SeccionDevoluciones {...props} estado="listo" devoluciones={[COMPLETA, MINIMA]} pagos={PAGOS} />);
    for (const texto of [COMPLETA.tipo, COMPLETA.monto, COMPLETA.motivo, COMPLETA.metodo, COMPLETA.fecha, COMPLETA.nota, TEXTOS.notaTitulo]) {
      expect(screen.getByText(String(texto))).toBeOnTheScreen();
    }
    expect(screen.getByLabelText('Estado: Aprobada')).toBeOnTheScreen();
    expect(screen.getByLabelText('Estado: Pendiente')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: TEXTOS.pagosTitulo })).toBeOnTheScreen();
    expect(screen.getByText('Te lo reembolsamos.')).toBeOnTheScreen();
    expect(screen.getByText('$500')).toBeOnTheScreen();
    expect(screen.queryByText(TEXTOS.vacia)).not.toBeOnTheScreen();
    expect(screen.getAllByText('Respuesta del salón')).toHaveLength(1);
  });

  it('solo la solicitud que se puede retirar trae su botón, y al tocarlo pide retirar esa', async () => {
    const onRetirar = jest.fn();
    const conTipo: DevolucionVisible = { ...MINIMA, id: 3, tipo: 'Cambio' };
    await render(<SeccionDevoluciones {...props} estado="listo" devoluciones={[COMPLETA, MINIMA, conTipo]} onRetirar={onRetirar} />);
    expect(screen.getAllByRole('button', { name: /^Retirar solicitud/ })).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar solicitud: Cambio' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar solicitud' }));
    expect(onRetirar.mock.calls).toEqual([[3], [2]]);
  });
});

describe('TarjetaPedido', () => {
  it.each<[string, boolean, string]>([
    ['con el pago en proceso', true, 'Pago en proceso'],
    ['sin él', false, 'Pendiente de pago'],
  ])('un pedido en línea pendiente %s lo anuncia y lo pinta', async (_caso, pagoEnProceso, estado) => {
    const onAbrir = jest.fn();
    await render(<TarjetaPedido pedido={pedidoNormalizado()} pagoEnProceso={pagoEnProceso} onAbrir={onAbrir} />);
    const tarjeta = screen.getByHintText('Abre el detalle del pedido');
    expect(String(tarjeta.props.accessibilityLabel)).toMatch(new RegExp(`estado: ${estado}$`));
    await fireEvent.press(tarjeta);
    expect(onAbrir).toHaveBeenCalledWith(701);
  });

  it('sin el dato del pago en proceso y sin fecha válida: "Pendiente de pago" y sin fecha', async () => {
    await render(<TarjetaPedido pedido={pedidoNormalizado({ creadoEn: 'pronto' })} onAbrir={jest.fn()} />);
    const etiqueta = String(screen.getByHintText('Abre el detalle del pedido').props.accessibilityLabel);
    expect(etiqueta).toBe('Pedido número 701, 3 piezas, total $1,142.50, Pago en línea, estado: Pendiente de pago');
  });
});
