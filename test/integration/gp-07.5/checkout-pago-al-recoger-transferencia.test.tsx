/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { setStringAsync } from 'expo-clipboard';
import { fireEvent, screen } from 'expo-router/testing-library';

import { reiniciarMemoriaCarrito } from '@/features/tienda/models/carritoModel';
import { reiniciarVerificacion } from '@/features/tienda/models/verificacionPago';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  CONSENTIMIENTO_COMPRA,
  configuracionTienda,
  escriturasCompra,
  marcarCasillasCompra,
  rutaConfiguracionTienda,
} from '../../helpers/checkoutFicticio';
import { CLABE_FICTICIA, DATOS_TRANSFERENCIA } from '../../helpers/configuracionFicticia';
import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { esperarRuta, prepararPruebasReserva, tocar } from '../../helpers/pantallasReserva';
import {
  abrirTienda,
  APARTAR,
  conTextos,
  esperarPasoCompra,
  OPCION_EN_SALON,
  PASO_CONFIRMAR,
  PASO_PAGO,
  PASO_RECOGER,
  ultimoCuerpo,
  veces,
} from '../../helpers/pantallasTienda';
import { consentimientosEnviados, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { CARRITO_CRUDO, RUTA_CREAR_PEDIDO, RUTA_PREFERENCIA_PEDIDO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

/**
 * GP-07.5: el apartado con pago al recoger y la transferencia activa en la configuración ficticia,
 * con la app real (renderRouter), la sesión de CLIENTA_CITAS, el reloj fijo y el servidor simulado
 * (http://api.test). En la forma de pago se ven el banco, la titular y la CLABE ficticios, y "Copiar
 * CLABE" usa expo-clipboard simulado (nunca el portapapeles real); se confirma con las casillas y
 * llega a la confirmación del apartado, sin Mercado Pago. Todos los datos de transferencia son ficticios.
 */

const t = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto);

const portapapeles = jest.mocked(setStringAsync);

describe('Apartado con pago al recoger y transferencia (GP-07.5)', () => {
  const revisarConsola = prepararPruebasReserva();

  beforeEach(() => {
    reiniciarVerificacion();
    reiniciarMemoriaCarrito();
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
    limpiarArchivos();
    portapapeles.mockReset().mockResolvedValue(true);
  });

  it(
    'muestra los datos ficticios para transferir, copia la CLABE y aparta el pedido hasta su confirmación',
    async () => {
      const abierta = await abrirTienda('/carrito', {
        items: CARRITO_CRUDO,
        rutas: rutaConfiguracionTienda(configuracionTienda()),
      });
      await tocar('Continuar compra');
      await esperarRuta(abierta.app, '/checkout');
      await esperarPasoCompra(PASO_RECOGER);
      await tocar('Continuar');
      await esperarPasoCompra(PASO_PAGO);

      // Solo pago al recoger (Mercado Pago de la tienda apagado) con los datos de la transferencia.
      expect(screen.getByRole('radio', { name: OPCION_EN_SALON })).toBeChecked();
      conTextos(...DATOS_TRANSFERENCIA, CLABE_FICTICIA);
      await fireEvent.press(screen.getByRole('button', { name: t('pagos.transferencia.copiar') }));
      expect(await screen.findByText(t('pagos.transferencia.copiada'))).toBeOnTheScreen();
      expect(portapapeles).toHaveBeenCalledTimes(1);
      expect(portapapeles).toHaveBeenCalledWith(CLABE_FICTICIA);

      await tocar('Continuar');
      await esperarPasoCompra(PASO_CONFIRMAR);
      await marcarCasillasCompra();
      await tocar(APARTAR);

      await esperarRuta(abierta.app, '/pedido-confirmado/701');
      expect(await screen.findByRole('header', { name: t('tienda.confirmacionTitulo') })).toBeOnTheScreen();
      conTextos(t('tienda.confirmacionApartado'), 'Pedido #701');
      expect(screen.getByLabelText('Estado: Apartado, pagas al recoger')).toBeOnTheScreen();

      expect(escriturasCompra(abierta.llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_PEDIDO]);
      expect(consentimientosEnviados(abierta.llamadas)).toEqual([CONSENTIMIENTO_COMPRA]);
      expect(ultimoCuerpo(abierta, RUTA_CREAR_PEDIDO)).toMatchObject({ metodoPago: 'pago_en_salon' });
      expect(veces(abierta, RUTA_PREFERENCIA_PEDIDO)).toBe(0);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      expect(abierta.carrito.items()).toEqual([]);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
