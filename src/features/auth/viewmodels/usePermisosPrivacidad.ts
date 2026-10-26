import { useCallback, useEffect, useRef, useState } from 'react';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  obtenerEstadoDatosSensibles,
  retirarDatosSensibles,
  type EstadoDatosSensibles,
} from '../models/datosSensibles';
import {
  activarPromociones,
  autorizarFotos,
  estadoFotos,
  leerRecibePromociones,
  misConsentimientos,
  retirarFotos,
  retirarPromociones,
  RUTA_MIS_DATOS,
  type EstadoFotos,
} from '../models/permisosPrivacidad';
import {
  useAutorizacionDatosSensibles,
  type AutorizacionDatosSensiblesViewModel,
} from './useAutorizacionDatosSensibles';

export type PermisoPrivacidad = 'salud' | 'promociones' | 'fotos';
export type EstadoCarga = 'cargando' | 'lista' | 'error';

/** Aviso de una sección: un error o algo que salió bien (siempre en una región en vivo). */
export interface AvisoPrivacidad {
  tono: 'peligro' | 'exito';
  texto: string;
}

/** Un interruptor listo para pintar: su estado es siempre el que confirmó el backend. */
export interface InterruptorVista {
  permiso: PermisoPrivacidad;
  titulo: string;
  /** Qué pasa con el interruptor como está (o la espera de un 429). */
  descripcion: string;
  encendido: boolean;
  /** Mientras se envía un cambio o corre la espera de un 429. */
  deshabilitado: boolean;
  cambiar: (encendido: boolean) => void;
}

/** Confirmación antes de retirar (o volver a autorizar) un permiso: sin confirmar no se envía nada. */
export interface ConfirmacionRetiro {
  visible: boolean;
  titulo: string;
  texto: string;
  accion: string;
  /** true: retirar (la acción va en el color de peligro); false: autorizar (la acción principal). */
  destructiva: boolean;
  cancelar: string;
  confirmar: () => void;
  cerrar: () => void;
}

export interface PermisosPrivacidadViewModel {
  titulo: string;
  estado: EstadoCarga;
  textoCargando: string;
  error: string | null;
  textoReintentar: string;
  reintentar: () => void;
  interruptores: InterruptorVista[];
  aviso: AvisoPrivacidad | null;
  confirmacion: ConfirmacionRetiro;
  /** La hoja de autorización de datos sensibles (encender el de salud o autorizar desde Mis datos). */
  hojaSalud: AutorizacionDatosSensiblesViewModel;
  /** true solo con la autorización vigente que confirmó el backend; null mientras no se sabe. */
  saludAutorizada: boolean | null;
  /** La oposición ARCO ya apagó las promociones: se refleja sin volver a pedir el perfil. */
  fijarPromociones: (recibe: boolean) => void;
  /** Vuelve a leer el estado real de los tres permisos (al volver a la pantalla). */
  recargar: () => void;
}

interface EstadoPermisos {
  salud: EstadoDatosSensibles;
  promociones: boolean;
  fotos: EstadoFotos;
}

/** Textos de cada retiro, del catálogo. */
const CLAVES_RETIRO = {
  salud: {
    titulo: 'privacidad.app.salud.retirarTitulo',
    texto: 'privacidad.app.salud.retirarTexto',
    accion: 'privacidad.app.salud.retirar',
    listo: 'privacidad.app.salud.retirada',
  },
  promociones: {
    titulo: 'privacidad.app.promociones.retirarTitulo',
    texto: 'privacidad.app.promociones.retirarTexto',
    accion: 'privacidad.app.permisos.retirarPermiso',
    listo: 'privacidad.app.promociones.retirada',
  },
  fotos: {
    titulo: 'privacidad.app.fotos.retirarTitulo',
    texto: 'privacidad.app.fotos.retirarTexto',
    accion: 'privacidad.app.permisos.retirarPermiso',
    listo: 'privacidad.app.fotos.retirada',
  },
} as const;

/** Textos de volver a autorizar las fotos del resultado, del catálogo. */
const CLAVES_AUTORIZAR_FOTOS = {
  titulo: 'privacidad.app.fotos.autorizarTitulo',
  texto: 'privacidad.app.fotos.autorizarTexto',
  accion: 'privacidad.app.fotos.autorizar',
  listo: 'privacidad.app.fotos.autorizada',
} as const;

/** Qué se confirma en la hoja: retirar un permiso o volver a autorizar las fotos. */
interface PorConfirmar {
  permiso: PermisoPrivacidad;
  encender: boolean;
}

/** Aviso de éxito de un cambio confirmado por el backend. */
function claveListo(permiso: PermisoPrivacidad, encender: boolean): string {
  if (!encender) {
    return CLAVES_RETIRO[permiso].listo;
  }
  return permiso === 'fotos' ? CLAVES_AUTORIZAR_FOTOS.listo : 'privacidad.app.promociones.activada';
}

const RETIROS: Record<PermisoPrivacidad, () => Promise<void>> = {
  salud: () => retirarDatosSensibles(RUTA_MIS_DATOS),
  promociones: retirarPromociones,
  fotos: retirarFotos,
};

async function leerPermisos(): Promise<EstadoPermisos> {
  const [salud, promociones, consentimientos] = await Promise.all([
    obtenerEstadoDatosSensibles(),
    leerRecibePromociones(),
    misConsentimientos(),
  ]);
  return { salud, promociones, fotos: estadoFotos(consentimientos) };
}

/**
 * Mis permisos (GP-09): interruptores para los consentimientos opcionales que el backend deja
 * retirar desde la cuenta (datos de salud, promociones y fotos del resultado). Cada interruptor
 * muestra el estado real del servidor y nunca cambia antes de que el backend confirme. Retirar pide
 * confirmar en una hoja; encender el de salud abre la autorización expresa completa y encender el de
 * promociones es un opt in directo (PATCH /api/auth/me). Las fotos se muestran si alguna vez se
 * autorizaron: apagadas, se pueden volver a autorizar confirmando en una hoja (POST
 * /api/consentimientos con accion "aceptado"). Los 429 dejan el interruptor en espera.
 *
 * `alCambiarSalud` avisa a la pantalla cuando la autorización de salud cambió (para ocultar o
 * volver a pedir las alergias de Mis datos).
 */
export function usePermisosPrivacidad(alCambiarSalud: (autorizada: boolean) => void): PermisosPrivacidadViewModel {
  const texto = useTextos();
  const esperaSalud = useEsperaLimite();
  // Promociones y fotos van por POST /api/consentimientos: comparten su límite.
  const esperaConsentimientos = useEsperaLimite();
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [permisos, setPermisos] = useState<EstadoPermisos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoPrivacidad | null>(null);
  const [confirmando, setConfirmando] = useState<PorConfirmar | null>(null);
  const [enviando, setEnviando] = useState<PermisoPrivacidad | null>(null);
  const candado = useCandado();
  const turno = useRef(0);
  const montado = useRef(true);
  const refAlCambiarSalud = useRef(alCambiarSalud);
  useEffect(() => {
    refAlCambiarSalud.current = alCambiarSalud;
  });

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      turno.current++;
    };
  }, []);

  const recargar = useCallback(() => {
    const actual = ++turno.current;
    setError(null);
    setEstado((previo) => (previo === 'lista' ? previo : 'cargando'));
    leerPermisos()
      .then((leidos) => {
        if (turno.current === actual) {
          setPermisos(leidos);
          setEstado('lista');
        }
      })
      .catch((causa: unknown) => {
        if (turno.current === actual) {
          setError(mensajeParaClienta(causa, { respaldo: texto('privacidad.app.permisos.error') }));
          setEstado('error');
        }
      });
  }, [texto]);

  const reintentar = useCallback(() => {
    setEstado('cargando');
    recargar();
  }, [recargar]);

  const actualizar = (cambio: Partial<EstadoPermisos>) => {
    setPermisos((previos) => (previos ? { ...previos, ...cambio } : previos));
  };

  const alAutorizarSalud = useCallback(() => {
    // Ya no hay recarga en vuelo que pueda devolver el estado anterior; si era la primera carga (sin
    // permisos todavía), se pide otra con el estado nuevo para no quedar en espera.
    turno.current++;
    setPermisos((previos) =>
      previos ? { ...previos, salud: { autorizado: true, pendiente: false, desde: previos.salud.desde } } : previos,
    );
    if (!permisos) {
      recargar();
    }
    setAviso({ tono: 'exito', texto: texto('privacidad.app.salud.autorizada') });
    refAlCambiarSalud.current(true);
  }, [texto, permisos, recargar]);
  const hojaSalud = useAutorizacionDatosSensibles({
    ruta: RUTA_MIS_DATOS,
    registrarEnServidor: true,
    onAutorizada: alAutorizarSalud,
  });

  const fijarPromociones = useCallback(
    (recibe: boolean) => {
      turno.current++;
      setPermisos((previos) => (previos ? { ...previos, promociones: recibe } : previos));
      if (!permisos) {
        // Era la primera carga: se pide otra para no quedar en espera.
        recargar();
      }
    },
    [permisos, recargar],
  );

  const esperaDe = (permiso: PermisoPrivacidad) => (permiso === 'salud' ? esperaSalud : esperaConsentimientos);

  /** Envía un cambio ya decidido (retiro o autorización de fotos confirmados, o activar promociones). */
  const enviar = async (permiso: PermisoPrivacidad, encender: boolean) => {
    const espera = esperaDe(permiso);
    turno.current++;
    setEnviando(permiso);
    setAviso(null);
    try {
      if (encender) {
        await (permiso === 'fotos' ? autorizarFotos() : activarPromociones());
      } else {
        await RETIROS[permiso]();
      }
      if (!montado.current) {
        return;
      }
      if (permiso === 'salud') {
        actualizar({ salud: { autorizado: false, pendiente: false, desde: null } });
        refAlCambiarSalud.current(false);
      } else if (permiso === 'promociones') {
        actualizar({ promociones: encender });
      } else {
        actualizar({ fotos: encender ? 'aceptado' : 'revocado' });
      }
      setAviso({ tono: 'exito', texto: texto(claveListo(permiso, encender)) });
    } catch (causa) {
      if (montado.current) {
        espera.esperarSiLimite(causa);
        setAviso({
          tono: 'peligro',
          texto: mensajeParaClienta(causa, { respaldo: texto('privacidad.app.permisos.errorCambio') }),
        });
      }
    } finally {
      if (montado.current) {
        setEnviando(null);
      }
    }
  };

  const ocupado = (permiso: PermisoPrivacidad) => enviando !== null || esperaDe(permiso).activa;

  const cambiar = (permiso: PermisoPrivacidad, encender: boolean) => {
    if (ocupado(permiso) || confirmando !== null) {
      return;
    }
    if (!encender || permiso === 'fotos') {
      // Retirar cualquiera, o volver a autorizar las fotos, se confirma antes en una hoja.
      setConfirmando({ permiso, encender });
      return;
    }
    if (permiso === 'salud') {
      hojaSalud.abrir();
    } else if (permiso === 'promociones') {
      candado(() => enviar('promociones', true));
    }
  };

  const interruptor = (
    permiso: PermisoPrivacidad,
    encendido: boolean,
    descripcion: string,
  ): InterruptorVista => ({
    permiso,
    titulo: texto(`privacidad.app.${permiso}.titulo`),
    descripcion: esperaDe(permiso).texto ?? descripcion,
    encendido,
    deshabilitado: ocupado(permiso),
    cambiar: (encender) => cambiar(permiso, encender),
  });

  const interruptores: InterruptorVista[] = [];
  if (permisos) {
    const salud = permisos.salud.autorizado;
    interruptores.push(
      interruptor('salud', salud, texto(salud ? 'privacidad.app.salud.encendido' : 'privacidad.app.salud.apagado')),
      interruptor(
        'promociones',
        permisos.promociones,
        texto(permisos.promociones ? 'privacidad.app.promociones.encendido' : 'privacidad.app.promociones.apagado'),
      ),
    );
    // Las fotos aparecen si alguna vez se autorizaron (en una cita o aquí); apagadas, se pueden volver
    // a autorizar. Sin ningún registro, el permiso se da en la reserva o en el salón.
    if (permisos.fotos !== 'sinRegistro') {
      const fotos = permisos.fotos === 'aceptado';
      interruptores.push(
        interruptor('fotos', fotos, texto(fotos ? 'privacidad.app.fotos.encendido' : 'privacidad.app.fotos.apagado')),
      );
    }
  }

  const autorizando = confirmando?.encender === true;
  const claves = autorizando ? CLAVES_AUTORIZAR_FOTOS : CLAVES_RETIRO[confirmando?.permiso ?? 'salud'];

  return {
    titulo: texto('privacidad.app.permisos.titulo'),
    estado,
    textoCargando: texto('privacidad.app.permisos.cargando'),
    error,
    textoReintentar: texto('privacidad.app.reintentar'),
    reintentar,
    interruptores,
    aviso,
    confirmacion: {
      visible: confirmando !== null,
      titulo: texto(claves.titulo),
      texto: texto(claves.texto),
      accion: texto(claves.accion),
      destructiva: !autorizando,
      cancelar: texto('privacidad.app.cancelar'),
      confirmar: () => {
        const elegido = confirmando;
        setConfirmando(null);
        if (elegido && !ocupado(elegido.permiso)) {
          candado(() => enviar(elegido.permiso, elegido.encender));
        }
      },
      cerrar: () => setConfirmando(null),
    },
    hojaSalud,
    saludAutorizada: permisos ? permisos.salud.autorizado : null,
    fijarPromociones,
    recargar,
  };
}
