import { useCallback, useMemo } from 'react';

import { fechaLegible } from '@/features/citas/viewmodels/presentacionCita';
import type {
  IntegranteEquipo,
  PreguntaFrecuente,
  Promocion,
} from '@/features/salon/models/contenidoSalonModel';
import {
  useContenidoSalon,
  type EstadoLista,
  type ListaContenido,
} from '@/features/salon/viewmodels/useListaContenido';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';

import {
  destinoDePromocion,
  partirDestacado,
  type DestinoPromocion,
  type LineaDestacado,
} from '../models/contenidoInicioModel';
import { fotosDeGaleria, type FotoGaleria } from '../models/FotoModel';

/** Una lista de contenido de Inicio con su título, su estado y su Reintentar. */
export interface SeccionContenidoInicio<T> {
  titulo: string;
  estado: EstadoLista;
  /** Con estado 'error': por qué no se cargó (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  datos: T[];
  reintentar: () => void;
}

/** Promoción lista para pintar. */
export interface PromocionInicio {
  id: number;
  titulo: string;
  descripcion: string;
  imagenUrl: string | null;
  /** "Válida hasta el lunes 30 de noviembre.", o null si no tiene fecha de fin. */
  vigencia: string | null;
  /** null: la tarjeta no es un enlace. */
  destino: DestinoPromocion | null;
}

export interface GaleriaInicio extends SeccionContenidoInicio<FotoGaleria> {
  /** contenido.inicio.trabajoDescripcion, o null si viene vacía. */
  descripcion: string | null;
  vaciaTitulo: string;
  vaciaTexto: string;
  /** Texto del botón del visor que abre el servicio de la foto. */
  verServicio: string;
}

export interface ContenidoInicioViewModel {
  /** Nombre del salón (accessibilityLabel de la marca del hero). */
  nombreSalon: string;
  /** Frase grande del hero ya partida en líneas. */
  destacado: LineaDestacado[];
  /** Párrafos bajo el título de cada carrusel; null si vienen vacíos (no se pinta el párrafo). */
  productosDescripcion: string | null;
  serviciosDescripcion: string | null;
  galeria: GaleriaInicio;
  promociones: SeccionContenidoInicio<PromocionInicio>;
  equipo: SeccionContenidoInicio<IntegranteEquipo>;
  preguntas: SeccionContenidoInicio<PreguntaFrecuente>;
  sobreNosotros: { titulo: string; parrafos: string[]; imagen: string | null; enlace: string };
  cierre: { titulo: string; texto: string | null; boton: string };
  /** Título y texto del error de una sección de contenido. */
  error: { titulo: string; texto: string };
  /**
   * Deslizar para actualizar: vuelve a pedir la configuración y las cuatro listas a la vez. Resuelve
   * cuando terminan todas y nunca rechaza.
   */
  refrescar: () => Promise<void>;
}

/** Texto recortado, o null si queda vacío. */
const oNulo = (valor: string): string | null => valor.trim() || null;

function promocionInicio(promocion: Promocion, texto: FuncionTexto): PromocionInicio {
  const fecha = promocion.vigenteHasta ? fechaLegible(promocion.vigenteHasta) : '';
  return {
    id: promocion.id,
    titulo: promocion.titulo,
    descripcion: promocion.descripcion,
    imagenUrl: promocion.imagenUrl,
    vigencia: fecha ? texto('inicio.promociones.vigencia', { fecha }) : null,
    destino: destinoDePromocion(promocion.enlace),
  };
}

/**
 * Contenido de Inicio que no sale de los catálogos (GP-07.3): textos de la configuración pública
 * (frase del hero, descripciones, sobre nosotros y cierre), textos del sitio y las cuatro listas de
 * contenido administrable (galería, promociones, equipo y preguntas frecuentes), cada una con su
 * estado. La vista no lee la configuración ni los textos: los recibe ya armados de aquí.
 */
export function useContenidoInicio(): ContenidoInicioViewModel {
  const { configuracion, refrescar: refrescarConfiguracion } = useConfiguracionPublica();
  const texto = useTextos();
  const { galeria, promociones, equipo, preguntas, recargarTodo } = useContenidoSalon();
  const inicio = configuracion.contenido.inicio;
  // Sin red se usa el texto del catálogo (Admin > Textos); con otro error, el de mensajeParaClienta.
  const mensajeSeccion = (lista: Pick<ListaContenido<unknown>, 'tipoError' | 'mensajeError'>): string | null =>
    lista.tipoError === 'sinConexion' ? texto('inicio.contenido.errorTexto') : lista.mensajeError;

  const fotos = useMemo(() => fotosDeGaleria(galeria.datos), [galeria.datos]);
  const listaPromociones = useMemo(
    () => promociones.datos.map((promocion) => promocionInicio(promocion, texto)),
    [promociones.datos, texto],
  );

  const refrescar = useCallback(
    () => Promise.all([refrescarConfiguracion(), recargarTodo()]).then(() => undefined),
    [refrescarConfiguracion, recargarTodo],
  );

  return {
    nombreSalon: configuracion.salon.nombre,
    destacado: partirDestacado(inicio.heroDestacado),
    productosDescripcion: oNulo(inicio.productosDescripcion),
    serviciosDescripcion: oNulo(inicio.serviciosDescripcion),
    galeria: {
      titulo: texto('inicio.galeria.titulo'),
      descripcion: oNulo(inicio.trabajoDescripcion),
      estado: galeria.estado,
      mensajeError: mensajeSeccion(galeria),
      datos: fotos,
      reintentar: galeria.reintentar,
      vaciaTitulo: texto('inicio.galeria.vaciaTitulo'),
      vaciaTexto: texto('inicio.galeria.vaciaTexto'),
      verServicio: texto('inicio.galeria.verServicio'),
    },
    promociones: {
      titulo: texto('inicio.promociones.titulo'),
      estado: promociones.estado,
      mensajeError: mensajeSeccion(promociones),
      datos: listaPromociones,
      reintentar: promociones.reintentar,
    },
    equipo: {
      titulo: texto('inicio.equipo.titulo'),
      estado: equipo.estado,
      mensajeError: mensajeSeccion(equipo),
      datos: equipo.datos,
      reintentar: equipo.reintentar,
    },
    preguntas: {
      titulo: texto('inicio.preguntas.titulo'),
      estado: preguntas.estado,
      mensajeError: mensajeSeccion(preguntas),
      datos: preguntas.datos,
      reintentar: preguntas.reintentar,
    },
    sobreNosotros: {
      titulo: texto('inicio.sobreNosotros.titulo'),
      parrafos: inicio.sobreNosotrosParrafos,
      imagen: oNulo(inicio.sobreNosotrosImagen),
      enlace: texto('inicio.sobreNosotros.enlace'),
    },
    cierre: { titulo: inicio.cierreTitulo, texto: oNulo(inicio.cierreTexto), boton: texto('inicio.cierre.boton') },
    error: { titulo: texto('inicio.contenido.errorTitulo'), texto: texto('inicio.contenido.errorTexto') },
    refrescar,
  };
}
