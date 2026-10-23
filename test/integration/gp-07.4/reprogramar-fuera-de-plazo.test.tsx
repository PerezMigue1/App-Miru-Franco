/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { obtenerConfiguracion } from '@/shared/api/configuracionPublica';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaConAnticipo,
  DIA_CITA,
  ID_CITA,
  INICIO_CITA_ISO,
  isoMexico,
  masMinutos,
  rutaReprogramar,
  SERVICIO_CON_ANTICIPO,
} from '../../helpers/citasFicticias';
import { conReglas, horas, REGLAS_CITA } from '../../helpers/gestionCitas';
import { abrirDetalleCon, cuerpoUnico, fechaHoraEnTelefono } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import { esperarDetalle } from '../../helpers/pantallasMisCitas';
import { horaDelServidor, sinTextos, tocar, tocarYEsperar } from '../../helpers/pantallasReserva';
import type { Llamada } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: reprogramar desde el detalle con las horas de aviso guardadas en la cita (REGLAS_CITA),
 * con las pantallas reales, el servidor simulado con memoria y el reloj en el lunes 19 de octubre de
 * 2026 a las 10:00 de México. Si falta menos que el aviso no se eligen horarios: se explica que se
 * reagenda con el salón, con sus horas, y se ofrece llamar o escribir. Con tiempo suficiente se elige
 * otro horario y "De" y "A" salen con el mismo formato y la hora del teléfono.
 */

const REPROGRAMAR = `/cita/${ID_CITA}/reprogramar`;
/** 'Martes 20 de octubre, 11:00 a. m.': día con mayúscula, coma y hora de 12 horas. */
const FORMATO_FECHA_HORA = /^[A-ZÁÉÍÓÚ][a-záéíóú]+ \d{1,2} de [a-z]+, \d{1,2}:\d{2} [ap]\. m\.$/;

const disponibilidadesPedidas = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'));

describe('Reprogramar con las horas de aviso de la cita (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'con menos tiempo que el aviso no deja elegir horario, lo explica con las horas de la cita y ofrece el contacto del salón',
    async () => {
      const abrirUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      try {
        const inicio = masMinutos(AHORA, (REGLAS_CITA.horasAvisoCancelarReagendar - 1) * 60).toISOString();
        const cita = conReglas(citaConAnticipo({ fechaHoraInicio: inicio, fechaHoraFin: masMinutos(inicio, 150).toISOString() }));
        const { app, llamadas } = await abrirDetalleCon(cita);

        await tocarYEsperar(app, 'Reprogramar', REPROGRAMAR);
        expect(await screen.findByRole('header', { name: 'Reagenda con el salón' })).toBeOnTheScreen();
        expect(
          screen.getByText(
            obtenerTexto('citas.reprogramar.avisoMinimo', { horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar) }),
          ),
        ).toBeOnTheScreen();
        const llamar = obtenerTexto('salon.contacto.telefono', { telefono: obtenerConfiguracion().salon.telefono.trim() });
        expect(screen.getByRole('button', { name: RESPALDO_TEXTOS['salon.contacto.whatsapp'] })).toBeOnTheScreen();
        sinTextos('Confirmar cambio', 'Tu cambio');
        expect(disponibilidadesPedidas(llamadas)).toEqual([]);

        await fireEvent.press(screen.getByRole('button', { name: llamar }));
        expect(abrirUrl).toHaveBeenCalledWith(expect.stringMatching(/^tel:/));

        await tocar('Volver a tu cita');
        await esperarDetalle(app, ID_CITA);
        expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
      } finally {
        abrirUrl.mockRestore();
      }
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con tiempo suficiente elige otro horario, ve "De" y "A" con el mismo formato y confirma el cambio',
    async () => {
      const { app, llamadas } = await abrirDetalleCon(conReglas(citaConAnticipo()));

      await tocarYEsperar(app, 'Reprogramar', REPROGRAMAR);
      await tocar(horaDelServidor(DIA_CITA, '12:30'));
      expect(await screen.findByRole('header', { name: 'Tu cambio' })).toBeOnTheScreen();

      const nuevo = isoMexico(DIA_CITA, '12:30');
      const de = fechaHoraEnTelefono(INICIO_CITA_ISO);
      const a = fechaHoraEnTelefono(nuevo);
      expect(screen.getByLabelText(`Cambio de tu cita. De: ${de}. A: ${a}.`)).toBeOnTheScreen();
      expect(de).toMatch(FORMATO_FECHA_HORA);
      expect(a).toMatch(FORMATO_FECHA_HORA);

      await tocar('Confirmar cambio');
      await esperarDetalle(app, ID_CITA);
      expect(cuerpoUnico(llamadas, rutaReprogramar())).toEqual({
        fechaHoraInicio: nuevo,
        fechaHoraFin: masMinutos(nuevo, SERVICIO_CON_ANTICIPO.duracionMinutos).toISOString(),
      });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
