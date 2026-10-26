/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfertaDatosSensibles } from '@/features/auth/components/OfertaDatosSensibles';
import { HojaDatosSensibles } from '@/features/auth/components/HojaDatosSensibles';
import { completarDatos, leerPendientes } from '@/features/auth/models/documentosPendientes';
import { marcarOfertaHecha, ofertaYaHecha, olvidarOferta } from '@/features/auth/models/ofertaDatosSensibles';
import type { FaseReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { useAutorizacionDatosSensibles } from '@/features/auth/viewmodels/useAutorizacionDatosSensibles';
import { reiniciarOfertaDatosSensibles } from '@/features/auth/viewmodels/useOfertaDatosSensibles';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { avisarCierreSesion } from '@/shared/api/eventosSesion';
import { obtenerTexto } from '@/shared/api/textosSitio';

import {
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { RUTA_PENDIENTES, pendienteCrudo, respuestaPendientes } from '../../helpers/documentosPendientes';
import { leerSecureStore } from '../../helpers/secureStore';
import { llamadasA, servidorConRutas, type Manejador } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { authSimulada, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, correcciones de la revisión de código: la oferta de autorizar las alergias no vuelve a salir
 * al reabrir la app con la sesión guardada (marca en el teléfono por resumen del id, que se borra al
 * cerrar sesión); la hoja de la autorización no se cierra mientras se envía "Autorizo"; y un documento
 * pendiente conocido siempre tiene su página para leerlo aunque falle el repositorio. fetch simulado
 * en http://api.test con datos ficticios.
 */

let mockFase: FaseReaceptacion = 'listo';

jest.mock('expo-crypto', () => require('../../helpers/google').cryptoSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('@/features/auth/viewmodels/useDocumentosPendientes', () => ({
  ...jest.requireActual('@/features/auth/viewmodels/useDocumentosPendientes'),
  useFaseReaceptacion: () => mockFase,
}));

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-revision-1', nombre: 'Clienta Revisión', email: 'revision@ejemplo.test', rol: 'cliente' };
const TITULO_OFERTA = obtenerTexto('datosSensibles.app.ofertaTitulo');
const simular = servidorConRutas({});

beforeEach(() => {
  mockFase = 'listo';
  reiniciarSimulaciones();
  reiniciarOfertaDatosSensibles();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
});

afterEach(async () => {
  await cleanup();
});

describe('marca de la oferta en el teléfono', () => {
  it('se guarda con un resumen del id (nunca el id en claro) y se borra', async () => {
    expect(await ofertaYaHecha(CLIENTA.id)).toBe(false);

    await marcarOfertaHecha(CLIENTA.id);

    expect(await ofertaYaHecha(CLIENTA.id)).toBe(true);
    expect(await ofertaYaHecha('otra-clienta')).toBe(false);
    const claves = Object.keys(leerSecureStore()).filter((clave) => clave.startsWith('oferta_salud_'));
    expect(claves).toHaveLength(1);
    expect(claves[0]).toMatch(/^oferta_salud_[0-9a-f]{32}$/);
    expect(claves[0]).not.toContain(CLIENTA.id);

    await olvidarOferta(CLIENTA.id);
    expect(await ofertaYaHecha(CLIENTA.id)).toBe(false);
  });

  it('si el resumen falla no lanza y cuenta como no ofrecida', async () => {
    const crypto = jest.requireMock<{ digestStringAsync: jest.Mock }>('expo-crypto');
    crypto.digestStringAsync.mockRejectedValue(new Error('sin resumen'));
    try {
      await expect(marcarOfertaHecha(CLIENTA.id)).resolves.toBeUndefined();
      await expect(ofertaYaHecha(CLIENTA.id)).resolves.toBe(false);
      await expect(olvidarOferta(CLIENTA.id)).resolves.toBeUndefined();
    } finally {
      crypto.digestStringAsync.mockReset();
      const real = jest.requireActual<typeof import('node:crypto')>('node:crypto');
      crypto.digestStringAsync.mockImplementation((_a: string, datos: string) =>
        Promise.resolve(real.createHash('sha256').update(datos, 'utf8').digest('hex')),
      );
    }
  });
});

function Oferta() {
  return (
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <OfertaDatosSensibles habilitada />
    </SafeAreaProvider>
  );
}

describe('oferta al reabrir la app', () => {
  const rutas: Record<string, Manejador> = {
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false, true),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
  };

  it('después de ofrecerla, otra apertura con la sesión guardada no la repite ni consulta', async () => {
    const llamadas = simular(rutas);
    await render(<Oferta />);
    expect(await screen.findByText(TITULO_OFERTA)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('datosSensibles.app.ahoraNo') }));
    await cleanup();

    // Arranque en frío: la memoria de la sesión se pierde, la marca del teléfono no.
    reiniciarOfertaDatosSensibles();
    await render(<Oferta />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText(TITULO_OFERTA)).not.toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_SENSIBLES)).toHaveLength(1);
  });

  it('al cerrar sesión se borra la marca y el siguiente inicio de sesión la ofrece otra vez', async () => {
    simular(rutas);
    await render(<Oferta />);
    expect(await screen.findByText(TITULO_OFERTA)).toBeOnTheScreen();
    await waitFor(async () => expect(await ofertaYaHecha(CLIENTA.id)).toBe(true));

    await act(async () => {
      avisarCierreSesion('salida');
      await Promise.resolve();
    });

    await waitFor(async () => expect(await ofertaYaHecha(CLIENTA.id)).toBe(false));
  });
});

function Hoja() {
  const vm = useAutorizacionDatosSensibles({ ruta: '/mis-datos', registrarEnServidor: true, onAutorizada: () => undefined });
  return (
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <Pressable accessibilityRole="button" onPress={vm.abrir}>
        <Text>Abrir</Text>
      </Pressable>
      <Text>{vm.visible ? 'Hoja abierta' : 'Hoja cerrada'}</Text>
      <HojaDatosSensibles vm={vm} />
    </SafeAreaProvider>
  );
}

describe('hoja de la autorización mientras se envía', () => {
  it('"Ahora no" no la cierra mientras se envía "Autorizo"; al responder el backend sí se cierra', async () => {
    await sembrarSesion(CLIENTA);
    let responder: (respuesta: Response) => void = () => undefined;
    const enCamino = new Promise<Response>((resolver) => {
      responder = resolver;
    });
    simular({
      [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
      [`POST ${RUTA_SENSIBLES}`]: () => enCamino as unknown as Response,
    });
    await render(<Hoja />);
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: obtenerTexto('datosSensibles.app.casilla') }));
    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('datosSensibles.app.autorizo') }));

    await fireEvent.press(screen.getByRole('button', { name: obtenerTexto('datosSensibles.app.ahoraNo') }));
    expect(screen.getByText('Hoja abierta')).toBeOnTheScreen();

    await act(async () => {
      responder(respuestaAutorizada());
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Hoja cerrada')).toBeOnTheScreen());
  });
});

describe('documento pendiente conocido sin repositorio', () => {
  it('sin el vigente usa la ruta de respaldo: siempre se puede leer lo que se pide aceptar', async () => {
    reiniciarDocumentosLegales();
    await sembrarSesion(CLIENTA);
    simular({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]) });

    expect((await completarDatos(await leerPendientes()))[0]).toMatchObject({ titulo: 'Aviso de Privacidad', ruta: '/aviso-de-privacidad' });
  });
});
