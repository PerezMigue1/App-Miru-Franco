/// <reference types="jest" />

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { AccionesCodigo } from '@/features/auth/components/AccionesCodigo';
import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import { useAtrasSale } from '@/features/auth/viewmodels/useAtrasSale';
import { useCambiarContrasenaViewModel } from '@/features/auth/viewmodels/useCambiarContrasenaViewModel';
import { refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { respuestaCon, servidorEnOrden } from '../../helpers/limitesRed';
import { CLIENTA, PERFIL_COMPLETO } from '../../helpers/perfilClienta';
import { leer, sinComentarios } from '../../helpers/reglasCodigo';
import { respuestaConTextos } from '../../helpers/textosFicticios';
import { authSimulada, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-09, pendientes del prompt 3 en autenticación: la parte común de Activar y Reactivar
 * (AccionesCodigo y useAtrasSale, E5), la clave quitada auth.activar.yaActivada (E6) y los textos de
 * los botones de Cambiar contraseña en el catálogo (E7), con los mismos textos que antes y siguiendo a
 * la configuración del servidor. fetch simulado en http://api.test y datos ficticios.
 */

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  invalidarPerfil();
});

describe('AccionesCodigo (común de Activar y Reactivar)', () => {
  const base = {
    tituloAccion: 'Verificar código',
    onAccion: jest.fn(),
    cargandoAccion: false,
    accionDeshabilitada: false,
    textoEspera: 'Podrás pedir otro código en 42 s',
    textoOtroCodigo: 'Reenviar código',
    onOtroCodigo: jest.fn(),
    otroCodigoDeshabilitado: false,
  };

  beforeEach(() => {
    base.onAccion.mockClear();
    base.onOtroCodigo.mockClear();
  });

  it('sin espera: el botón principal y el enlace para pedir otro código', async () => {
    await render(<AccionesCodigo {...base} esperaOtroCodigo={0} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Verificar código' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
    expect(base.onAccion).toHaveBeenCalledTimes(1);
    expect(base.onOtroCodigo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(base.textoEspera)).toBeNull();
  });

  it('con espera: el texto de la espera en lugar del enlace', async () => {
    await render(<AccionesCodigo {...base} esperaOtroCodigo={42} />);
    expect(screen.getByText(base.textoEspera)).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Reenviar código' })).toBeNull();
  });

  it('deshabilitados: ni el botón ni el enlace responden', async () => {
    await render(<AccionesCodigo {...base} esperaOtroCodigo={0} accionDeshabilitada otroCodigoDeshabilitado />);
    expect(screen.getByRole('button', { name: 'Verificar código' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('link', { name: 'Reenviar código' }));
    expect(base.onOtroCodigo).not.toHaveBeenCalled();
  });

  it('Activar y Reactivar usan la pieza común y ya no repiten el bloque', () => {
    for (const vista of ['src/features/auth/views/ActivarView.tsx', 'src/features/auth/views/ReactivarView.tsx']) {
      const codigo = sinComentarios(leer(vista));
      expect(codigo).toContain('<AccionesCodigo');
      expect(codigo).not.toContain('accessibilityLiveRegion="polite"');
    }
    for (const vm of ['src/features/auth/viewmodels/useActivarViewModel.ts', 'src/features/auth/viewmodels/useReactivarViewModel.ts']) {
      const codigo = sinComentarios(leer(vm));
      expect(codigo).toContain('useAtrasSale(volver)');
      expect(codigo).not.toContain('hardwareBackPress');
    }
  });
});

describe('useAtrasSale', () => {
  it('el Atrás de Android llama a salir y consume la pulsación; deja de escuchar al desmontar', async () => {
    const quitar = jest.fn();
    let manejador: ((...args: never[]) => unknown) | null = null;
    const espia = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, fn) => {
      manejador = fn;
      return { remove: quitar };
    });
    try {
      const salir = jest.fn();
      const vista = await renderHook(() => useAtrasSale(salir));
      expect(espia).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      let consumida: unknown;
      await act(async () => {
        consumida = manejador?.();
      });
      expect(salir).toHaveBeenCalledTimes(1);
      expect(consumida).toBe(true);
      await act(async () => {
        await vista.unmount();
      });
      expect(quitar).toHaveBeenCalled();
    } finally {
      espia.mockRestore();
    }
  });
});

describe('clave quitada auth.activar.yaActivada', () => {
  it('ya no está en los textos propios de la app ni en el respaldo', () => {
    const propios = JSON.parse(leer('src/shared/api/textosPropiosApp.json')) as Record<string, string>;
    expect(Object.keys(propios)).not.toContain('auth.activar.yaActivada');
    expect(Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, 'auth.activar.yaActivada')).toBe(false);
  });
});

describe('textos de los botones de Cambiar contraseña', () => {
  const ANTERIORES: Record<string, string> = {
    'auth.cambiarContrasena.enviarCodigo': 'Enviar código',
    'auth.cambiarContrasena.enviandoCodigo': 'Enviando código…',
    'auth.cambiarContrasena.continuar': 'Continuar',
    'auth.cambiarContrasena.cambiar': 'Cambiar contraseña',
    'auth.cambiarContrasena.cambiando': 'Cambiando…',
    'auth.cambiarContrasena.reenviar': 'Reenviar código',
    'auth.cambiarContrasena.reenviando': 'Reenviando…',
    'auth.cambiarContrasena.reintentar': 'Reintentar',
  };

  it.each(Object.entries(ANTERIORES))('%s dice lo mismo que antes', (clave, texto) => {
    expect(RESPALDO_TEXTOS[clave as keyof typeof RESPALDO_TEXTOS]).toBe(texto);
  });

  it('la vista y el viewmodel ya no escriben esos textos a mano', () => {
    const vm = sinComentarios(leer('src/features/auth/viewmodels/useCambiarContrasenaViewModel.ts'));
    for (const texto of ["'Enviando código…'", "'Enviar código'", "'Cambiando…'", "'Reenviando…'", "'Reenviar código'"]) {
      expect(vm).not.toContain(texto);
    }
    expect(sinComentarios(leer('src/features/auth/views/CambiarContrasenaView.tsx'))).not.toContain("titulo: 'Reintentar'");
  });

  it('el viewmodel usa los del catálogo y sigue a la configuración del servidor', async () => {
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = { id: CLIENTA.id, nombre: CLIENTA.nombre, email: CLIENTA.email, rol: 'cliente' };
    servidorEnOrden({
      'GET /api/auth/me': [respuestaCon({ data: PERFIL_COMPLETO })],
      'GET /api/configuracion-publica': [
        respuestaCon(
          respuestaConTextos({
            'auth.cambiarContrasena.enviarCodigo': 'Mandar código ficticio',
            'auth.cambiarContrasena.reintentar': 'Reintentar ficticio',
          }),
        ),
      ],
    });
    const { result } = await renderHook(() => useCambiarContrasenaViewModel());
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current).toMatchObject({
      tituloEnvio: 'Enviar código',
      tituloCambiar: 'Cambiar contraseña',
      tituloReenviar: 'Reenviar código',
      textoReintentar: 'Reintentar',
    });

    await act(async () => {
      await refrescar();
    });
    expect(result.current).toMatchObject({ tituloEnvio: 'Mandar código ficticio', textoReintentar: 'Reintentar ficticio' });
  });
});
