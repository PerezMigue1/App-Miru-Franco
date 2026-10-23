/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { render } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import DocumentoLegalRuta from '@/app/legal/[slug]';
import { CasillaPoliticaAnticipos } from '@/features/citas/components/CasillaPoliticaAnticipos';
import type { ReglasPoliticaAnticipos } from '@/features/citas/viewmodels/useCasillaPoliticaAnticipos';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { Casilla, EnlaceEnTexto } from '@/shared/ui/Casilla';
import { toqueMinimo } from '@/shared/ui/tokens';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { rutaDocumento, rutaVigente, sinRed } from '../../helpers/documentosFicticios';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { servidorConRutas } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: casilla de verificación compartida (src/shared/ui/Casilla.tsx) y la de la Política de
 * anticipos (CasillaPoliticaAnticipos con su viewmodel). El estado lo controla el padre, la casilla
 * mide 48dp, anuncia el error y el nombre de la política es un enlace al visor. Servidor y disco
 * ficticios.
 */

const ETIQUETA = 'Leí la Política de anticipos y cancelación';
const ENLACE = 'Política de anticipos y cancelación';
const FALTA = 'Para continuar marca que leíste la Política de anticipos y cancelación.';
const simularServidor = servidorConRutas({});

/** Casilla controlada por un estado de prueba, con un enlace dentro de la etiqueta. */
function CasillaControlada({ error = null, alAbrir = () => undefined, deshabilitada = false }: {
  error?: string | null;
  alAbrir?: () => void;
  deshabilitada?: boolean;
}) {
  const [marcada, setMarcada] = useState(false);
  return (
    <Casilla marcada={marcada} onCambiar={setMarcada} etiquetaAccesible="Acepto los términos ficticios" error={error} deshabilitada={deshabilitada}>
      Acepto los <EnlaceEnTexto texto="términos ficticios" onPress={alAbrir} />
    </Casilla>
  );
}

const casilla = () => screen.getByRole('checkbox', { name: 'Acepto los términos ficticios' });

describe('Casilla', () => {
  it('empieza sin marcar, se marca y desmarca con la casilla o con el texto', async () => {
    await render(<CasillaControlada />);

    expect(casilla()).not.toBeChecked();
    await fireEvent.press(casilla());
    expect(casilla()).toBeChecked();
    await fireEvent.press(screen.getByText(/Acepto los/));
    expect(casilla()).not.toBeChecked();
  });

  it('el área táctil de la casilla mide al menos 48dp', async () => {
    await render(<CasillaControlada />);

    const estilo = StyleSheet.flatten(casilla().props.style);
    expect(estilo.width).toBeGreaterThanOrEqual(toqueMinimo);
    expect(estilo.height).toBeGreaterThanOrEqual(toqueMinimo);
  });

  it('el enlace es su propio elemento con rol link y no marca la casilla', async () => {
    const alAbrir = jest.fn();
    await render(<CasillaControlada alAbrir={alAbrir} />);

    await fireEvent.press(screen.getByRole('link', { name: 'términos ficticios' }));

    expect(alAbrir).toHaveBeenCalledTimes(1);
    expect(casilla()).not.toBeChecked();
  });

  it('el error se muestra en una región en vivo y va como pista de la casilla', async () => {
    const { rerender } = await render(<CasillaControlada />);
    expect(screen.queryByText('Marca la casilla ficticia.')).not.toBeOnTheScreen();

    await rerender(<CasillaControlada error="Marca la casilla ficticia." />);

    const mensaje = screen.getByText('Marca la casilla ficticia.');
    const [region] = screen.container.queryAll(
      (nodo) => nodo.type === 'View' && nodo.props.accessibilityLiveRegion === 'polite',
    );
    expect(region).toContainElement(mensaje);
    expect(casilla().props.accessibilityHint).toBe('Marca la casilla ficticia.');
  });

  it('deshabilitada no cambia', async () => {
    await render(<CasillaControlada deshabilitada />);

    await fireEvent.press(casilla());

    expect(casilla()).not.toBeChecked();
    expect(casilla()).toBeDisabled();
  });
});

describe('CasillaPoliticaAnticipos', () => {
  /** Pantalla con la casilla controlada (y, si se pide, las reglas de una cita). */
  function PantallaReserva({ reglas }: { reglas?: ReglasPoliticaAnticipos }) {
    const [marcada, setMarcada] = useState(false);
    return <CasillaPoliticaAnticipos marcada={marcada} onCambiar={setMarcada} error={marcada ? null : FALTA} reglas={reglas} />;
  }

  const abrir = (reglas?: ReglasPoliticaAnticipos) =>
    iniciarRouter({ index: () => <PantallaReserva reglas={reglas} />, 'legal/[slug]': DocumentoLegalRuta }, { initialUrl: '/' });

  beforeEach(() => {
    reiniciarDocumentosLegales();
    reiniciarConfiguracionPublica();
    limpiarArchivos();
  });

  afterEach(cerrarRouter);

  it('muestra el resumen, precarga la versión vigente y empieza sin marcar', async () => {
    const llamadas = simularServidor(rutaDocumento());
    await abrir();

    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
    expect(screen.getByText(/faltan más de 10 días hábiles para tu cita/)).toBeOnTheScreen();
    expect(screen.getByText(/dentro de los 5 días hábiles siguientes/)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: ETIQUETA })).not.toBeChecked();
    expect(screen.getByText(FALTA)).toBeOnTheScreen();
    expect(llamadas.filter((l) => l.ruta === rutaVigente('anticipos'))).toHaveLength(1);

    await fireEvent.press(screen.getByRole('checkbox', { name: ETIQUETA }));

    expect(screen.getByRole('checkbox', { name: ETIQUETA })).toBeChecked();
    expect(screen.queryByText(FALTA)).not.toBeOnTheScreen();
  });

  it('con las reglas de una cita usa sus días, acotados como el backend', async () => {
    simularServidor(rutaDocumento());
    await abrir({ diasHabilesExcepcionAnticipo: 15, diasHabilesCancelarConReembolso: 7 });

    expect(await screen.findByText(/faltan más de 10 días hábiles para tu cita/)).toBeOnTheScreen();
    expect(screen.getByText(/dentro de los 7 días hábiles siguientes/)).toBeOnTheScreen();
  });

  it('sin red no muestra versión, pero el enlace sigue llevando al visor', async () => {
    sinRed();
    const app = abrir();
    await app;

    await fireEvent.press(await screen.findByRole('link', { name: ENLACE }));

    await waitFor(() => expect(app.getPathname()).toBe('/legal/anticipos'));
    expect(await screen.findByRole('header', { name: 'Política de Anticipos' })).toBeOnTheScreen();
    expect(screen.queryByText(/Versión/)).not.toBeOnTheScreen();
  });

  it('el enlace navega al visor, que usa la versión ya precargada sin pedirla otra vez', async () => {
    const llamadas = simularServidor(rutaDocumento());
    const app = abrir();
    await app;
    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('link', { name: ENLACE }));

    await waitFor(() => expect(app.getPathname()).toBe('/legal/anticipos'));
    expect(await screen.findByText('Vigente desde el 14 de octubre de 2026')).toBeOnTheScreen();
    expect(llamadas.filter((l) => l.ruta === rutaVigente('anticipos'))).toHaveLength(1);
  });
});
