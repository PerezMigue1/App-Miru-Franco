/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import {
  ErrorConsentimiento,
  FORMULARIO_ANTICIPOS,
  mensajeConsentimiento,
  RUTA_ORIGEN_RESERVA,
} from '@/features/citas/models/consentimientosReserva';
import { saldoEnSalon, textoFaltaPolitica } from '@/features/citas/models/formaPagoModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  CLIENTA_CITAS,
  conError,
  ERRORES,
  initPointFicticio,
  llamadasDeRuta,
  MENSAJES_BACKEND,
  rutaPreferencia,
  RUTA_CREAR_CITA,
  SERVICIO_CON_ANTICIPO,
} from '../../helpers/citasFicticias';
import { documentoCrudo } from '../../helpers/documentosFicticios';
import { abrirSesionSimulada } from '../../helpers/google';
import { creacionConReglas, cuerpoUnico, monto, RUTA_DOCUMENTO_ANTICIPOS, secuencia } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConfirmar, FORMA_PAGO, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import {
  BOTON,
  CASILLA_POLITICA,
  confirmarConAnticipo,
  elegirOpcionPago,
  esperarPantallaDePago,
  marcarPolitica,
  navegadorQuedaAbierto,
  OPCION_PAGO,
  PASO,
  revisarCheckout,
  revisarDatos,
  sinTextos,
  tocar,
} from '../../helpers/pantallasReserva';
import { escrituras, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: reservar el alaciado (servicio con anticipo) pagando el anticipo en línea, de punta a
 * punta con las pantallas reales, la configuración ficticia con los anticipos y Mercado Pago de
 * anticipos encendidos y el reloj en el lunes 19 de octubre de 2026 a las 10:00 de México. En
 * Confirmar la clienta ve la forma de pago, no puede seguir sin la casilla de la política y, con
 * ella, la app registra la Política de anticipos vigente, crea la cita y abre Mercado Pago, en ese
 * orden. Si el registro de la política falla, la cita no se crea.
 */

const ANTICIPO = monto(SERVICIO_CON_ANTICIPO.anticipoMonto ?? '');
const SALDO = monto(saldoEnSalon(SERVICIO_CON_ANTICIPO.precio, SERVICIO_CON_ANTICIPO.anticipoMonto) ?? 0);
const DOCUMENTO = documentoCrudo('anticipos');

describe('Reservar con el anticipo en línea (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    've la forma de pago, no confirma sin la casilla y con ella registra la política, crea la cita y abre Mercado Pago, en ese orden',
    async () => {
      navegadorQuedaAbierto();
      const abierta = await abrirConfirmar({ rutas: creacionConReglas() });
      const { llamadas } = abierta;

      expect(screen.getByRole('header', { name: FORMA_PAGO })).toBeOnTheScreen();
      revisarDatos({
        [obtenerTexto('citas.formaPago.anticipoEtiqueta')]: ANTICIPO,
        [obtenerTexto('citas.formaPago.saldoEtiqueta')]: SALDO,
      });
      await elegirOpcionPago('linea');
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).toBeChecked();

      // Sin la casilla: el aviso en la casilla y ninguna escritura en el servidor.
      await tocar(BOTON.pagarEnLinea);
      expect(await screen.findByText(textoFaltaPolitica())).toBeOnTheScreen();
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeChecked();
      expect(escrituras(llamadas)).toEqual([]);

      await marcarPolitica();
      await tocar(BOTON.pagarEnLinea);
      await esperarPantallaDePago(abierta);
      await waitFor(() => revisarCheckout(1, initPointFicticio()));

      expect(
        secuencia(llamadas, RUTA_DOCUMENTO_ANTICIPOS, RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA, rutaPreferencia()),
      ).toEqual([RUTA_DOCUMENTO_ANTICIPOS, RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA, rutaPreferencia()]);
      expect(cuerpoUnico(llamadas, RUTA_CONSENTIMIENTOS)).toEqual({
        items: [
          { tipo: 'anticipos', documentoSlug: 'anticipos', version: DOCUMENTO.version, hash: DOCUMENTO.hash, accion: 'aceptado' },
        ],
        formulario: FORMULARIO_ANTICIPOS,
        rutaOrigen: RUTA_ORIGEN_RESERVA,
      });
      expect(cuerpoUnico(llamadas, RUTA_CREAR_CITA)).toMatchObject({
        clienteId: CLIENTA_CITAS.id,
        servicioId: SERVICIO_CON_ANTICIPO.id,
        pagoAnticipo: 'linea',
      });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el registro de la política falla, no crea la cita, no abre Mercado Pago y lo explica sin texto técnico',
    async () => {
      const { llamadas } = await abrirConfirmar({ rutas: { [RUTA_CONSENTIMIENTOS]: conError(ERRORES.servicioNoDisponible) } });

      await confirmarConAnticipo('linea');
      const mensaje = mensajeConsentimiento(
        new ErrorConsentimiento('anticipos', new ApiError(503, MENSAJES_BACKEND.servicioNoDisponible)),
      );
      expect(await screen.findByText(mensaje)).toBeOnTheScreen();

      expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeChecked();
      expect(escrituras(llamadas)).toEqual([RUTA_CONSENTIMIENTOS]);
      expect(llamadasDeRuta(llamadas, rutaPreferencia())).toHaveLength(0);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      sinTextos(MENSAJES_BACKEND.servicioNoDisponible, 'Servicio no disponible');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
