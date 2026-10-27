/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { obtenerTexto as t } from '@/shared/api/textosSitio';

import { RUTA_PENDIENTES, respuestaPendientes } from '../../helpers/documentosPendientes';
import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { RUTA_PREFERENCIAS, conCambio, respuestaPreferencias } from '../../helpers/preferenciasAvisos';
import { llamadasA, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-09, bloque C (Ronda 9 del backend): Preferencias de avisos con las pantallas reales (renderRouter
 * sobre src/app), AuthProvider real y solo el servidor simulado en http://api.test. Desde Perfil, la
 * fila abre la pantalla; Guardar manda el cambio con el token de la sesión y, con cambios sin guardar,
 * Volver pide confirmar en una hoja (beforeRemove de la navegación real).
 */

/** Nombre accesible del interruptor "Cita agendada" en la app. */
const CITA_EN_APP = () => `Cita agendada, ${t('preferenciasAvisos.canalApp')}`;

const RUTAS: Record<string, Manejador> = {
  [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([]),
  [`GET ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias(),
  [`PATCH ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias(conCambio('cita_creada', 'in_app', false)),
};

async function abrirPreferencias() {
  const { app, llamadas } = await abrirPerfilConSesion(RUTAS);
  const fila = await screen.findByRole('button', {
    name: `${t('preferenciasAvisos.titulo')}, ${t('preferenciasAvisos.descripcion')}`,
  });
  await fireEvent.press(fila);
  await waitFor(() => expect(app.getPathname()).toBe('/preferencias-avisos'));
  expect(await screen.findByRole('switch', { name: CITA_EN_APP() })).toBeOnTheScreen();
  return { app, llamadas };
}

describe('Preferencias de avisos con las pantallas reales (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  beforeEach(() => {
    reiniciarReaceptacion();
  });

  it(
    'desde Perfil abre la pantalla y Guardar manda solo el cambio con el token de la sesión',
    async () => {
      const { llamadas } = await abrirPreferencias();
      const lectura = llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)[0];
      expect(lectura.cabeceras.Authorization).toMatch(/^Bearer /);

      await fireEvent.press(screen.getByRole('switch', { name: CITA_EN_APP() }));
      await fireEvent.press(screen.getByRole('button', { name: t('preferenciasAvisos.guardar') }));
      expect(await screen.findByText(t('preferenciasAvisos.guardado'))).toBeOnTheScreen();
      const enviados = llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS);
      expect(enviados.map((l) => l.cuerpo)).toEqual([
        { preferencias: [{ tipo: 'cita_creada', canal: 'in_app', activo: false }] },
      ]);
      expect(enviados[0].cabeceras.Authorization).toBe(lectura.cabeceras.Authorization);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con cambios sin guardar, Volver pide confirmar: Seguir aquí se queda y Salir sin guardar regresa a Perfil',
    async () => {
      const { app, llamadas } = await abrirPreferencias();
      await fireEvent.press(screen.getByRole('switch', { name: CITA_EN_APP() }));

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      expect(await screen.findByText(t('preferenciasAvisos.sinGuardarTitulo'))).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/preferencias-avisos');
      await fireEvent.press(screen.getByRole('button', { name: t('preferenciasAvisos.sinGuardarQuedarse') }));
      expect(app.getPathname()).toBe('/preferencias-avisos');
      expect(screen.getByRole('switch', { name: CITA_EN_APP() })).not.toBeChecked();

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      await fireEvent.press(await screen.findByRole('button', { name: t('preferenciasAvisos.sinGuardarSalir') }));
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));
      expect(llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS)).toHaveLength(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
