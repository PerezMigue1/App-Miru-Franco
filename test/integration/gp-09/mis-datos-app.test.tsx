/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto as t } from '@/shared/api/textosSitio';

import { RUTA_SENSIBLES, respuestaEstadoSensibles } from '../../helpers/datosSensibles';
import { RUTA_PENDIENTES, respuestaPendientes } from '../../helpers/documentosPendientes';
import {
  ALERGIA_FICTICIA,
  FOTOS_ACEPTADAS,
  RUTA_CONSENTIMIENTOS,
  RUTA_MIAS,
  RUTA_MIOS,
  RUTA_MIS_DATOS,
  respuestaMe,
  respuestaMias,
  respuestaMios,
  respuestaMisDatos,
  respuestaRevocado,
  solicitudCruda,
} from '../../helpers/misDatos';
import { LIMITE_MS, abrirApp, cerrarIntroSiAparece, prepararPruebasDePantalla, ultimoBoton } from '../../helpers/pantallas';
import { CLIENTA, simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-09, bloque C: Mis datos y privacidad con las pantallas reales (renderRouter sobre src/app),
 * AuthProvider real y solo el servidor simulado en http://api.test. Se abre la ruta /mis-datos con la
 * sesión guardada de la clienta (la fila de Perfil la agrega otro bloque): los permisos muestran su
 * estado real, retirar uno pide confirmar y viaja con el token de la sesión, el acceso a mis datos no
 * muestra las alergias sin autorización y Rectificación abre Editar perfil.
 */

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const RUTAS: Record<string, Manejador> = {
  [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([]),
  [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false),
  'GET /api/auth/me': () => respuestaMe(true),
  [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_ACEPTADAS),
  [`GET ${RUTA_MIAS}`]: () => respuestaMias([solicitudCruda()]),
  [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(),
  [`POST ${RUTA_CONSENTIMIENTOS}`]: () => respuestaRevocado('promociones'),
};

async function abrirMisDatos() {
  const { token } = await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil(RUTAS);
  const app = await abrirApp('/mis-datos');
  await cerrarIntroSiAparece();
  expect(await screen.findByRole('header', { name: t('privacidad.app.derechos.titulo') })).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/mis-datos');
  return { app, llamadas, token };
}

describe('Mis datos y privacidad con las pantallas reales (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarReaceptacion();
    reiniciarDocumentosLegales();
  });

  it(
    'permisos con su estado real; retirar promociones confirma y viaja con el token de la sesión',
    async () => {
      const { llamadas, token } = await abrirMisDatos();
      const promociones = await screen.findByRole('switch', { name: t('privacidad.app.promociones.titulo') });
      expect(promociones).toBeChecked();
      expect(screen.getByRole('switch', { name: t('privacidad.app.salud.titulo') })).not.toBeChecked();
      expect(await screen.findByLabelText('Estado: Recibida')).toBeOnTheScreen();

      await fireEvent.press(promociones);
      expect(await screen.findByText(t('privacidad.app.promociones.retirarTexto'))).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);
      await fireEvent.press(ultimoBoton(t('privacidad.app.permisos.retirarPermiso')));

      expect(await screen.findByText(t('privacidad.app.promociones.retirada'))).toBeOnTheScreen();
      expect(screen.getByRole('switch', { name: t('privacidad.app.promociones.titulo') })).not.toBeChecked();
      const enviados = llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS);
      expect(enviados).toHaveLength(1);
      expect(enviados[0].cuerpo).toEqual({
        items: [{ tipo: 'promociones', accion: 'revocado' }],
        formulario: 'perfil_privacidad',
        rutaOrigen: '/mis-datos',
      });
      expect(enviados[0].cabeceras.Authorization).toBe(`Bearer ${token}`);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'ver mis datos sin autorización no muestra las alergias y Rectificación abre Editar perfil',
    async () => {
      const { app } = await abrirMisDatos();
      await fireEvent.press(
        screen.getByRole('button', { name: new RegExp(`^${escapar(t('privacidad.app.acceso.titulo'))}`) }),
      );
      expect(await screen.findByText('misdatos@ejemplo.test')).toBeOnTheScreen();
      expect(screen.queryByText(ALERGIA_FICTICIA)).not.toBeOnTheScreen();
      expect(screen.getByText(t('privacidad.app.alergias.ocultas'))).toBeOnTheScreen();

      await fireEvent.press(
        screen.getByRole('button', { name: new RegExp(`^${escapar(t('privacidad.app.rectificacion.titulo'))}`) }),
      );
      await waitFor(() => expect(app.getPathname()).toBe('/editar-perfil'));
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
