import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { generacionActual } from '@/shared/api/tokenStorage';
import { telefonoSinLada } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  AVISO_DATOS_PERSONALES_CLAVE,
  MENSAJE_SIN_CONEXION,
  esErrorDeRed,
  estadoHttp,
  mensajeDelServidor,
  problemaDeClave,
  requisitosDeClave,
  type RequisitoClave,
} from '../models/AuthModel';
import { cambiarContrasena, obtenerPerfilCompleto } from '../models/authService';
import { normalizarPerfil } from '../models/PerfilModel';
import { useAuth } from './useAuth';

export type CampoContrasena = 'actual' | 'nueva' | 'confirmacion';
export type ErroresContrasena = Partial<Record<CampoContrasena, string | null>>;
export type EstadoContrasena = 'cargando' | 'listo' | 'error';

export interface CambiarContrasenaViewModel {
  estado: EstadoContrasena;
  reintentar: () => void;
  valores: Record<CampoContrasena, string>;
  cambiar: (campo: CampoContrasena, valor: string) => void;
  salirDe: (campo: CampoContrasena) => void;
  errores: ErroresContrasena;
  errorGeneral: string | null;
  requisitos: RequisitoClave[];
  avisoDatosPersonales: string;
  guardando: boolean;
  guardar: () => void;
  enfoque: { campo: CampoContrasena; vez: number } | null;
  volver: () => void;
}

const ORDEN: CampoContrasena[] = ['actual', 'nueva', 'confirmacion'];
const NO_COINCIDEN = 'Las contraseñas no coinciden';
const ACTUAL_INCORRECTA = 'La contraseña actual no es correcta.';
const IGUAL_A_LA_ANTERIOR = 'La nueva contraseña debe ser diferente a la contraseña anterior';

/** Solo lo que compara la regla de la contraseña (nada de datos capilares ni de salud). */
interface DatosCuenta {
  nombre: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
}

function validarCampo(
  campo: CampoContrasena,
  v: Record<CampoContrasena, string>,
  perfil: DatosCuenta | null,
): string | null {
  switch (campo) {
    case 'actual':
      return v.actual ? null : 'Ingresa tu contraseña actual';
    case 'nueva':
      // La misma regla del registro, comparada con los datos de la cuenta.
      return v.nueva
        ? problemaDeClave(v.nueva, {
            nombre: perfil?.nombre,
            email: perfil?.email,
            telefono: perfil ? telefonoSinLada(perfil.telefono) : undefined,
            fechaNacimiento: perfil?.fechaNacimiento,
          })
        : 'La contraseña es requerida';
    case 'confirmacion':
      if (!v.confirmacion) {
        return 'Confirma tu contraseña';
      }
      return v.confirmacion === v.nueva ? null : NO_COINCIDEN;
    default:
      return null;
  }
}

/** Errores del servidor: contraseña actual, nueva igual a la anterior u otro mensaje. */
function clasificarError(error: unknown): { campo: CampoContrasena | null; mensaje: string } {
  if (esErrorDeRed(error)) {
    return { campo: null, mensaje: MENSAJE_SIN_CONEXION };
  }
  const estado = estadoHttp(error);
  const mensaje = error instanceof Error ? error.message.toLowerCase() : '';
  // Primero "igual a la anterior": ese mensaje también puede mencionar la contraseña actual.
  if (estado === 400 && (mensaje.includes('misma') || mensaje.includes('anterior') || mensaje.includes('igual'))) {
    return { campo: 'nueva', mensaje: IGUAL_A_LA_ANTERIOR };
  }
  if (estado === 401 || (estado === 400 && mensaje.includes('actual'))) {
    return { campo: 'actual', mensaje: ACTUAL_INCORRECTA };
  }
  // Con 5xx nunca se muestra el texto del servidor (mensajeDelServidor).
  return { campo: null, mensaje: mensajeDelServidor(error, 'No pudimos cambiar tu contraseña. Intenta de nuevo.') };
}

/** Cambiar contraseña: actual, nueva (requisitos del registro) y confirmación. */
export function useCambiarContrasenaViewModel(): CambiarContrasenaViewModel {
  const { back, dismissTo } = useRouter();
  const { usuario } = useAuth();
  const [estado, setEstado] = useState<EstadoContrasena>('cargando');
  const [perfil, setPerfil] = useState<DatosCuenta | null>(null);
  const [valores, setValores] = useState<Record<CampoContrasena, string>>({
    actual: '',
    nueva: '',
    confirmacion: '',
  });
  const [errores, setErrores] = useState<ErroresContrasena>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoContrasena, boolean>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [enfoque, setEnfoque] = useState<{ campo: CampoContrasena; vez: number } | null>(null);
  const solicitud = useRef(0);
  const vecesEnfoque = useRef(0);
  const candado = useCandado();

  // Los datos de la cuenta hacen falta para la regla de datos personales.
  const cargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado('cargando');
    obtenerPerfilCompleto()
      .then((respuesta) => {
        if (id !== solicitud.current) {
          return;
        }
        const leido = normalizarPerfil(respuesta);
        setPerfil(
          leido
            ? {
                nombre: leido.nombre,
                email: leido.email,
                telefono: leido.telefono,
                fechaNacimiento: leido.fechaNacimiento,
              }
            : null,
        );
        setEstado(leido ? 'listo' : 'error');
      })
      .catch(() => {
        if (id === solicitud.current) {
          setEstado('error');
        }
      });
  }, []);

  useEffect(() => {
    cargar();
    return () => {
      solicitud.current += 1;
    };
  }, [cargar]);

  const cambiar = (campo: CampoContrasena, valor: string) => {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    const siguientes: ErroresContrasena = { ...errores };
    if (enVivo[campo]) {
      siguientes[campo] = validarCampo(campo, nuevos, perfil);
    }
    if (campo === 'nueva' && nuevos.confirmacion) {
      siguientes.confirmacion = validarCampo('confirmacion', nuevos, perfil);
    }
    setErrores(siguientes);
  };

  const salirDe = (campo: CampoContrasena) => {
    const problema = validarCampo(campo, valores, perfil);
    setErrores((previos) => ({ ...previos, [campo]: problema }));
    if (problema) {
      setEnVivo((previos) => ({ ...previos, [campo]: true }));
    }
  };

  const pedirEnfoque = (campo: CampoContrasena) => {
    vecesEnfoque.current += 1;
    setEnfoque({ campo, vez: vecesEnfoque.current });
  };

  const enviar = async () => {
    if (!usuario || !perfil) {
      return;
    }
    const nuevos: ErroresContrasena = {};
    for (const campo of ORDEN) {
      nuevos[campo] = validarCampo(campo, valores, perfil);
    }
    setErrores(nuevos);
    setEnVivo(Object.fromEntries(ORDEN.map((campo) => [campo, Boolean(nuevos[campo])])));
    const primero = ORDEN.find((campo) => nuevos[campo]);
    if (primero) {
      pedirEnfoque(primero);
      return;
    }
    setErrorGeneral(null);
    const generacion = generacionActual();
    setGuardando(true);
    try {
      await cambiarContrasena(usuario.id, valores.actual, valores.nueva);
      // Las contraseñas no se quedan en memoria.
      setValores({ actual: '', nueva: '', confirmacion: '' });
      // Si la sesión terminó mientras tanto, la pantalla ya se cerró: no se navega.
      if (generacion === generacionActual()) {
        dismissTo({ pathname: '/perfil', params: { guardado: 'contrasena' } });
      }
    } catch (error) {
      const { campo, mensaje } = clasificarError(error);
      if (campo) {
        setErrores((previos) => ({ ...previos, [campo]: mensaje }));
        setEnVivo((previos) => ({ ...previos, [campo]: true }));
        pedirEnfoque(campo);
      } else {
        setErrorGeneral(mensaje);
      }
    } finally {
      setGuardando(false);
    }
  };

  return {
    estado,
    reintentar: cargar,
    valores,
    cambiar,
    salirDe,
    errores,
    errorGeneral,
    requisitos: requisitosDeClave(valores.nueva),
    avisoDatosPersonales: AVISO_DATOS_PERSONALES_CLAVE,
    guardando,
    guardar: () => {
      if (!guardando) {
        candado(enviar);
      }
    },
    enfoque,
    volver: back,
  };
}
