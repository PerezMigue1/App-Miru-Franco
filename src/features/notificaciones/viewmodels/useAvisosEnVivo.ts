import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { crearConexionAvisos, type ConexionAvisos } from '../models/conexionAvisos';

import { agregarAviso, cargarAvisos, limpiarAvisos } from './avisosEstado';

/**
 * Una sola conexión en vivo para toda la app (Singleton): los avisos que llegan entran al estado
 * compartido con agregarAviso y la consulta de respaldo es cargarAvisos.
 */
let conexion: ConexionAvisos | null = null;

function conexionUnica(): ConexionAvisos {
  conexion ??= crearConexionAvisos({ alAviso: agregarAviso, consultar: cargarAvisos });
  return conexion;
}

/** Al arrancar, solo 'background' e 'inactive' cuentan como fuera de primer plano. */
function enPrimerPlano(estadoApp: AppStateStatus | null | undefined): boolean {
  return estadoApp !== 'background' && estadoApp !== 'inactive';
}

/**
 * Mantiene la conexión en vivo de avisos mientras haya sesión y la app esté en primer plano: al
 * encender abre el flujo y pide la lista una vez; al pasar a segundo plano (o 'inactive') la
 * detiene; al volver reconecta y pide la lista otra vez. Sin sesión detiene y vacía los avisos.
 * Con `enVivo` en false (la clienta apagó "Avisos en la app" en Perfil, o aún no se sabe) no abre el
 * flujo ni la consulta de respaldo ni pide la lista, pero conserva la bandeja: la pide la pantalla
 * de Notificaciones al abrirla. Al desmontar detiene y quita el oyente de AppState. Nunca deja dos
 * conexiones.
 */
export function useAvisosEnVivo(conSesion: boolean, enVivo = true): void {
  useEffect(() => {
    const vivo = conexionUnica();
    if (!conSesion) {
      vivo.detener();
      limpiarAvisos();
      return undefined;
    }
    if (!enVivo) {
      // La limpieza del efecto anterior ya la detuvo (si estaba abierta).
      return undefined;
    }
    let encendida = false;
    const encender = () => {
      if (encendida) {
        return;
      }
      encendida = true;
      vivo.iniciar();
      // cargarAvisos nunca rechaza: el error queda en el estado.
      void cargarAvisos();
    };
    const apagar = () => {
      encendida = false;
      vivo.detener();
    };

    if (enPrimerPlano(AppState.currentState)) {
      encender();
    }
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') {
        encender();
      } else if (siguiente === 'background' || siguiente === 'inactive') {
        apagar();
      }
    });
    return () => {
      suscripcion.remove();
      apagar();
    };
  }, [conSesion, enVivo]);
}
