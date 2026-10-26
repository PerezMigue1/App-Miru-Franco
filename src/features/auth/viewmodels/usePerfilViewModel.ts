import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto, type ClaveTextoSitio } from '@/shared/api/textosSitio';
import { generacionActual } from '@/shared/api/tokenStorage';
import { useTextos } from '@/shared/api/useTextos';
import { useApariencia } from '@/shared/ui/apariencia';
import type { PreferenciaApariencia } from '@/shared/ui/preferencias';
import { useCandado } from '@/shared/ui/useCandado';

import { estadoHttp, urlAvisoPrivacidad } from '../models/AuthModel';
import { actualizarPerfil, obtenerPerfilCompleto, pedirFirmaFoto, subirFoto } from '../models/authService';
import { borrarFotoTemporal, prepararFoto } from '../models/fotoPerfil';
import { galeriaSinPermiso, resultadoPermisoGaleria } from '../models/permisoGaleria';
import {
  MENSAJE_ESPERA_UN_MOMENTO,
  MENSAJE_FOTO_FALLIDA,
  MENSAJE_FOTO_NO_GUARDADA,
  mensajeFotoPesada,
  MENSAJE_QUITAR_FALLIDO,
  MENSAJE_SUBIDA_NO_DISPONIBLE,
  PESO_MAXIMO_FOTO,
  esFotoCloudinary,
  firmaDeRespuesta,
  normalizarPerfil,
  urlDeFotoSubida,
} from '../models/PerfilModel';
import { useAuth } from './useAuth';
import { fijarFotoClienta } from './useFotoClienta';

/** Aviso al volver de cada pantalla que guarda (?guardado=...), por su clave del catálogo. */
const AVISOS_GUARDADO: Record<string, ClaveTextoSitio> = {
  perfil: 'perfil.guardado',
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
  /** Con estado 'error': por qué no se cargó el perfil (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
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
  /** La hoja de opciones terminó de irse (alCerrarse de Hoja): ya puede salir la explicación. */
  alCerrarseOpciones: () => void;
  cerrarOpcionesFoto: () => void;
  elegirFoto: () => void;
  quitarFoto: () => void;
  fotoOcupada: boolean;
  errorFoto: string | null;
  /** La clienta negó el acceso a sus fotos: se explica y se ofrece abrir los ajustes. */
  permisoDenegado: boolean;
  abrirAjustes: () => void;
  /**
   * Android 12 o anterior: hoja que explica para qué se piden las fotos antes de que el teléfono
   * pregunte. No aparece si el permiso ya estaba concedido, ni en Android 13 o más nuevo: el
   * selector del sistema no pide permiso.
   */
  explicacionGaleria: boolean;
  /** "Continuar" de la explicación: pide el permiso y, si se concede, abre la galería. */
  continuarGaleria: () => void;
  /** "Ahora no", el velo o Atrás: cierra la explicación sin pedir nada. */
  cerrarExplicacionGaleria: () => void;
  /** La clienta negó el permiso esta vez (se puede volver a pedir): aviso sin "Abrir ajustes". */
  avisoPermisoGaleria: string | null;
  /** Textos de la explicación (catálogo, claves perfil.galeria.*). */
  textosGaleria: { titulo: string; texto: string; continuar: string; ahoraNo: string };
  // Apariencia
  apariencia: PreferenciaApariencia;
  hojaApariencia: boolean;
  abrirApariencia: () => void;
  cerrarApariencia: () => void;
  elegirApariencia: (preferencia: PreferenciaApariencia) => void;
  /** Fila "El salón" (textos del sitio): visible con y sin sesión. */
  filaSalon: { titulo: string; descripcion: string };
  /** Fila "Mi cuenta" (GP-09): desactivar o eliminar la cuenta, solo con sesión. */
  filaMiCuenta: { titulo: string; descripcion: string };
  /** Fila "Mis datos y privacidad" (GP-09): derechos ARCO, solicitudes y permisos, solo con sesión. */
  filaMisDatos: { titulo: string; descripcion: string };
  /** Fila "Preferencias de avisos" (Ronda 9): qué avisos llegan en la app y por correo, solo con sesión. */
  filaPreferenciasAvisos: { titulo: string; descripcion: string };
  // Navegación
  editarPerfil: () => void;
  abrirMisCitas: () => void;
  abrirMisPedidos: () => void;
  abrirSalon: () => void;
  cambiarContrasena: () => void;
  abrirMiCuenta: () => void;
  abrirMisDatos: () => void;
  abrirPreferenciasAvisos: () => void;
  abrirAviso: () => void;
  cerrarSesion: () => void;
}

type EtapaFoto = 'preparar' | 'firma' | 'subida' | 'guardado';

/** Mensaje en español según en qué paso falló la foto. */
function mensajeDeFoto(error: unknown, etapa: EtapaFoto): string {
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
  return mensajeParaClienta(error, { respaldo: MENSAJE_FOTO_FALLIDA });
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
  const texto = useTextos();
  const conSesion = estadoSesion === 'autenticado';

  const [estado, setEstado] = useState<EstadoPerfil>(conSesion ? 'cargando' : 'sinSesion');
  const [perfil, setPerfil] = useState<PerfilVisible | null>(null);
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [opcionesFoto, setOpcionesFoto] = useState(false);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [explicacionGaleria, setExplicacionGaleria] = useState(false);
  // La hoja de opciones de la foto ya terminó de irse: hasta entonces la explicación espera, para que
  // las dos hojas no se crucen (alCerrarse de Hoja).
  const [opcionesSalidas, setOpcionesSalidas] = useState(true);
  const [avisoPermisoGaleria, setAvisoPermisoGaleria] = useState<string | null>(null);
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
        setErrorCarga(null);
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
      .catch((error: unknown) => {
        if (id === solicitud.current) {
          setErrorCarga(error);
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
    setExplicacionGaleria(false);
    setAvisoPermisoGaleria(null);
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
    const aviso = Object.prototype.hasOwnProperty.call(AVISOS_GUARDADO, guardado) ? AVISOS_GUARDADO[guardado] : null;
    setAvisoGuardado(aviso ? obtenerTexto(aviso) : null);
    navegacion.setParams({ guardado: undefined });
  }, [guardado, navegacion]);

  // El aviso se ve mientras la clienta sigue en Perfil.
  useFocusEffect(useCallback(() => () => setAvisoGuardado(null), []));

  /**
   * Abre la galería y sube la foto elegida. Con pedirPermiso (Android 12 o anterior, después de la
   * explicación) primero pide el permiso; en Android 13 o más nuevo el selector del sistema no lo
   * necesita y se abre directo.
   */
  const subirNuevaFoto = async (pedirPermiso: boolean) => {
    // Toda la subida pertenece a la sesión que la empezó: si se cierra o cambia, se abandona sin
    // pedir firma, sin guardar y sin tocar la pantalla.
    const generacion = generacionActual();
    const vigente = () => generacion === generacionActual();
    let etapa: EtapaFoto = 'preparar';
    const temporales: string[] = [];
    try {
      setAvisoPermisoGaleria(null);
      if (pedirPermiso) {
        const resultado = resultadoPermisoGaleria(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (!vigente()) {
          return;
        }
        // Negado para siempre: solo queda abrir los ajustes. Negado esta vez: se explica sin
        // mandarla a los ajustes, porque al volver a tocar su foto el teléfono le pregunta otra vez.
        if (resultado !== 'concedido') {
          setPermisoDenegado(resultado === 'negadoParaSiempre');
          setAvisoPermisoGaleria(resultado === 'negado' ? obtenerTexto('perfil.galeria.negado') : null);
          return;
        }
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
        setErrorFoto(mensajeFotoPesada());
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
      // La cabecera de las pestañas muestra la foto nueva al instante.
      fijarFotoClienta(url);
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

  /**
   * Android 12 o anterior (y fuera de Android): si el permiso de fotos ya está concedido, la galería
   * se abre directo, sin explicación y sin volver a pedirlo; si no, sale la explicación. Si la consulta
   * falla se sigue por el camino seguro (la explicación). Si la sesión cambia mientras se consulta, se
   * abandona en silencio.
   */
  const revisarPermisoGaleria = async () => {
    const generacion = generacionActual();
    let concedido = false;
    try {
      concedido = resultadoPermisoGaleria(await ImagePicker.getMediaLibraryPermissionsAsync()) === 'concedido';
    } catch {
      // Sin respuesta del teléfono: la explicación y después la pregunta, como si no estuviera concedido.
    }
    if (generacion !== generacionActual()) {
      return;
    }
    if (concedido) {
      await subirNuevaFoto(false);
      return;
    }
    setExplicacionGaleria(true);
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
      fijarFotoClienta(null);
      solicitud.current += 1;
      setPerfil((actual) => (actual ? { ...actual, foto: null } : actual));
    } catch (error) {
      if (generacion === generacionActual()) {
        setErrorFoto(mensajeParaClienta(error, { respaldo: MENSAJE_QUITAR_FALLIDO }));
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
      setErrorCierre(obtenerTexto('perfil.cierreFallido'));
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
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    perfil,
    reintentar: cargar,
    avisoGuardado,
    errorCierre,
    opcionesFoto,
    abrirOpcionesFoto: () => {
      setOpcionesSalidas(false);
      setOpcionesFoto(true);
    },
    alCerrarseOpciones: () => setOpcionesSalidas(true),
    cerrarOpcionesFoto: () => setOpcionesFoto(false),
    // La hoja de opciones se cierra antes de abrir la galería o la explicación (nunca dos hojas). La
    // consulta del permiso va bajo el candado de la foto: dos toques no abren dos selectores.
    elegirFoto: () => {
      setOpcionesFoto(false);
      if (galeriaSinPermiso(Platform.OS, Platform.Version)) {
        candadoFoto(() => subirNuevaFoto(false));
        return;
      }
      candadoFoto(revisarPermisoGaleria);
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
    explicacionGaleria: explicacionGaleria && opcionesSalidas,
    continuarGaleria: () => {
      setExplicacionGaleria(false);
      candadoFoto(() => subirNuevaFoto(true));
    },
    cerrarExplicacionGaleria: () => setExplicacionGaleria(false),
    avisoPermisoGaleria,
    textosGaleria: {
      titulo: texto('perfil.galeria.titulo'),
      texto: texto('perfil.galeria.texto'),
      continuar: texto('perfil.galeria.continuar'),
      ahoraNo: texto('perfil.galeria.ahoraNo'),
    },
    apariencia: preferencia,
    hojaApariencia,
    abrirApariencia: () => setHojaApariencia(true),
    cerrarApariencia: () => setHojaApariencia(false),
    elegirApariencia: (nueva) => {
      cambiar(nueva);
      setHojaApariencia(false);
    },
    filaSalon: { titulo: texto('salon.titulo'), descripcion: texto('salon.perfil.descripcion') },
    filaMiCuenta: { titulo: texto('cuenta.app.fila'), descripcion: texto('cuenta.app.filaDescripcion') },
    filaMisDatos: { titulo: texto('privacidad.app.fila'), descripcion: texto('privacidad.app.filaDescripcion') },
    filaPreferenciasAvisos: {
      titulo: texto('preferenciasAvisos.titulo'),
      descripcion: texto('preferenciasAvisos.descripcion'),
    },
    editarPerfil: () => push('/editar-perfil'),
    abrirMisCitas: () => push('/mis-citas' as Href),
    abrirMisPedidos: () => push('/mis-pedidos' as Href),
    abrirSalon: () => push('/salon' as Href),
    cambiarContrasena: () => push('/cambiar-contrasena'),
    abrirMiCuenta: () => push('/mi-cuenta' as Href),
    abrirMisDatos: () => push('/mis-datos' as Href),
    abrirPreferenciasAvisos: () => push('/preferencias-avisos' as Href),
    abrirAviso,
    // Mientras una foto se sube o se quita, no se cierra la sesión; si no, se confirma antes.
    cerrarSesion: () => {
      if (!fotoOcupada) {
        setConfirmarCierre(true);
      }
    },
  };
}
