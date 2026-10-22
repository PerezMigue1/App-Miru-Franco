/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, citaConAnticipo, DIA_CITA, ID_CITA, masMinutos, rutaDisponibilidad, type CitaCruda } from '../../helpers/citasFicticias';
import { conReglas, errorCon, horas, REGLAS_CITA, reiniciarRepositorios, turnos } from '../../helpers/gestionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConCitas } from '../../helpers/pantallasMisCitas';
import { horaDelServidor, prepararPruebasReserva, sinTextos } from '../../helpers/pantallasReserva';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import type { Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4, reprogramar con las pantallas reales: dentro de las horas de aviso de la regla de la
 * cita no se eligen horarios y se ofrece llamar o escribir al salón; con la especialista que ya no
 * atiende, su aviso propio y el contacto; y antes de confirmar, qué pasa con el anticipo y el enlace
 * a la política. Reloj fijo en AHORA y fetch simulado.
 */

const CONTACTO = [/^Llamar al /, RESPALDO_TEXTOS['salon.contacto.whatsapp']] as const;

async function abrirReprogramar(cita: CitaCruda, rutas: Record<string, Manejador> = {}) {
  await abrirConCitas(`/cita/${ID_CITA}/reprogramar`, { citas: [cita], rutas });
  expect(await screen.findByRole('header', { name: 'Reprogramar cita' })).toBeOnTheScreen();
}

describe('Reprogramar con la regla de la cita (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();
  reiniciarRepositorios();

  it(
    'dentro de las horas de aviso: explica que se reagenda con el salón y ofrece llamar o escribir',
    async () => {
      const abrirUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      await abrirReprogramar(conReglas(citaConAnticipo({ fechaHoraInicio: masMinutos(AHORA, 5 * 60).toISOString() })));
      expect(
        await screen.findByText(obtenerTexto('citas.reprogramar.avisoMinimo', { horasAviso: horas(REGLAS_CITA.horasAvisoCancelarReagendar) })),
      ).toBeOnTheScreen();
      for (const nombre of CONTACTO) {
        expect(screen.getByRole('button', { name: nombre })).toBeOnTheScreen();
      }
      sinTextos('Confirmar cambio');
      await fireEvent.press(screen.getByRole('button', { name: CONTACTO[1] }));
      expect(abrirUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\//));
      abrirUrl.mockRestore();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la especialista ya no atiende: aviso propio y contacto con el salón, sin Reintentar',
    async () => {
      await abrirReprogramar(conReglas(citaConAnticipo()), {
        [rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 2)]: turnos(errorCon(404, 'Especialista no encontrado o inactivo')),
      });
      expect(await screen.findByText(RESPALDO_TEXTOS['citas.reprogramar.especialistaInactiva'])).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: CONTACTO[0] })).toBeOnTheScreen();
      sinTextos('Reintentar', 'Especialista no encontrado o inactivo');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'al elegir horario, "Tu cambio" dice qué pasa con el anticipo y enlaza la política',
    async () => {
      await abrirReprogramar(conReglas(citaConAnticipo()));
      await fireEvent.press(await screen.findByRole('button', { name: horaDelServidor(DIA_CITA, '12:30') }));
      expect(await screen.findByRole('header', { name: 'Tu cambio' })).toBeOnTheScreen();
      expect(screen.getByText(/^Tu anticipo conserva su plazo: págalo en línea antes de/)).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: RESPALDO_TEXTOS['anticipos.enlacePolitica'] })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
