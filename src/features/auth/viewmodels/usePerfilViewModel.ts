import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { generacionActual } from '@/shared/api/tokenStorage';
import { useApariencia } from '@/shared/ui/apariencia';
import type { PreferenciaApariencia } from '@/shared/ui/preferencias';
import { useCandado } from '@/shared/ui/useCandado';

import { MENSAJE_SIN_CONEXION, esErrorDeRed, estadoHttp, urlAvisoPrivacidad } from '../models/AuthModel';
import { actualizarPerfil, obtenerPerfilCompleto, pedirFirmaFoto, subirFoto } from '../models/authService';
import { borrarFotoTemporal, prepararFoto } from '../models/fotoPerfil';
import {
  MENSAJE_ESPERA_UN_MOMENTO,
  MENSAJE_FOTO_FALLIDA,
  MENSAJE_FOTO_NO_GUARDADA,
  MENSAJE_FOTO_PESADA,
  MENSAJE_QUITAR_FALLIDO,
  MENSAJE_SUBIDA_NO_DISPONIBLE,
  PESO_MAXIMO_FOTO,
  esFotoCloudinary,
  firmaDeRespuesta,
  normalizarPerfil,
  urlDeFotoSubida,
} from '../models/PerfilModel';
import { useAuth } from './useAuth';

const CIERRE_FALLIDO = 'No se pudo cerrar la sesión. Intenta de nuevo';
const AVISOS_GUARDADO: Record<string, string> = {
  perfil: 'Tus cambios se guardaron.',
};

export type EstadoPerfil = 'sinSesion' | 'cargando' | 'listo' | 'error';

/** Lo único del perfil que muestra esta pantalla (nunca las alergias). */
export interface PerfilVisible {
  nombre: string;
  email: string;
  foto: string | null;
  /** false: la cuenta entra con Google y no puede cambiar contraseña desde aquí. */
  tienePassword: boolean;
}

export interface PerfilViewModel {
  estado: EstadoPerfil;
  perfil: PerfilVisible | null;
  reintentar: () => void;
  /** Aviso de éxito al volver de Editar perfil. */
  avisoGuardado: string | null;
  errorCierre: string | null;
  // Confirmaciones antes de acciones destructivas
  confirmarQuitarFoto: boolean;
  confirmarCierre: boolean;
  quitarFotoConfirmada: () => void;
  cerrarSesionConfirmada: () => void;
  cancelarConfirmacion: () => void;
  // Foto
  opcionesFoto: boolean;
  abrirOpcionesFoto: () => void;
  cerrarOpcionesFoto: () => void;
  elegirFoto: () => void;
  quitarFoto: () => void;
  fotoOcupada: boolean;
  errorFoto: string | null;
  /** La clienta negó el acceso a sus fotos: se explica y se ofrece abrir los ajustes. */
  permisoDenegado: boolean;
  abrirAjustes: () => void;
  // Apariencia
  apariencia: PreferenciaApariencia;
  hojaApariencia: boolean;
  abrirApariencia: () => void;
  cerrarApariencia: () => void;
  elegirApariencia: (preferencia: PreferenciaApariencia) => void;
  // Navegación
  editarPerfil: () => void;
  cambiarContrasena: () => void;
  abrirAviso: () => void;
  cerrarSesion: () => void;
}

type EtapaFoto = 'preparar' | 'firma' | 'subida' | 'guardado';

/** Mensaje en español según en qué paso falló la foto. */
function mensajeDeFoto(error: unknown, etapa: EtapaFoto): string {
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  const estado = estadoHttp(error);
  if (estado === 503) {
    return MENSAJE_SUBIDA_NO_DISPONIBLE;
  }
  if (estado === 429) {
    return MENSAJE_ESPERA_UN_MOMENTO;
  }
  if (etapa === 'guardado' && estado === 400) {
    return MENSAJE_FOTO_NO_GUARDADA;
  }
  return MENSAJE_FOTO_FALLIDA;
}

/**
 * Perfil: datos de GET /me (se recargan al volver a la pestaña), foto, apariencia, accesos y
 * cierre de sesión. Sin sesión no pide nada y no conserva datos de la cuenta anterior.
 */
export function usePerfilViewModel(): PerfilViewModel {
  const { push, navigate } = useRouter();
  // Navegación de esta pantalla: su setParams cambia los parámetros de Perfil, no de la ruta enfocada.
  const navegacion = useNavigation<{ setParams: (params: { guardado?: string }) => void }>();
  const { estado: estadoSesion, salir } = useAuth();
  const { preferencia, cambiar } = useApariencia();
  const { guardado } = useLocalSearchParams<{ guardado?: string }>();
  const conSesion = estadoSesion === 'autenticado';

  const [estado, setEstado] = useState<EstadoPerfil>(conSesion ? 'cargando' : 'sinSesion');
  const [perfil, setPerfil] = useState<PerfilVisible | null>(null);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [opcionesFoto, setOpcionesFoto] = useState(false);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [hojaApariencia, setHojaApariencia] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const [confirmarQuitarFoto, setConfirmarQuitarFoto] = useState(false);
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  // Solo la última carga escribe el estado.
  const solicitud = useRef(0);
  const candadoCierre = useCandado();
  const candadoFoto = useCandado();

  const cargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado((actual) => (actual === 'listo' ? actual : 'cargando'));
    obtenerPerfilCompleto()
      .then((respuesta) => {
        if (id !== solicitud.current) {
          return;
        }
        const completo = normalizarPerfil(respuesta);
        if (!completo) {
          setEstado('error');
          return;
        }
        // Solo lo que se muestra: los datos de salud no se quedan en esta pantalla. Una foto que no
        // sea de Cloudinary por https no se carga (cae al monograma).
        const foto = completo.foto && esFotoCloudinary(completo.foto) ? completo.foto : null;
        setPerfil({ nombre: completo.nombre, email: completo.email, foto, tienePassword: completo.tienePassword });
        setEstado('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstado((actual) => (actual === 'listo' ? actual : 'error'));
        }
      });
  }, []);

  // Al volver a la pestaña (por ejemplo, después de editar) se recarga, solo con sesión.
  useFocusEffect(
    useCallback(() => {
      if (conSesion) {
        cargar();
      }
      return undefined;
    }, [conSesion, cargar]),
  );

  // Al entrar o salir de una sesión, nada de la cuenta anterior queda en memoria (perfil, foto,
  // avisos y errores). Una carga en curso de la cuenta anterior se descarta.
  useEffect(() => {
    solicitud.current += 1;
    setPerfil(null);
    setEstado(conSesion ? 'cargando' : 'sinSesion');
    setErrorFoto(null);
    setPermisoDenegado(false);
    setOpcionesFoto(false);
    setErrorCierre(null);
    setAvisoGuardado(null);
    setConfirmarQuitarFoto(false);
    setConfirmarCierre(false);
    if (conSesion) {
      cargar();
    }
  }, [conSesion, cargar]);

  // El aviso de guardado se toma del parámetro y el parámetro se borra en esta misma pantalla
  // (setParams de su navegación), para que no reaparezca al volver ni para otra cuenta.
  useEffect(() => {
    if (!guardado) {
      return;
    }
    setAvisoGuardado(AVISOS_GUARDADO[guardado] ?? null);
    navegacion.setParams({ guardado: undefined });
  }, [guardado, navegacion]);

  // El aviso se ve mientras la clienta sigue en Perfil.
  useFocusEffect(useCallback(() => () => setAvisoGuardado(null), []));

  const subirNuevaFoto = async () => {
    // Toda la subida pertenece a la sesión que la empezó: si se cierra o cambia, se abandona sin
    // pedir firma, sin guardar y sin tocar la pantalla.
    const generacion = generacionActual();
    const vigente = () => generacion === generacionActual();
    let etapa: EtapaFoto = 'preparar';
    const temporales: string[] = [];
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!vigente()) {
        return;
      }
      if (!permiso.granted) {
        setPermisoDenegado(true);
        return;
      }
      setPermisoDenegado(false);
      const eleccion = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      const elegida = eleccion.canceled ? null : eleccion.assets[0];
      if (!elegida || !vigente()) {
        return;
      }
      // La copia recortada del selector también se borra al terminar.
      temporales.push(elegida.uri);
      setErrorFoto(null);
      setFotoOcupada(true);
      const foto = await prepararFoto(elegida.uri, elegida.width, elegida.height);
      temporales.push(foto.uri);
      if (foto.tamano > PESO_MAXIMO_FOTO) {
        setErrorFoto(MENSAJE_FOTO_PESADA);
        return;
      }
      // La firma vale una hora: se pide justo antes de subir.
      etapa = 'firma';
      if (!vigente()) {
        return;
      }
      const firma = firmaDeRespuesta(await pedirFirmaFoto());
      if (!vigente()) {
        return;
      }
      if (!firma) {
        setErrorFoto(MENSAJE_FOTO_FALLIDA);
        return;
      }
      etapa = 'subida';
      const url = urlDeFotoSubida(await subirFoto(firma, foto.uri));
      if (!vigente()) {
        return;
      }
      if (!url) {
        setErrorFoto(MENSAJE_FOTO_FALLIDA);
        return;
      }
      etapa = 'guardado';
      await actualizarPerfil({ foto: url });
      if (!vigente()) {
        return;
      }
      // Una carga de /me que ya estaba en camino no debe regresar la foto anterior.
      solicitud.current += 1;
      setPerfil((actual) => (actual ? { ...actual, foto: url } : actual));
    } catch (error) {
      // La foto anterior se conserva.
      if (vigente()) {
        setErrorFoto(mensajeDeFoto(error, etapa));
      }
    } finally {
      setFotoOcupada(false);
      temporales.forEach(borrarFotoTemporal);
    }
  };

  const quitarFotoActual = async () => {
    const generacion = generacionActual();
    setErrorFoto(null);
    setFotoOcupada(true);
    try {
      await actualizarPerfil({ foto: null });
      if (generacion !== generacionActual()) {
        return;
      }
      solicitud.current += 1;
      setPerfil((actual) => (actual ? { ...actual, foto: null } : actual));
    } catch (error) {
      if (generacion === generacionActual()) {
        setErrorFoto(esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : MENSAJE_QUITAR_FALLIDO);
      }
    } finally {
      setFotoOcupada(false);
    }
  };

  const cerrar = async () => {
    setErrorCierre(null);
    // Si no se pudo borrar la sesión, sigue abierta y se avisa.
    const cerrada = await salir();
    if (!cerrada) {
      setErrorCierre(CIERRE_FALLIDO);
      return;
    }
    navigate('/inicio');
  };

  const abrirAviso = () => {
    const url = urlAvisoPrivacidad();
    if (url) {
      openBrowserAsync(url).catch(() => {
        // Sin navegador disponible no hay nada más que hacer aquí.
      });
    }
  };

  return {
    estado,
    perfil,
    reintentar: cargar,
    avisoGuardado,
    errorCierre,
    opcionesFoto,
    abrirOpcionesFoto: () => setOpcionesFoto(true),
    cerrarOpcionesFoto: () => setOpcionesFoto(false),
    elegirFoto: () => {
      setOpcionesFoto(false);
      candadoFoto(subirNuevaFoto);
    },
    // Quitar la foto se confirma antes.
    quitarFoto: () => {
      setOpcionesFoto(false);
      setConfirmarQuitarFoto(true);
    },
    confirmarQuitarFoto,
    confirmarCierre,
    quitarFotoConfirmada: () => {
      setConfirmarQuitarFoto(false);
      candadoFoto(quitarFotoActual);
    },
    cerrarSesionConfirmada: () => {
      setConfirmarCierre(false);
      candadoCierre(cerrar);
    },
    cancelarConfirmacion: () => {
      setConfirmarQuitarFoto(false);
      setConfirmarCierre(false);
    },
    fotoOcupada,
    errorFoto,
    permisoDenegado,
    abrirAjustes: () => {
      Linking.openSettings().catch(() => {
        // Sin acceso a los ajustes, el mensaje ya explica qué hacer.
      });
    },
    apariencia: preferencia,
    hojaApariencia,
    abrirApariencia: () => setHojaApariencia(true),
    cerrarApariencia: () => setHojaApariencia(false),
    elegirApariencia: (nueva) => {
      cambiar(nueva);
      setHojaApariencia(false);
    },
    editarPerfil: () => push('/editar-perfil'),
    cambiarContrasena: () => push('/cambiar-contrasena'),
    abrirAviso,
    // Mientras una foto se sube o se quita, no se cierra la sesión; si no, se confirma antes.
    cerrarSesion: () => {
      if (!fotoOcupada) {
        setConfirmarCierre(true);
      }
    },
  };
}
