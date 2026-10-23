import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

import { fechaLegible } from '@/features/citas/viewmodels/presentacionCita';
import { errorUltimoRefresco, suscribirErrorRefresco, type ValorSalon } from '@/shared/api/configuracionPublica';
import { tipoDeError, type TipoError } from '@/shared/api/mensajesError';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';

import {
  diasInhabilesProximos,
  domicilio,
  enlaceCorreo,
  enlaceMapa,
  enlaceTelefono,
  enlaceWhatsApp,
  horarioDeLaSemana,
  type DiaDelHorario,
} from '../models/salonModel';

/** Valor de "Lo que nos distingue" (la vista no importa de shared/api: lo toma de aquí). */
export type { ValorSalon };

/** Qué dato del salón muestra una fila de contacto (elige el ícono). */
export type TipoContacto = 'telefono' | 'whatsapp' | 'correo' | 'domicilio' | 'mapa';

export interface FilaContacto {
  tipo: TipoContacto;
  titulo: string;
  /** Línea opcional bajo el título (por ejemplo, el número de WhatsApp). */
  detalle: string | null;
  /** Enlace que abre al tocar; null: la fila solo informa (el domicilio). */
  url: string | null;
}

/** Un día del horario con su texto ya armado ("Cerrado" o "9:30 a 19:30"). */
export interface DiaHorarioSalon extends DiaDelHorario {
  horas: string;
}

export interface DiaInhabilSalon {
  fecha: string;
  /** "Lunes 30 de noviembre". */
  fechaLegible: string;
  motivo: string;
}

export interface SalonViewModel {
  titulo: string;
  /**
   * Aviso cuando la configuración no salió de la red (sin conexión, o no se pudo actualizar si el
   * servidor respondió con error); null con datos frescos.
   */
  avisoSinRed: string | null;
  sobreNosotros: {
    titulo: string;
    parrafos: string[];
    /** Imagen https, o null. */
    imagen: string | null;
    valoresTitulo: string;
    valores: ValorSalon[];
  };
  contacto: {
    titulo: string;
    introduccion: string;
    /** Teléfono, WhatsApp, correo, domicilio y mapa, solo los que traen dato. */
    filas: FilaContacto[];
  };
  horario: { titulo: string; dias: DiaHorarioSalon[] };
  inhabiles: { titulo: string; dias: DiaInhabilSalon[]; vacio: string };
  refrescando: boolean;
  /** Deslizar para actualizar: vuelve a pedir la configuración pública. */
  refrescar: () => void;
  /** Abre un enlace de contacto; si el teléfono no puede abrirlo, no pasa nada. */
  abrir: (url: string) => void;
  volver: () => void;
}

/**
 * Aviso de que se muestran los datos guardados: "sin conexión" solo si la última lectura falló por
 * falta de red; si respondió con error (un 5xx) o aún no hubo lectura, que no se pudieron actualizar.
 */
function avisoDatosGuardados(texto: FuncionTexto, falla: TipoError | null): string {
  return falla === 'sinConexion' ? texto('salon.sinRed') : texto('salon.sinActualizar');
}


/** Primera letra en mayúscula: "lunes 30 de noviembre" a "Lunes 30 de noviembre". */
const conMayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * El salón (GP-07.3): sobre nosotros, contacto, horario y próximos días sin servicio, todo desde la
 * configuración pública (red, archivo guardado o respaldo) y los textos del sitio. No hace peticiones
 * propias: el deslizar para actualizar pide la configuración al repositorio.
 */
export function useSalonViewModel(): SalonViewModel {
  const router = useRouter();
  const { configuracion, origen, refrescar: refrescarConfiguracion } = useConfiguracionPublica();
  const texto = useTextos();
  const [refrescando, setRefrescando] = useState(false);
  // Una falla que conserva la memoria no cambia la configuración: el error de la última lectura se
  // observa aparte (cualquier refresco: deslizar, volver a primer plano o la pantalla de carga) para
  // que el aviso cambie en cuanto se sabe, sin esperar a que la pantalla se repinte por otra causa.
  const errorRefresco = useSyncExternalStore(suscribirErrorRefresco, errorUltimoRefresco, errorUltimoRefresco);
  const falla: TipoError | null = errorRefresco ? tipoDeError(errorRefresco) : null;
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  const refrescar = useCallback(() => {
    setRefrescando(true);
    // refrescar nunca rechaza: el indicador siempre se apaga.
    void refrescarConfiguracion().then(() => {
      if (montada.current) {
        setRefrescando(false);
      }
    });
  }, [refrescarConfiguracion]);

  const abrir = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      // Sin una app que abra el enlace no hay nada más que hacer aquí.
    });
  }, []);

  const volver = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/perfil' as Href);
    }
  }, [router]);

  const { salon, horario, reglas, contenido } = configuracion;
  const hoy = new Date();
  const telefono = enlaceTelefono(salon.telefono);
  const whatsapp = enlaceWhatsApp(salon.whatsapp);
  const correo = enlaceCorreo(salon.correoContacto);
  const lugar = domicilio(salon);
  const mapa = enlaceMapa(salon);
  const filas: (FilaContacto | null)[] = [
    telefono
      ? { tipo: 'telefono', titulo: texto('salon.contacto.telefono', { telefono: salon.telefono.trim() }), detalle: null, url: telefono }
      : null,
    whatsapp
      ? { tipo: 'whatsapp', titulo: texto('salon.contacto.whatsapp'), detalle: salon.whatsapp.trim(), url: whatsapp }
      : null,
    correo
      ? { tipo: 'correo', titulo: texto('salon.contacto.correo', { correo: salon.correoContacto.trim() }), detalle: null, url: correo }
      : null,
    lugar ? { tipo: 'domicilio', titulo: lugar, detalle: null, url: null } : null,
    mapa ? { tipo: 'mapa', titulo: texto('salon.contacto.mapa'), detalle: null, url: mapa } : null,
  ];

  return {
    titulo: texto('salon.titulo'),
    avisoSinRed: origen === 'red' ? null : avisoDatosGuardados(texto, falla),
    sobreNosotros: {
      titulo: contenido.sobreNosotros.titulo,
      parrafos: contenido.sobreNosotros.parrafos,
      imagen: contenido.sobreNosotros.imagen || null,
      valoresTitulo: texto('salon.valores.titulo'),
      valores: contenido.sobreNosotros.valores,
    },
    contacto: {
      titulo: texto('salon.contacto.titulo'),
      introduccion: contenido.contacto.introduccion,
      filas: filas.filter((fila): fila is FilaContacto => fila !== null),
    },
    horario: {
      titulo: texto('salon.horario.titulo'),
      dias: horarioDeLaSemana(horario.dias, hoy).map((dia) => ({
        ...dia,
        horas: dia.cerrado ? texto('salon.horario.cerrado') : texto('salon.horario.rango', { abre: dia.abre, cierra: dia.cierra }),
      })),
    },
    inhabiles: {
      titulo: texto('salon.inhabiles.titulo'),
      dias: diasInhabilesProximos(reglas.diasInhabiles, hoy).map((dia) => ({
        fecha: dia.fecha,
        fechaLegible: conMayuscula(fechaLegible(dia.fecha)),
        motivo: dia.motivo,
      })),
      vacio: texto('salon.inhabiles.vacio'),
    },
    refrescando,
    refrescar,
    abrir,
    volver,
  };
}
