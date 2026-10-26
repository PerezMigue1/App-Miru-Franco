/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { navegadorRegresa, REGRESO_GOOGLE } from '../../helpers/google';
import { abrirAcceso, LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasGoogle, simularServidorGoogle, tocarGoogle } from '../../helpers/pantallasGoogle';
import { abrirRegistro } from '../../helpers/registroPantalla';
import { TEXTO } from '../../helpers/reactivar';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-09, bloque B5 (pendiente E3): cuando Google regresa con la cuenta desactivada, el aviso sale en
 * cualquier formulario, pero el botón "Reactivar mi cuenta" solo en Acceso; en Registro y en
 * Recuperar queda únicamente el aviso. Pantallas reales, navegador y expo-crypto simulados,
 * servidor en http://api.test con datos ficticios.
 */

const DESACTIVADA = `${REGRESO_GOOGLE}?error=cuenta_desactivada`;

describe('"Reactivar mi cuenta" tras el aviso de Google solo en Acceso (GP-09)', () => {
  const esperarConsolaLimpia = prepararPruebasGoogle();

  beforeEach(() => {
    reiniciarReaceptacion();
    reiniciarDocumentosLegales();
  });

  it(
    'en Registro sale el aviso de la cuenta desactivada sin el botón; en Acceso, con el botón',
    async () => {
      simularServidorGoogle();
      await abrirRegistro();
      navegadorRegresa(DESACTIVADA);

      await tocarGoogle();
      expect(await screen.findByText(TEXTO.desactivada)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();

      // En Acceso, el mismo regreso sí ofrece reactivar.
      await fireEvent.press(screen.getByRole('tab', { name: 'Acceso' }));
      expect(await screen.findByText('Inicia sesión')).toBeOnTheScreen();
      navegadorRegresa(DESACTIVADA);
      await tocarGoogle();
      expect(await screen.findByText(TEXTO.desactivada)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: TEXTO.boton })).toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'en Recuperar sale el aviso sin el botón',
    async () => {
      simularServidorGoogle();
      const app = await abrirAcceso();
      await fireEvent.press(screen.getByRole('link', { name: RESPALDO_TEXTOS['auth.login.olvidaste'] }));
      await waitFor(() => expect(app.getPathname()).toBe('/recuperar'));
      navegadorRegresa(DESACTIVADA);

      await tocarGoogle();
      expect(await screen.findByText(TEXTO.desactivada)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TEXTO.boton })).not.toBeOnTheScreen();

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
