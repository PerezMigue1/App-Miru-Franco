/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { plazoDeOpcion, textoBotonConfirmar } from '@/features/citas/models/formaPagoModel';

import {
  citaCruda,
  CLIENTA_CITAS,
  cuerpoEspecialistas,
  DIA_CITA,
  disponibilidadesDe,
  HOY,
  isoMexico,
  llamadasDeRuta,
  masMinutos,
  rutaDisponibilidad,
  RUTA_CREAR_CITA,
  RUTA_ESPECIALISTAS,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  sinRedEnRuta,
} from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  BOTON,
  botonDia,
  diaConMayuscula,
  elegirDia,
  elegirEspecialista,
  esperarPaso,
  esperarRuta,
  horaDelServidor,
  horaEnTelefono,
  horarioEnTelefono,
  llegarAlResumen,
  movimientoReducido,
  OPCION_PAGO,
  PASO,
  prepararPruebasReserva,
  retener,
  revisarDatos,
  SERVICIO_SIN_PRECIO,
  sinTextos,
  TARJETA_DOS,
  TARJETA_UNO,
  tocar,
  tocarYEsperar,
} from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { ESPECIALISTA_DOS, ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.2: reservar una cita con las pantallas reales (renderRouter sobre src/app) y el servidor
 * simulado, con la sesión de una clienta y el reloj fijo el lunes 19 de octubre de 2026 a las 10:00
 * de México. Lo que ve la clienta en los tres pasos (especialista, día y hora, confirmar), el cuerpo
 * que recibe el servidor y la confirmación. El pago en línea va en anticipo-en-linea.test.tsx y los
 * errores en conflictos.test.tsx.
 */

/** Relación que el backend no mandó (servicio o especialista de la cita). */
const SIN_RELACION = null as unknown as never;

const NOTAS = 'Traigo foto de referencia';

describe('Reservar una cita con las pantallas reales (GP-06.2)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'del detalle a la confirmación con un servicio sin anticipo: pasos, calendario, resumen, notas y lo que recibe el servidor',
    async () => {
      const { app, llamadas } = await abrirReserva(`/servicio/${SERVICIO_SIN_ANTICIPO.id}`);
      expect(await screen.findByRole('header', { name: 'Corte de dama' })).toBeOnTheScreen();
      await tocarYEsperar(app, 'Reservar', '/reservar/1');

      // Paso 1: las dos especialistas de la agenda (el detalle por id no trae las del servicio).
      await esperarPaso(PASO.especialista);
      expect(screen.getByText('¿Con quién quieres tu cita?')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: TARJETA_UNO })).not.toBeSelected();
      expect(screen.getByRole('button', { name: TARJETA_DOS })).toBeOnTheScreen();
      await elegirEspecialista(TARJETA_UNO);

      // Paso 2: arranca en hoy, sin días pasados ni meses anteriores.
      expect(screen.getByText(`Con ${ESPECIALISTA_UNO.nombre}`)).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Octubre 2026' })).toBeOnTheScreen();
      expect(botonDia(HOY)).toBeSelected();
      expect(botonDia('2026-10-18')).toBeDisabled();
      expect(botonDia('2026-10-01')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: 'Mes anterior' }));
      expect(screen.getByRole('header', { name: 'Octubre 2026' })).toBeOnTheScreen();
      // Hoy a las 10:00 el servidor ya no ofrece los horarios que pasaron.
      expect(await screen.findByRole('button', { name: horaDelServidor(HOY, '10:30') })).toBeOnTheScreen();
      sinTextos(horaDelServidor(HOY, '09:30'), horaDelServidor(HOY, '10:00'));

      await elegirDia(DIA_CITA);
      expect(botonDia(DIA_CITA)).toBeSelected();
      expect(botonDia(HOY)).not.toBeSelected();
      expect(await screen.findByRole('button', { name: horaDelServidor(DIA_CITA, '09:30') })).toBeOnTheScreen();
      expect(llamadasDeRuta(llamadas, rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 1))).toHaveLength(1);
      await tocar(horaDelServidor(DIA_CITA, '11:00'));

      // Paso 3: resumen sin anticipo y un solo botón.
      await esperarPaso(PASO.confirmar);
      expect(screen.getByRole('header', { name: 'Confirma tu cita' })).toBeOnTheScreen();
      revisarDatos({
        Servicio: 'Corte de dama',
        Especialista: ESPECIALISTA_UNO.nombre,
        Fecha: diaConMayuscula(DIA_CITA),
        Hora: horaDelServidor(DIA_CITA, '11:00'),
        Precio: '$350',
      });
      expect(screen.queryByLabelText(/^Anticipo/)).not.toBeOnTheScreen();
      sinTextos(BOTON.pagarEnLinea, BOTON.apartarEnSalon, /2 horas/);
      await fireEvent.changeText(screen.getByLabelText('Notas para el salón (opcional)'), `  ${NOTAS}  `);

      await tocarYEsperar(app, BOTON.confirmar, `/cita-confirmada/501`);
      const [creacion] = llamadasDeRuta(llamadas, RUTA_CREAR_CITA);
      const inicio = isoMexico(DIA_CITA, '11:00');
      const fin = masMinutos(inicio, SERVICIO_SIN_ANTICIPO.duracionMinutos).toISOString();
      expect(creacion.cuerpo).toEqual({
        clienteId: CLIENTA_CITAS.id,
        especialistaId: ESPECIALISTA_UNO.usuarioId,
        servicioId: 1,
        fechaHoraInicio: inicio,
        fechaHoraFin: fin,
        notas: NOTAS,
      });
      expect(creacion.cabeceras.Authorization).toMatch(/^Bearer /);

      // Confirmación sin anticipo.
      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      expect(screen.getByText('Te esperamos en el salón.')).toBeOnTheScreen();
      expect(screen.getByLabelText('Estado: Sin anticipo')).toBeOnTheScreen();
      revisarDatos({
        Fecha: diaConMayuscula(DIA_CITA),
        Hora: horarioEnTelefono(inicio, fin),
        Especialista: ESPECIALISTA_UNO.nombre,
      });
      expect(screen.getByText('Corte de dama')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.volverAlInicio })).toBeOnTheScreen();
      sinTextos('Pagar anticipo', /Paga antes/);
      expect(screen.queryByLabelText(/^Anticipo:/)).not.toBeOnTheScreen();

      await tocarYEsperar(app, BOTON.verMisCitas, '/mis-citas');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    '"Volver" regresa un paso sin perder lo elegido y del paso 1 sale al detalle; mes siguiente y anterior',
    async () => {
      movimientoReducido(true);
      // El horario de las 12:00 llega sin horaLocal: la app muestra la hora del teléfono.
      const rutaDos = rutaDisponibilidad(ESPECIALISTA_DOS.usuarioId, DIA_CITA, SERVICIO_SIN_PRECIO.id);
      const [, delMartes] = disponibilidadesDe(DIA_CITA, SERVICIO_SIN_PRECIO);
      const mediodia = isoMexico(DIA_CITA, '12:00');
      const sinHoraLocal = {
        ...delMartes,
        slots: delMartes.slots.map((slot) => (slot.inicio === mediodia ? { ...slot, horaLocal: '' } : slot)),
      };
      const horaMediodia = horaEnTelefono(mediodia);
      const { app, llamadas } = await abrirReserva(`/reservar/${SERVICIO_SIN_PRECIO.id}`, {
        rutas: { [rutaDos]: () => respuesta(sinHoraLocal) },
      });
      expect(await screen.findByRole('header', { name: 'Uñas acrílicas' })).toBeOnTheScreen();
      await elegirEspecialista(TARJETA_DOS);
      expect(screen.getByText(`Con ${ESPECIALISTA_DOS.nombre}`)).toBeOnTheScreen();

      await tocar('Mes siguiente');
      expect(await screen.findByRole('header', { name: 'Noviembre 2026' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeEnabled();
      await tocar('Mes anterior');
      expect(await screen.findByRole('header', { name: 'Octubre 2026' })).toBeOnTheScreen();

      await elegirDia(DIA_CITA);
      await tocar(horaMediodia);
      await esperarPaso(PASO.confirmar);
      revisarDatos({ Servicio: 'Uñas acrílicas', Hora: horaMediodia, Precio: 'Consulta el precio en el salón' });

      await tocar(BOTON.volver);
      await esperarPaso(PASO.diaHora);
      expect(botonDia(DIA_CITA)).toBeSelected();
      expect(screen.getByRole('button', { name: horaMediodia })).toBeSelected();

      await tocar(BOTON.volver);
      await esperarPaso(PASO.especialista);
      expect(screen.getByRole('button', { name: TARJETA_DOS })).toBeSelected();
      expect(screen.getByRole('button', { name: TARJETA_UNO })).not.toBeSelected();

      // La misma especialista conserva el día y el horario sin volver a pedir la disponibilidad.
      await elegirEspecialista(TARJETA_DOS);
      expect(botonDia(DIA_CITA)).toBeSelected();
      expect(screen.getByRole('button', { name: horaMediodia })).toBeSelected();
      expect(llamadasDeRuta(llamadas, rutaDos)).toHaveLength(1);

      await tocar(BOTON.volver);
      await esperarPaso(PASO.especialista);
      await tocarYEsperar(app, BOTON.volver, '/servicio/3');
      expect(await screen.findByRole('button', { name: 'Reservar' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un doble toque en "Confirmar cita" crea una sola cita',
    async () => {
      const retenida = retener();
      const { app, llamadas } = await abrirReserva('/reservar/1', { crear: retenida.envolver });
      await llegarAlResumen();

      const boton = screen.getByRole('button', { name: BOTON.confirmar });
      await fireEvent.press(boton);
      await fireEvent.press(boton);
      // GP-07.4: mientras se envía el botón dice que está confirmando (textoBotonConfirmar).
      const enviando = textoBotonConfirmar(0, 'salon', true);
      await waitFor(() => expect(screen.getByRole('button', { name: enviando })).toBeBusy());
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);

      // Mientras se envía, "Volver" no regresa de paso.
      await tocar(BOTON.volver);
      expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();

      await retenida.soltar();
      await esperarRuta(app, '/cita-confirmada/501');
      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'corrección GP-06.2: un servicio que ya no existe (404) lo dice, apunta a Servicios y "Ver servicios" lleva al catálogo',
    async () => {
      const retenida = retener();
      const { app } = await abrirReserva('/reservar/5', {
        rutas: { 'GET /api/servicios/5': retenida.envolver(() => respuesta({ statusCode: 404, message: 'Servicio no encontrado' }, 404)) },
      });

      expect(await screen.findByRole('progressbar', { name: 'Cargando la reserva' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Reservar cita' })).toBeOnTheScreen();
      await retenida.soltar();

      expect(await screen.findByRole('header', { name: 'Este servicio ya no está disponible' })).toBeOnTheScreen();
      expect(
        screen.getByText('Puede que el salón lo haya retirado. Mira los demás servicios en Servicios.'),
      ).toBeOnTheScreen();
      sinTextos(/en Citas\./, 'Servicio no encontrado');
      expect(screen.queryByRole('header', { name: PASO.especialista })).not.toBeOnTheScreen();

      await tocarYEsperar(app, 'Ver servicios', '/citas');
      expect(await screen.findByText('Explora nuestros servicios y agenda tu cita')).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con anticipo, el paso 3 muestra el anticipo, el saldo, el plazo en línea y un solo botón para pagar en línea',
    async () => {
      await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`);
      await llegarAlResumen({ tarjeta: TARJETA_DOS });

      revisarDatos({
        Servicio: 'Alaciado keratínico',
        Especialista: ESPECIALISTA_DOS.nombre,
        Precio: '$1,200',
        'Anticipo para apartar tu cita': '$360',
        'Pagas en el salón el día de tu cita': '$840',
      });
      // GP-07.4: el plazo sale de las reglas (aquí, las del respaldo) y va bajo la opción en línea.
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).toBeChecked();
      expect(screen.getByText(plazoDeOpcion('linea'))).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      // Pagar en el salón (GP-06.5) es la otra opción, no otro botón.
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).not.toBeChecked();
      expect(screen.queryByRole('button', { name: BOTON.apartarEnSalon })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: BOTON.confirmar })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin red al cargar: "No pudimos preparar tu reserva", Reintentar, agenda vacía y Reintentar otra vez',
    async () => {
      const { llamadas } = await abrirReserva('/reservar/1', {
        rutas: {
          'GET /api/servicios/1': enSecuencia(sinRedEnRuta, () =>
            respuesta({ success: true, data: { ...SERVICIO_SIN_ANTICIPO, especialistas: [] } }),
          ),
          [RUTA_ESPECIALISTAS]: enSecuencia(
            () => respuesta(cuerpoEspecialistas([])),
            () => respuesta(cuerpoEspecialistas([])),
            () => respuesta(cuerpoEspecialistas()),
          ),
        },
      });

      expect(await screen.findByRole('header', { name: 'No pudimos preparar tu reserva' })).toBeOnTheScreen();
      expect(screen.getByText('Revisa tu conexión e intenta de nuevo.')).toBeOnTheScreen();
      await tocar('Reintentar');

      expect(await screen.findByRole('header', { name: 'Sin especialistas disponibles' })).toBeOnTheScreen();
      expect(
        screen.getByText('Por ahora nadie del salón tiene agenda abierta para este servicio. Intenta más tarde.'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: PASO.especialista })).toBeOnTheScreen();
      await tocar('Reintentar');

      expect(await screen.findByRole('button', { name: TARJETA_UNO })).toBeOnTheScreen();
      expect(llamadasDeRuta(llamadas, 'GET /api/servicios/1')).toHaveLength(3);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each([
    [
      'sin un fin válido: solo la hora de inicio',
      citaCruda({ fechaHoraFin: 'sin-fin' }),
      [
        `Fecha: ${diaConMayuscula(DIA_CITA)}`,
        `Hora: ${horaEnTelefono(isoMexico(DIA_CITA, '11:00'))}`,
        `Especialista: ${ESPECIALISTA_UNO.nombre}`,
      ],
      [],
      true,
    ],
    [
      'sin fecha válida, servicio ni especialista',
      citaCruda({ fechaHoraInicio: 'sin-fecha', servicio: SIN_RELACION, especialista: SIN_RELACION }),
      [],
      [/^Fecha:/, /^Hora:/, /^Especialista:/],
      false,
    ],
  ])(
    'la confirmación de una cita con datos incompletos (%s) no muestra lo que falta',
    async (_caso, cita, etiquetas, sinEtiquetas, conServicio) => {
      await abrirReserva('/cita-confirmada/501', { cita });

      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      for (const etiqueta of etiquetas) {
        expect(screen.getByLabelText(etiqueta)).toBeOnTheScreen();
      }
      for (const etiqueta of sinEtiquetas) {
        expect(screen.queryByLabelText(etiqueta)).not.toBeOnTheScreen();
      }
      expect(screen.queryByText('Corte de dama') !== null).toBe(conServicio);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
