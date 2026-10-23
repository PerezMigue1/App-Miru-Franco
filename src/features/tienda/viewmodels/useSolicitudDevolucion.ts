import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import type { ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  listarDevolucionesPedido,
  type CausaDevolucion,
  type Devolucion,
  type TipoDevolucion,
} from '../models/devolucionesModel';
import type { Pedido } from '../models/pedidoModel';
import { textoPiezas } from '../models/productoModel';
import {
  admitePedidoCompleto,
  articulosLibres,
  faltanteSolicitud,
  LARGO_MOTIVO_DEVOLUCION,
  mensajeFaltante,
  mensajeRetirar,
  mensajeSolicitud,
  motivoErrorRetirar,
  motivoErrorSolicitud,
  opcionesDevolucion,
  requiereArticulo,
  retirarDevolucion,
  SOLICITUD_CON_SALON,
  solicitarDevolucion,
  solicitudRecienCreada,
  textoCausa,
  textoPoliticaDevolucion,
  textoTipoSolicitud,
  type MotivoErrorSolicitud,
} from '../models/solicitudDevolucionModel';
import type { AvisoPedido } from './detallePedido';

/** Una opción de la hoja (tipo, causa o artículo) con su título y su explicación. */
export interface OpcionSolicitud<T> {
  valor: T;
  titulo: string;
  descripcion: string;
}

export interface TextosSolicitud {
  boton: string;
  titulo: string;
  politica: string;
  tipoPregunta: string;
  causaPregunta: string;
  articuloPregunta: string;
  sellado: string;
  motivo: string;
  motivoAyuda: string;
  enviar: string;
  enviando: string;
  volver: string;
}

export interface TextosRetirar {
  boton: string;
  titulo: string;
  texto: string;
  confirmar: string;
  retirando: string;
  conservar: string;
}

export interface SolicitudDevolucionViewModel {
  /** El pedido admite una solicitud: se muestra el botón para pedirla. */
  disponible: boolean;
  hojaVisible: boolean;
  abrir: () => void;
  /** Cierra la hoja; mientras envía no hace nada para no perder el resultado. */
  cerrar: () => void;
  tipos: OpcionSolicitud<TipoDevolucion>[];
  tipo: TipoDevolucion | null;
  elegirTipo: (tipo: TipoDevolucion) => void;
  causas: OpcionSolicitud<CausaDevolucion>[];
  causa: CausaDevolucion | null;
  elegirCausa: (causa: CausaDevolucion) => void;
  /** Artículos libres del pedido; con una causa que no pide artículo, primero "Todo el pedido" (null). */
  articulos: OpcionSolicitud<number | null>[];
  articulo: number | null;
  elegirArticulo: (articulo: number | null) => void;
  /** La causa es "sellado y sin abrir": se pide confirmarlo. */
  pideSellado: boolean;
  sellado: boolean;
  cambiarSellado: (sellado: boolean) => void;
  motivo: string;
  cambiarMotivo: (motivo: string) => void;
  largoMotivo: number;
  enviando: boolean;
  /** Mensaje dentro de la hoja si falta algo o el salón no la aceptó, o null. */
  error: string | null;
  enviar: () => void;
  textos: TextosSolicitud;
  /** Id de la solicitud que se va a retirar (hoja de confirmación abierta), o null. */
  retiroPendiente: number | null;
  abrirRetiro: (id: number) => void;
  cerrarRetiro: () => void;
  confirmarRetiro: () => void;
  retirando: boolean;
  errorRetiro: string | null;
  textosRetirar: TextosRetirar;
}

interface EntradaSolicitud {
  pedido: Pedido | null;
  devoluciones: readonly Devolucion[];
  config: ConfiguracionPublica;
  /** Aviso en la pantalla del detalle (la hoja ya se cerró). */
  avisar: (aviso: AvisoPedido) => void;
  /** Pone en la lista la solicitud recién registrada y vuelve a leer la sección en silencio. */
  agregarDevolucion: (devolucion: Devolucion) => void;
  /** Marca como retirada una solicitud y vuelve a leer la sección en silencio. */
  marcarRetirada: (id: number) => void;
  /** Vuelve a leer la sección en silencio (el servidor no aceptó el cambio o ya cambió). */
  recargarDevoluciones: () => void;
}

/** Sin respuesta del servidor (red o un 5xx que pudo cortar la respuesta después de guardar). */
function sinRespuesta(error: unknown): boolean {
  return esErrorDeRed(error) || (error instanceof ApiError && (error.status === 0 || error.status >= 500));
}

/** Estos 409 y 404 cierran la hoja: la solicitud ya no tiene arreglo desde aquí. */
const SOLICITUD_EN_PANTALLA: readonly MotivoErrorSolicitud[] = ['yaActiva', 'noEncontrado', ...SOLICITUD_CON_SALON];

/**
 * Pedir una solicitud de cambio o reembolso y retirar una pendiente desde el detalle del pedido
 * (GP-07.5), como la página de devoluciones de la web. Lo compone useDetallePedidoViewModel: este
 * hook solo lleva la hoja, lo elegido y los envíos; la lista de devoluciones vive en el detalle.
 */
export function useSolicitudDevolucion({
  pedido,
  devoluciones,
  config,
  avisar,
  agregarDevolucion,
  marcarRetirada,
  recargarDevoluciones,
}: EntradaSolicitud): SolicitudDevolucionViewModel {
  const candado = useCandado();
  const [hojaVisible, setHojaVisible] = useState(false);
  const [tipo, setTipo] = useState<TipoDevolucion | null>(null);
  const [causa, setCausa] = useState<CausaDevolucion | null>(null);
  const [articulo, setArticulo] = useState<number | null>(null);
  const [sellado, setSellado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiroPendiente, setRetiroPendiente] = useState<number | null>(null);
  const [retirando, setRetirando] = useState(false);
  const [errorRetiro, setErrorRetiro] = useState<string | null>(null);
  const montada = useRef(true);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  const opciones = useMemo(() => (pedido ? opcionesDevolucion(pedido, devoluciones) : []), [pedido, devoluciones]);
  const causasDelTipo = opciones.find((opcion) => opcion.tipo === tipo)?.causas ?? [];
  const libres = useMemo(() => (pedido ? articulosLibres(pedido, devoluciones) : []), [pedido, devoluciones]);
  const obligatorio = tipo !== null && causa !== null && requiereArticulo(tipo, causa);

  /** Lo elegido por omisión para una causa: el único artículo libre si lo pide; si no, el pedido completo. */
  const articuloInicial = useCallback(
    (nuevoTipo: TipoDevolucion, nuevaCausa: CausaDevolucion) =>
      requiereArticulo(nuevoTipo, nuevaCausa) && libres.length === 1 ? libres[0] : null,
    [libres],
  );

  const elegirCausa = useCallback(
    (nueva: CausaDevolucion) => {
      if (enviando || tipo === null) {
        return;
      }
      setCausa(nueva);
      setSellado(false);
      setArticulo((actual) => (actual !== null && libres.includes(actual) ? actual : articuloInicial(tipo, nueva)));
      setError(null);
    },
    [enviando, tipo, libres, articuloInicial],
  );

  const elegirTipo = useCallback(
    (nuevo: TipoDevolucion) => {
      if (enviando) {
        return;
      }
      const primera = opciones.find((opcion) => opcion.tipo === nuevo)?.causas[0] ?? null;
      setTipo(nuevo);
      setCausa(primera);
      setSellado(false);
      setArticulo(primera === null ? null : articuloInicial(nuevo, primera));
      setError(null);
    },
    [enviando, opciones, articuloInicial],
  );

  const abrir = useCallback(() => {
    const [primera] = opciones;
    if (!primera) {
      return;
    }
    const primeraCausa = primera.causas[0];
    setTipo(primera.tipo);
    setCausa(primeraCausa);
    setArticulo(articuloInicial(primera.tipo, primeraCausa));
    setSellado(false);
    setMotivo('');
    setError(null);
    setHojaVisible(true);
  }, [opciones, articuloInicial]);

  const cerrar = useCallback(() => {
    if (!enviando) {
      setHojaVisible(false);
      setError(null);
    }
  }, [enviando]);

  const elegirArticulo = useCallback(
    (nuevo: number | null) => {
      if (!enviando) {
        setArticulo(nuevo);
        setError(null);
      }
    },
    [enviando],
  );

  const cambiarSellado = useCallback(
    (marcado: boolean) => {
      if (!enviando) {
        setSellado(marcado);
        setError(null);
      }
    },
    [enviando],
  );

  const cambiarMotivo = useCallback(
    (texto: string) => {
      if (!enviando) {
        setMotivo(texto.slice(0, LARGO_MOTIVO_DEVOLUCION));
      }
    },
    [enviando],
  );

  /** Registrada (también la que apareció al releer tras un error de red): cierra, avisa y la pone en la lista. */
  const registrada = useCallback(
    (devolucion: Devolucion) => {
      setHojaVisible(false);
      setMotivo('');
      agregarDevolucion(devolucion);
      avisar({ tipo: 'exito', texto: obtenerTexto('devoluciones.toastRegistrada', {}, config) });
    },
    [agregarDevolucion, avisar, config],
  );

  /** Tras un error de red, busca la solicitud por si el servidor sí la guardó. Nunca lanza. */
  const buscarTrasFallo = useCallback(
    async (pedidoId: number, elegida: Parameters<typeof solicitudRecienCreada>[1], desdeMs: number) => {
      try {
        return solicitudRecienCreada(await listarDevolucionesPedido(pedidoId), elegida, desdeMs);
      } catch {
        return null;
      }
    },
    [],
  );

  const atenderErrorSolicitud = useCallback(
    (fallo: unknown, actual: Pedido) => {
      const mensaje = mensajeSolicitud(fallo, actual, config);
      const motivoError = motivoErrorSolicitud(fallo);
      if (motivoError !== null && SOLICITUD_EN_PANTALLA.includes(motivoError)) {
        setHojaVisible(false);
        avisar({ tipo: 'info', texto: mensaje, llamarSalon: SOLICITUD_CON_SALON.includes(motivoError) });
        recargarDevoluciones();
        return;
      }
      setError(mensaje);
    },
    [avisar, config, recargarDevoluciones],
  );

  const enviar = useCallback(() => {
    const actual = pedido;
    if (!actual || tipo === null || causa === null) {
      return;
    }
    const elegida = { tipo, causa, pedidoItemId: articulo, sellado };
    const faltante = faltanteSolicitud(elegida);
    if (faltante) {
      setError(mensajeFaltante(faltante, config));
      return;
    }
    const detalle = motivo;
    candado(async () => {
      setEnviando(true);
      setError(null);
      const inicio = Date.now();
      try {
        const nueva = await solicitarDevolucion({ pedidoId: actual.id, ...elegida, motivo: detalle });
        if (montada.current) {
          registrada(nueva);
        }
      } catch (fallo) {
        // Sin respuesta, la solicitud pudo quedar guardada: antes de dejar reintentar (y duplicarla) se busca.
        const encontrada = sinRespuesta(fallo) ? await buscarTrasFallo(actual.id, elegida, inicio) : null;
        if (montada.current) {
          if (encontrada) {
            registrada(encontrada);
          } else {
            atenderErrorSolicitud(fallo, actual);
          }
        }
      } finally {
        if (montada.current) {
          setEnviando(false);
        }
      }
    });
  }, [pedido, tipo, causa, articulo, sellado, motivo, config, candado, registrada, buscarTrasFallo, atenderErrorSolicitud]);

  // ── Retirar ────────────────────────────────────────────────────────────────────────────

  const abrirRetiro = useCallback((id: number) => {
    setErrorRetiro(null);
    setRetiroPendiente(id);
  }, []);

  const cerrarRetiro = useCallback(() => {
    if (!retirando) {
      setRetiroPendiente(null);
      setErrorRetiro(null);
    }
  }, [retirando]);

  /** Tras un error de red, lee la sección: si la solicitud ya quedó retirada, se muestra así. Nunca lanza. */
  const yaRetirada = useCallback(async (pedidoId: number, id: number) => {
    try {
      const lista = await listarDevolucionesPedido(pedidoId);
      return lista.some((devolucion) => devolucion.id === id && devolucion.estado === 'cancelada');
    } catch {
      return false;
    }
  }, []);

  const retirada = useCallback(
    (id: number) => {
      setRetiroPendiente(null);
      marcarRetirada(id);
      avisar({ tipo: 'exito', texto: obtenerTexto('tienda.devoluciones.retirar.listo', {}, config) });
    },
    [marcarRetirada, avisar, config],
  );

  const confirmarRetiro = useCallback(() => {
    const id = retiroPendiente;
    const actual = pedido;
    if (id === null || !actual) {
      return;
    }
    candado(async () => {
      setRetirando(true);
      setErrorRetiro(null);
      try {
        await retirarDevolucion(id);
        if (montada.current) {
          retirada(id);
        }
      } catch (fallo) {
        const listo = sinRespuesta(fallo) && (await yaRetirada(actual.id, id));
        if (!montada.current) {
          return;
        }
        if (listo) {
          retirada(id);
        } else if (motivoErrorRetirar(fallo) === null) {
          // Sin conexión o un error del servidor: se queda en la hoja para intentarlo de nuevo.
          setErrorRetiro(mensajeRetirar(fallo, config));
        } else {
          // Ya no está pendiente (o no existe): se cierra, se avisa y se ve cómo quedó.
          setRetiroPendiente(null);
          avisar({ tipo: 'info', texto: mensajeRetirar(fallo, config) });
          recargarDevoluciones();
        }
      } finally {
        if (montada.current) {
          setRetirando(false);
        }
      }
    });
  }, [retiroPendiente, pedido, candado, retirada, yaRetirada, config, avisar, recargarDevoluciones]);

  // ── Lo que se muestra ──────────────────────────────────────────────────────────────────

  const texto = (clave: Parameters<typeof obtenerTexto>[0], contexto = {}) => obtenerTexto(clave, contexto, config);
  const opcionesArticulo: OpcionSolicitud<number | null>[] = [];
  if (!obligatorio && admitePedidoCompleto(devoluciones)) {
    opcionesArticulo.push({
      valor: null,
      titulo: texto('tienda.devoluciones.solicitar.pedidoCompleto'),
      descripcion: texto('tienda.devoluciones.solicitar.pedidoCompletoTexto'),
    });
  }
  for (const item of pedido?.items ?? []) {
    if (libres.includes(item.id)) {
      opcionesArticulo.push({
        valor: item.id,
        titulo: item.tamanio ? `${item.nombre} (${item.tamanio})` : item.nombre,
        descripcion: textoPiezas(item.cantidad),
      });
    }
  }

  return {
    disponible: opciones.length > 0,
    hojaVisible,
    abrir,
    cerrar,
    tipos: opciones.map((opcion) => ({ valor: opcion.tipo, ...textoTipoSolicitud(opcion.tipo, config) })),
    tipo,
    elegirTipo,
    causas: causasDelTipo.map((valor) => ({ valor, ...textoCausa(valor, config) })),
    causa,
    elegirCausa,
    articulos: opcionesArticulo,
    articulo,
    elegirArticulo,
    pideSellado: causa === 'sellado_sin_abrir',
    sellado,
    cambiarSellado,
    motivo,
    cambiarMotivo,
    largoMotivo: LARGO_MOTIVO_DEVOLUCION,
    enviando,
    error,
    enviar,
    textos: {
      boton: texto('tienda.devoluciones.solicitar.boton'),
      titulo: texto('tienda.devoluciones.solicitar.titulo', { pedido: pedido?.id }),
      politica: pedido ? textoPoliticaDevolucion(pedido, config) : '',
      tipoPregunta: texto('tienda.devoluciones.solicitar.tipoPregunta'),
      causaPregunta: texto('tienda.devoluciones.solicitar.causaPregunta'),
      articuloPregunta: texto(
        obligatorio ? 'tienda.devoluciones.solicitar.articuloPregunta' : 'tienda.devoluciones.solicitar.articuloOpcional',
      ),
      sellado: texto('tienda.devoluciones.solicitar.sellado'),
      motivo: texto('tienda.devoluciones.solicitar.motivo'),
      motivoAyuda: texto('tienda.devoluciones.solicitar.motivoAyuda'),
      enviar: texto('tienda.devoluciones.solicitar.enviar'),
      enviando: texto('tienda.devoluciones.solicitar.enviando'),
      volver: texto('tienda.devoluciones.solicitar.volver'),
    },
    retiroPendiente,
    abrirRetiro,
    cerrarRetiro,
    confirmarRetiro,
    retirando,
    errorRetiro,
    textosRetirar: {
      boton: texto('tienda.devoluciones.retirar.boton'),
      titulo: texto('tienda.devoluciones.retirar.titulo'),
      texto: texto('tienda.devoluciones.retirar.texto'),
      confirmar: texto('tienda.devoluciones.retirar.confirmar'),
      retirando: texto('tienda.devoluciones.retirar.retirando'),
      conservar: texto('tienda.devoluciones.retirar.conservar'),
    },
  };
}
