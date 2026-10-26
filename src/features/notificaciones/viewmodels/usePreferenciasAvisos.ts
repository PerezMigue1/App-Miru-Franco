import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '@/shared/api/apiClient';
import { esSinRespuesta, mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  agruparPorTipo,
  alternar,
  CANALES_AVISO,
  cambiosPendientes,
  claveDe,
  esPreferenciasNoDisponibles,
  guardarPreferencias,
  leerPreferencias,
  nuevaVerdad,
  valorEnPantalla,
  type Borrador,
  type CanalAviso,
  type PreferenciaAviso,
} from '../models/preferenciasAvisosModel';

export type { CanalAviso } from '../models/preferenciasAvisosModel';

/** 'noDisponible': el backend todavía no tiene la función (404). */
export type EstadoPreferencias = 'cargando' | 'lista' | 'noDisponible' | 'errorCarga';

/** Un interruptor de un canal de un aviso, listo para pintar. */
export interface InterruptorPreferencia {
  /** "tipo:canal". */
  clave: string;
  canal: CanalAviso;
  /** Nombre del aviso. */
  titulo: string;
  /** Lo que TalkBack lee como nombre: el aviso y el canal ("Recordatorio de tu cita, Por correo"). */
  etiquetaAccesible: string;
  /** El canal ("En la app", "Por correo" o, si es el único, "Solo en la app"). */
  descripcion: string;
  encendido: boolean;
  /** Mientras se guarda. */
  deshabilitado: boolean;
  cambiar: (encendido: boolean) => void;
}

/** Los interruptores de un tipo de aviso, juntos. */
export interface GrupoPreferencia {
  tipo: string;
  interruptores: InterruptorPreferencia[];
}

/** Confirmación de salir con cambios sin guardar. */
export interface SalidaSinGuardar {
  visible: boolean;
  titulo: string;
  texto: string;
  textoSalir: string;
  textoQuedarse: string;
  salir: () => void;
  quedarse: () => void;
}

export interface PreferenciasAvisosViewModel {
  titulo: string;
  intro: string;
  /** Una línea: estas son de la cuenta; "Avisos en la app" de Perfil es solo de este teléfono. */
  diferenciaLocal: string;
  volver: () => void;
  estado: EstadoPreferencias;
  textoCargando: string;
  /** Con estado 'errorCarga': por qué no se cargaron (sin red, límite, servidor...). */
  errorCarga: string | null;
  textoNoDisponible: string;
  /** "Reintentar" o, tras un 429, "Reintentar (N s)". */
  textoReintentar: string;
  reintentarDeshabilitado: boolean;
  reintentar: () => void;
  grupos: GrupoPreferencia[];
  /** La respuesta a una solicitud ARCO: fija, encendida y sin poder cambiarse, en los dos canales. */
  arco: {
    titulo: string;
    explicacion: string;
    canales: { canal: CanalAviso; descripcion: string; etiquetaAccesible: string }[];
  };
  /** "Guardar", "Guardando…", "Guardar (N s)" o, tras un fallo de red o del servidor, "Reintentar". */
  textoGuardar: string;
  /** Sin cambios, mientras se guarda o durante la espera de un 429. */
  guardarDeshabilitado: boolean;
  guardando: boolean;
  guardar: () => void;
  /** "Guardamos tus preferencias de avisos." tras guardar, o null. */
  avisoGuardado: string | null;
  /** Por qué no se guardó, o null. */
  errorGuardado: string | null;
  salida: SalidaSinGuardar;
}

/**
 * Preferencias de avisos (Perfil > Preferencias de avisos), como la pantalla de la web: arma la lista
 * con lo que da GET /api/notificaciones/preferencias (un grupo por tipo, un interruptor por canal),
 * muestra fija la respuesta ARCO y Guardar manda solo lo que cambió. Un interruptor nunca dice que se
 * guardó antes de que el backend lo confirme. Salir con cambios sin guardar pide confirmar en una
 * hoja. Errores por code y estado: 404 (sin la función en el backend), 400 PREFERENCIA_NO_DISPONIBLE
 * (la lista se vuelve a pedir sin perder lo elegido), 429 con su espera, sin red y 5xx.
 */
/**
 * Nombre accesible de un interruptor: el aviso y el canal juntos, para que los dos interruptores de un
 * mismo aviso no se anuncien igual.
 */
function nombreAccesible(aviso: string, canal: string): string {
  return `${aviso}, ${canal}`;
}

export function usePreferenciasAvisos(): PreferenciasAvisosViewModel {
  const texto = useTextos();
  const router = useRouter();
  const navigation = useNavigation();
  const espera = useEsperaLimite();
  const candado = useCandado();
  const [estado, setEstado] = useState<EstadoPreferencias>('cargando');
  const [preferencias, setPreferencias] = useState<PreferenciaAviso[]>([]);
  const [borrador, setBorrador] = useState<Borrador>({});
  // Se guardan las causas, no los textos: el mensaje se arma al pintar con los textos vigentes. Así
  // cargar no depende de los textos y una recarga de la configuración no reinicia la pantalla.
  const [causaCarga, setCausaCarga] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const [causaGuardado, setCausaGuardado] = useState<unknown>(null);
  const [conReintento, setConReintento] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [salidaVisible, setSalidaVisible] = useState(false);
  const turno = useRef(0);
  const montado = useRef(true);
  const { esperarSiLimite } = espera;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      turno.current++;
    };
  }, []);

  const cargar = useCallback(() => {
    const actual = ++turno.current;
    setEstado('cargando');
    setCausaCarga(null);
    leerPreferencias()
      .then((lista) => {
        if (turno.current === actual) {
          setPreferencias(lista);
          setBorrador({});
          setEstado('lista');
        }
      })
      .catch((error_: unknown) => {
        if (turno.current !== actual) {
          return;
        }
        if (esPreferenciasNoDisponibles(error_)) {
          setEstado('noDisponible');
          return;
        }
        esperarSiLimite(error_);
        setCausaCarga(error_);
        setEstado('errorCarga');
      });
  }, [esperarSiLimite]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Tras un 400 PREFERENCIA_NO_DISPONIBLE la lista del backend cambió: se vuelve a pedir sin tapar la
   * pantalla y lo elegido que siga existiendo se conserva. Si falla, se queda la lista que había.
   */
  const releerEnSilencio = useCallback(() => {
    const actual = ++turno.current;
    leerPreferencias()
      .then((lista) => {
        if (turno.current !== actual) {
          return;
        }
        const existentes = new Set(lista.map((p) => claveDe(p.tipo, p.canal)));
        setPreferencias(lista);
        setBorrador((previo) => Object.fromEntries(Object.entries(previo).filter(([clave]) => existentes.has(clave))));
      })
      .catch(() => {
        // La pantalla se queda con la lista que ya tenía.
      });
  }, []);

  const cambios = useMemo(() => cambiosPendientes(preferencias, borrador), [preferencias, borrador]);
  const hayCambios = estado === 'lista' && cambios.length > 0;

  // Salir con cambios sin guardar (Volver, el Atrás de Android o un gesto): se pide confirmar.
  const hayCambiosRef = useRef(hayCambios);
  const accionPendiente = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  useEffect(() => {
    hayCambiosRef.current = hayCambios;
  });
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (evento) => {
        if (!hayCambiosRef.current) {
          return;
        }
        evento.preventDefault();
        accionPendiente.current = evento.data.action;
        setSalidaVisible(true);
      }),
    [navigation],
  );

  const salir = useCallback(() => {
    const accion = accionPendiente.current;
    accionPendiente.current = null;
    setSalidaVisible(false);
    if (accion) {
      // La clienta eligió salir: los cambios se descartan y ya no se vuelve a preguntar.
      hayCambiosRef.current = false;
      navigation.dispatch(accion);
    }
  }, [navigation]);

  const quedarse = useCallback(() => {
    accionPendiente.current = null;
    setSalidaVisible(false);
  }, []);

  const cambiar = (tipo: string, canal: CanalAviso) => {
    if (guardando) {
      return;
    }
    setBorrador((previo) => alternar(preferencias, previo, tipo, canal));
    setGuardado(false);
    setCausaGuardado(null);
    setConReintento(false);
  };

  const enviar = async () => {
    const enviados = cambios;
    const anterior = preferencias;
    // Una lectura que siga en camino (por ejemplo, la relectura tras PREFERENCIA_NO_DISPONIBLE) ya no
    // cuenta: no puede pisar lo que responda este guardado.
    turno.current++;
    setGuardando(true);
    setCausaGuardado(null);
    setGuardado(false);
    try {
      const respuesta = await guardarPreferencias(enviados);
      if (!montado.current) {
        return;
      }
      setPreferencias(nuevaVerdad(respuesta, anterior, enviados));
      setBorrador({});
      setConReintento(false);
      setGuardado(true);
    } catch (error_) {
      if (!montado.current) {
        return;
      }
      if (esPreferenciasNoDisponibles(error_)) {
        setEstado('noDisponible');
        return;
      }
      esperarSiLimite(error_);
      setCausaGuardado(error_);
      // Sin red o con un 5xx el botón dice "Reintentar": lo elegido sigue en pantalla.
      setConReintento(esSinRespuesta(error_) || (error_ instanceof ApiError && error_.status >= 500));
      if (error_ instanceof ApiError && error_.code === 'PREFERENCIA_NO_DISPONIBLE') {
        releerEnSilencio();
      }
    } finally {
      if (montado.current) {
        setGuardando(false);
      }
    }
  };

  const guardar = () => {
    if (cambios.length === 0 || guardando || espera.activa) {
      return;
    }
    candado(enviar);
  };

  const reintentar = () => {
    if (!espera.activa) {
      cargar();
    }
  };

  const textoApp = texto('preferenciasAvisos.canalApp');
  const textoCanal: Record<CanalAviso, string> = { in_app: textoApp, email: texto('preferenciasAvisos.canalCorreo') };
  const grupos: GrupoPreferencia[] = agruparPorTipo(preferencias).map((grupo) => {
    const canales = CANALES_AVISO.filter((canal) => grupo.canales[canal] !== undefined);
    const soloApp = canales.length === 1 && canales[0] === 'in_app';
    return {
      tipo: grupo.tipo,
      interruptores: canales.map((canal) => ({
        clave: claveDe(grupo.tipo, canal),
        canal,
        titulo: grupo.etiqueta,
        etiquetaAccesible: nombreAccesible(grupo.etiqueta, textoCanal[canal]),
        descripcion: soloApp ? texto('preferenciasAvisos.canalSoloApp') : textoCanal[canal],
        encendido: valorEnPantalla(grupo.canales[canal] === true, borrador, grupo.tipo, canal),
        deshabilitado: guardando,
        cambiar: () => cambiar(grupo.tipo, canal),
      })),
    };
  });

  let textoGuardar = texto('preferenciasAvisos.guardar');
  if (guardando) {
    textoGuardar = texto('preferenciasAvisos.guardando');
  } else if (espera.activa) {
    textoGuardar = texto('preferenciasAvisos.guardarEspera', { segundos: espera.restantes });
  } else if (conReintento) {
    textoGuardar = texto('preferenciasAvisos.reintentar');
  }

  return {
    titulo: texto('preferenciasAvisos.titulo'),
    intro: texto('preferenciasAvisos.intro'),
    diferenciaLocal: texto('preferenciasAvisos.app.diferenciaLocal'),
    volver: router.back,
    estado,
    textoCargando: texto('preferenciasAvisos.cargando'),
    errorCarga:
      estado === 'errorCarga' ? mensajeParaClienta(causaCarga, { respaldo: texto('preferenciasAvisos.errorCarga') }) : null,
    textoNoDisponible: texto('preferenciasAvisos.noDisponible'),
    textoReintentar: espera.activa
      ? texto('preferenciasAvisos.reintentarEspera', { segundos: espera.restantes })
      : texto('preferenciasAvisos.reintentar'),
    reintentarDeshabilitado: espera.activa,
    reintentar,
    grupos,
    arco: {
      titulo: texto('preferenciasAvisos.arcoRespuesta'),
      explicacion: texto('preferenciasAvisos.arcoRespuestaExplicacion'),
      canales: CANALES_AVISO.map((canal) => ({
        canal,
        descripcion: textoCanal[canal],
        etiquetaAccesible: nombreAccesible(texto('preferenciasAvisos.arcoRespuesta'), textoCanal[canal]),
      })),
    },
    textoGuardar,
    guardarDeshabilitado: cambios.length === 0 || guardando || espera.activa,
    guardando,
    guardar,
    avisoGuardado: guardado ? texto('preferenciasAvisos.guardado') : null,
    errorGuardado:
      causaGuardado === null
        ? null
        : mensajeParaClienta(causaGuardado, { respaldo: texto('preferenciasAvisos.errorGuardado') }),
    salida: {
      visible: salidaVisible,
      titulo: texto('preferenciasAvisos.sinGuardarTitulo'),
      texto: texto('preferenciasAvisos.sinGuardarTexto'),
      textoSalir: texto('preferenciasAvisos.sinGuardarSalir'),
      textoQuedarse: texto('preferenciasAvisos.sinGuardarQuedarse'),
      salir,
      quedarse,
    },
  };
}
