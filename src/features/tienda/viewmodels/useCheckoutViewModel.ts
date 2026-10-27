import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { esErrorDeRed } from '@/features/auth/models/AuthModel';
import { enlaceTelefono } from '@/features/salon/models/salonModel';
import { ApiError } from '@/shared/api/apiClient';
import type { DatosTransferencia } from '@/shared/api/configuracionPublica';
import { obtenerDocumentoVigente, rutaVisorDocumento, type SlugDocumentoLegal } from '@/shared/api/documentosLegales';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useCandado } from '@/shared/ui/useCandado';

import {
  itemConProblema,
  obtenerCarritoRevisado,
  totalCarrito,
  vaciarCarrito,
  type ItemCarrito,
} from '../models/carritoModel';
import {
  avisoMetodo,
  botonFinal,
  CASILLAS_COMPRA,
  CASILLAS_COMPRA_INICIALES,
  casillasConDocumentoCambiado,
  ErrorConsentimientoCompra,
  erroresCasillasCompra,
  esVersionCambiadaCompra,
  etiquetasCasillas,
  METODO_PREFERIDO,
  mensajeConsentimientoCompra,
  metodosTienda,
  metodoVigente,
  notaOpciones,
  opcionesPago,
  plazosMetodo,
  registrarConsentimientosCompra,
  textoDocumentoActualizado,
  textoFaltanCasillas,
  textoMetodoCambiado,
  textoRecogesEn,
  textosCheckout,
  textosSinMetodos,
  type DocumentosVistos,
  type TextosCheckout,
  type EstadoCasillasCompra,
  type EtiquetaCasillaCompra,
  type IdCasillaCompra,
  type OpcionMetodo,
} from '../models/compraLegal';
import {
  buscarPedidoRecienCreado,
  crearPedido,
  esPiezasAgotadas,
  mensajeCrearPedido,
  mensajeRevisarMisPedidos,
  pideRevisarCarrito,
  type MetodoPago,
  type Pedido,
} from '../models/pedidoModel';

import { abrirEnlace, useDocumentoVisto } from './checkoutTienda';
import { avisarCambioCarrito, releerCarrito } from './usePiezasCarrito';

export type PasoCheckout = 1 | 2 | 3;
export type EstadoCheckout = 'cargando' | 'listo' | 'error';

/**
 * Nombres de los pasos, en orden, para el indicador (los mismos de la web). Van en dos renglones:
 * en uno solo los tres miden más que los 320dp de contenido de una pantalla de 360dp y el
 * indicador se saldría. TalkBack lee el salto de línea como un espacio.
 */
export const PASOS_CHECKOUT = ['Recoger en\nel salón', 'Forma de\npago', 'Revisa y\nconfirma'] as const;

/** Lo que pinta una casilla del último paso. */
export interface CasillaCheckout extends EtiquetaCasillaCompra {
  marcada: boolean;
  /** Falta marcarla o su documento cambió; null si no hay. */
  error: string | null;
}

export interface CheckoutViewModel {
  /** Con estado 'error': por qué no se cargó el carrito (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  estado: EstadoCheckout;
  recargar: () => void;
  items: ItemCarrito[];
  /** Total estimado en centavos (el final lo fija el servidor al crear el pedido). */
  total: number;
  paso: PasoCheckout;
  /** Formas de pago activas para la tienda, con su título y explicación del catálogo. */
  opciones: OpcionMetodo[];
  /** La forma de pago elegida (si se apagó, la otra activa); null si no hay ninguna activa. */
  metodo: MetodoPago | null;
  elegirMetodo: (metodo: MetodoPago) => void;
  /** "En los dos casos..." o "Recoges tu pedido en el salón.". */
  notaOpciones: string;
  /** Aviso de la forma de pago con el total; '' sin forma de pago. */
  aviso: string;
  /** Plazos de la forma de pago elegida (reglas de la tienda). */
  plazos: string[];
  /** La forma de pago que eligió la clienta se apagó y se cambió a la otra; null si no. */
  avisoMetodoCambiado: string | null;
  /** Sin formas de pago activas: qué hacer (llamar al salón); null si hay alguna. */
  sinMetodos: { titulo: string; texto: string } | null;
  /** Abre el teléfono con el número del salón (si hay uno completo). */
  llamarSalon: () => void;
  /** Títulos y leyendas fijas de los pasos, del catálogo. */
  textos: TextosCheckout;
  /** Datos de transferencia para pagar al recoger, solo si esa forma está elegida y la transferencia activa. */
  transferencia: DatosTransferencia | null;
  /** "Nombre, dirección, ciudad" del salón. */
  recogesEn: string;
  /** Texto del botón final ('' sin forma de pago); tras un 429, "Intenta de nuevo en N s" mientras dura la espera. */
  botonFinal: string;
  /** Tras un 429 al confirmar: el botón final queda deshabilitado hasta que pase la espera. */
  enEspera: boolean;
  /** Pasos 1 y 2: al siguiente (en el 2, solo con una forma de pago). */
  continuar: () => void;
  /** En el paso 2 no se avanza sin forma de pago. */
  puedeContinuar: boolean;
  casillas: CasillaCheckout[];
  /** Pide marcar las casillas, junto al botón final; null si no hace falta. */
  avisoCasillas: string | null;
  cambiarCasilla: (id: IdCasillaCompra, marcada: boolean) => void;
  /** Abre el documento de la casilla en el visor legal (el checkout se queda como está debajo). */
  abrirDocumento: (slug: SlugDocumentoLegal) => void;
  enviando: boolean;
  /** Mensaje propio del último intento de crear el pedido, o null. */
  errorEnvio: string | null;
  /** El error pide revisar el carrito (sin existencias, producto retirado o sin precio). */
  revisarCarrito: boolean;
  irAlCarrito: () => void;
  /**
   * No se sabe si el pedido se creó (se perdió la respuesta y no se pudo saber cuál es): confirmar
   * queda bloqueado y se pide revisar Mis pedidos antes de intentar de nuevo (nunca un pedido doble).
   */
  revisarMisPedidos: boolean;
  /** Botón de revisarMisPedidos ('' si no aplica). */
  textoVerMisPedidos: string;
  verMisPedidos: () => void;
  confirmar: () => void;
  /** Paso anterior; en el primero sale. No hace nada mientras se envía. */
  atras: () => void;
}

type ErroresCasillas = Partial<Record<IdCasillaCompra, string>>;

/** Documentos de las casillas que se precargan al abrir el checkout. */
const SLUGS_CASILLAS = CASILLAS_COMPRA.map((casilla) => casilla.slug);

/**
 * Finalizar la compra en tres pasos como la web: dónde se recoge, forma de pago y revisar y
 * confirmar (GP-06.4). Desde GP-07.5 las formas de pago, los plazos, los textos y los datos del salón
 * salen de la configuración pública, y confirmar exige las casillas de los Términos de venta y la
 * Política de reembolsos: primero registra las dos aceptaciones y solo si se guardaron crea el
 * pedido, quita del carrito lo enviado y pasa a la confirmación; con Mercado Pago, la confirmación
 * abre el pago (?pagar=1).
 */
export function useCheckoutViewModel(): CheckoutViewModel {
  const router = useRouter();
  const candado = useCandado();
  const { configuracion } = useConfiguracionPublica();
  // Un 429 al crear el pedido (o al registrar sus casillas) deja el botón final en espera.
  const { activa: enEspera, texto: textoEspera, esperarSiLimite } = useEsperaLimite();

  const [estado, setEstado] = useState<EstadoCheckout>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [paso, setPaso] = useState<PasoCheckout>(1);
  // Por omisión, pagar al recoger (como la web); si está apagado, la otra forma activa.
  const [elegido, setElegido] = useState<MetodoPago>(METODO_PREFERIDO);
  const [eligioClienta, setEligioClienta] = useState(false);
  const [casillas, setCasillas] = useState<EstadoCasillasCompra>(CASILLAS_COMPRA_INICIALES);
  const [erroresCasillas, setErroresCasillas] = useState<ErroresCasillas>({});
  const [faltanCasillas, setFaltanCasillas] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [revisarCarrito, setRevisarCarrito] = useState(false);
  const [revisarMisPedidos, setRevisarMisPedidos] = useState(false);

  const solicitud = useRef(0);
  const montada = useRef(true);

  const metodos = metodosTienda(configuracion);
  const metodo = metodoVigente(elegido, metodos);

  // Si con la casilla marcada su documento cambia de versión, se desmarca: lo aceptado ya no es lo vigente.
  const desmarcarPorCambio = useCallback(
    (id: IdCasillaCompra) => {
      setCasillas((previas) => ({ ...previas, [id]: false }));
      setErroresCasillas((previos) => ({ ...previos, [id]: textoDocumentoActualizado(configuracion) }));
    },
    [configuracion],
  );
  const alCambiarTerminos = useCallback(() => desmarcarPorCambio('terminosVenta'), [desmarcarPorCambio]);
  const alCambiarReembolsos = useCallback(() => desmarcarPorCambio('reembolsos'), [desmarcarPorCambio]);
  const terminosVisto = useDocumentoVisto('terminos', casillas.terminosVenta, alCambiarTerminos);
  const reembolsosVisto = useDocumentoVisto('reembolsos', casillas.reembolsos, alCambiarReembolsos);

  useEffect(() => {
    // Precarga los dos documentos para que su versión esté lista al aceptar; nunca rechaza.
    for (const slug of SLUGS_CASILLAS) {
      void obtenerDocumentoVigente(slug);
    }
  }, []);

  const irAlCarrito = useCallback(() => {
    // El checkout se abre desde la pestaña Carrito: back() regresa a ella. Sin nada debajo,
    // dismissTo abre las pestañas en el Carrito en lugar de apilar otra pantalla.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo('/carrito');
    }
  }, [router]);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    setEstado('cargando');
    // Revisado como en el carrito: si algo se dejó de vender, se quita y el carrito lo avisa.
    obtenerCarritoRevisado()
      .then(({ items: lista, retirados }) => {
        if (actual !== solicitud.current) {
          return;
        }
        // Vacío, con productos por ajustar o con algo que se dejó de vender: el carrito es donde se arregla.
        if (lista.length === 0 || retirados.length > 0 || lista.some(itemConProblema)) {
          irAlCarrito();
          return;
        }
        setItems(lista);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setErrorCarga(error);
        setEstado('error');
      });
  }, [irAlCarrito]);

  useEffect(() => {
    montada.current = true;
    recargar();
    return () => {
      montada.current = false;
      solicitud.current += 1;
    };
  }, [recargar]);

  /**
   * Tras un 409 de piezas agotadas se vuelve a leer el carrito en silencio (la misma lectura del
   * Carrito): las piezas de la pestaña y el resumen quedan al día y el aviso del error se conserva.
   * Una lista vacía no reemplaza el resumen: el botón "Revisar carrito" lleva a arreglarlo.
   */
  const releerTrasPiezasAgotadas = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    void releerCarrito().then((lista) => {
      if (actual === solicitud.current && lista !== null && lista.length > 0) {
        setItems(lista);
      }
    });
  }, []);

  const puedeContinuar = paso !== 2 || metodo !== null;

  const continuar = useCallback(() => {
    if (!puedeContinuar) {
      return;
    }
    setPaso((actual) => (actual < 3 ? ((actual + 1) as PasoCheckout) : actual));
  }, [puedeContinuar]);

  const elegirMetodo = useCallback(
    (nuevo: MetodoPago) => {
      if (enviando) {
        return;
      }
      setElegido(nuevo);
      setEligioClienta(true);
    },
    [enviando],
  );

  const cambiarCasilla = useCallback(
    (id: IdCasillaCompra, marcada: boolean) => {
      if (enviando) {
        return;
      }
      setCasillas((previas) => ({ ...previas, [id]: marcada }));
      if (marcada) {
        setErroresCasillas((previos) => ({ ...previos, [id]: undefined }));
      }
    },
    [enviando],
  );

  const abrirDocumento = useCallback(
    (slug: SlugDocumentoLegal) => {
      // push: el visor se apila encima y al volver el checkout sigue en el mismo paso y estado.
      router.push(rutaVisorDocumento(slug));
    },
    [router],
  );

  const atras = useCallback(() => {
    if (enviando) {
      return;
    }
    if (paso > 1) {
      setErrorEnvio(null);
      setRevisarCarrito(false);
      setPaso((paso - 1) as PasoCheckout);
    } else {
      irAlCarrito();
    }
  }, [enviando, paso, irAlCarrito]);

  // El botón Atrás de Android regresa un paso; la pulsación se consume siempre (también al enviar).
  const refAtras = useRef(atras);
  useEffect(() => {
    refAtras.current = atras;
  });
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refAtras.current();
        return true;
      });
      return () => suscripcion.remove();
    }, []),
  );

  /**
   * El consentimiento no se guardó: mensaje claro. Con una versión que ya no es la vigente (400
   * DOCUMENTO_NO_VIGENTE o DOCUMENTO_NO_COINCIDE) se vuelven a pedir los documentos a la red y solo se
   * desmarca la casilla del que cambió, con su aviso al lado; la forma de pago y lo demás se quedan
   * como estaban. Nunca se reintenta solo: la clienta revisa y confirma otra vez.
   */
  const mostrarFallaConsentimiento = useCallback(
    async (error: ErrorConsentimientoCompra, vistos: DocumentosVistos) => {
      setErrorEnvio(mensajeConsentimientoCompra(error, configuracion));
      if (!esVersionCambiadaCompra(error)) {
        return;
      }
      const cambiadas = await casillasConDocumentoCambiado(vistos);
      if (!montada.current) {
        return;
      }
      const aviso = textoDocumentoActualizado(configuracion);
      setCasillas((previas) => ({ ...previas, ...Object.fromEntries(cambiadas.map((id) => [id, false])) }));
      setErroresCasillas((previos) => ({ ...previos, ...Object.fromEntries(cambiadas.map((id) => [id, aviso])) }));
    },
    [configuracion],
  );

  const confirmar = useCallback(() => {
    // Durante la espera de un 429 tampoco se envía otra vez.
    if (items.length === 0 || metodo === null || revisarMisPedidos || enEspera) {
      return;
    }
    const faltan = erroresCasillasCompra(casillas, configuracion);
    if (Object.keys(faltan).length > 0) {
      // Sin las dos casillas no se envía nada: el error queda junto a cada una.
      setErroresCasillas(faltan);
      setFaltanCasillas(true);
      setErrorEnvio(null);
      return;
    }
    setFaltanCasillas(false);
    const enviados = items;
    const metodoElegido = metodo;
    const vistos = { terminosVenta: terminosVisto(), reembolsos: reembolsosVisto() };
    const lineas = enviados.map((item) => ({
      productoId: item.productoId,
      presentacionId: item.presentacionId,
      cantidad: item.cantidad,
    }));
    candado(async () => {
      setEnviando(true);
      setErrorEnvio(null);
      setRevisarCarrito(false);
      try {
        // Primero las aceptaciones: si no se guardan, el pedido no se crea (nunca sin consentimiento).
        await registrarConsentimientosCompra(vistos);
      } catch (error) {
        if (montada.current) {
          // registrarConsentimientosCompra solo lanza ErrorConsentimientoCompra.
          const falla = error as ErrorConsentimientoCompra;
          // Un 429 al registrar las casillas: el message del backend y la espera.
          if (esperarSiLimite(falla.causa)) {
            setErrorEnvio(mensajeParaClienta(falla.causa));
          } else {
            // Las casillas siguen bloqueadas (enviando) hasta saber qué documento cambió.
            await mostrarFallaConsentimiento(falla, vistos);
          }
          if (montada.current) {
            setEnviando(false);
          }
        }
        return;
      }
      const inicio = Date.now();
      try {
        let pedido: Pedido;
        try {
          pedido = await crearPedido(lineas, metodoElegido);
        } catch (error) {
          // Sin respuesta, el pedido pudo haberse creado igual: antes de dejar reintentar (y crear
          // otro con las existencias descontadas dos veces) se busca entre sus pedidos.
          // También con un 5xx: el proxy pudo cortar la respuesta después de guardar el pedido.
          // Y con una respuesta que no se pudo leer (ni ApiError ni sin red): el servidor respondió
          // bien, así que el pedido sí se creó aunque no se encuentre.
          const ilegible = !(error instanceof ApiError) && !esErrorDeRed(error);
          const sinRespuesta =
            ilegible || esErrorDeRed(error) || (error instanceof ApiError && error.status >= 500);
          if (!sinRespuesta) {
            throw error;
          }
          const busqueda = await buscarPedidoRecienCreado(lineas, metodoElegido, inicio);
          const sinSaber = busqueda.estado === 'ambiguo' || busqueda.estado === 'sinVerificar';
          if (sinSaber || (ilegible && busqueda.estado === 'ninguno')) {
            // No se sabe cuál es (o si se creó): no se deja reintentar a ciegas.
            if (montada.current) {
              setErrorEnvio(mensajeRevisarMisPedidos(configuracion));
              setRevisarMisPedidos(true);
              setEnviando(false);
            }
            return;
          }
          if (busqueda.estado === 'ninguno') {
            throw error;
          }
          pedido = busqueda.pedido;
        }
        // El backend no vacía el carrito: se quitan los ítems enviados (nunca lanza).
        await vaciarCarrito(enviados.map((item) => item.id));
        // El número de la pestaña Carrito se vuelve a leer: lo enviado ya no está.
        avisarCambioCarrito();
        if (!montada.current) {
          return;
        }
        const id = encodeURIComponent(String(pedido.id));
        // Con Mercado Pago, la confirmación abre el pago una sola vez: la lógica vive allá.
        router.replace(
          (metodoElegido === 'mercado_pago'
            ? `/pedido-confirmado/${id}?pagar=1`
            : `/pedido-confirmado/${id}`) as Href,
        );
        // enviando se queda en true: la pantalla se reemplaza sin parpadear el botón.
      } catch (error) {
        if (!montada.current) {
          return;
        }
        // Un 429 no es "sin respuesta": el servidor respondió y no creó el pedido. Queda en espera.
        esperarSiLimite(error);
        // El 409 de piezas agotadas muestra el texto del backend (dice qué producto) y relee el carrito.
        setErrorEnvio(mensajeCrearPedido(error));
        setRevisarCarrito(pideRevisarCarrito(error));
        setEnviando(false);
        if (esPiezasAgotadas(error)) {
          releerTrasPiezasAgotadas();
        }
      }
    });
  }, [
    items,
    metodo,
    revisarMisPedidos,
    enEspera,
    esperarSiLimite,
    casillas,
    configuracion,
    terminosVisto,
    reembolsosVisto,
    candado,
    mostrarFallaConsentimiento,
    releerTrasPiezasAgotadas,
    router,
  ]);

  const verMisPedidos = useCallback(() => {
    // Mis pedidos queda en lugar del checkout: atrás regresa al carrito, nunca a confirmar otra vez.
    router.replace('/mis-pedidos' as Href);
  }, [router]);

  const telefonoSalon = configuracion.salon.telefono;
  const llamarSalon = useCallback(() => abrirEnlace(enlaceTelefono(telefonoSalon)), [telefonoSalon]);

  const total = totalCarrito(items);
  const conTransferencia = metodo === 'pago_en_salon' && configuracion.reglas.pagos.metodosSalon.includes('transferencia');
  const marcadas = casillas.terminosVenta && casillas.reembolsos;

  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    estado,
    recargar,
    items,
    total,
    paso,
    opciones: opcionesPago(metodos, configuracion),
    metodo,
    elegirMetodo,
    notaOpciones: notaOpciones(metodos, configuracion),
    aviso: metodo ? avisoMetodo(metodo, total, configuracion) : '',
    plazos: metodo ? plazosMetodo(metodo, configuracion) : [],
    avisoMetodoCambiado: eligioClienta && metodo !== null && metodo !== elegido ? textoMetodoCambiado(configuracion) : null,
    sinMetodos: metodo ? null : textosSinMetodos(configuracion),
    llamarSalon,
    textos: textosCheckout(configuracion),
    transferencia: conTransferencia ? configuracion.reglas.pagos.transferencia : null,
    recogesEn: textoRecogesEn(configuracion),
    botonFinal: textoEspera ?? (metodo ? botonFinal(metodo, configuracion) : ''),
    enEspera,
    continuar,
    puedeContinuar,
    casillas: etiquetasCasillas(configuracion).map((etiqueta) => ({
      ...etiqueta,
      marcada: casillas[etiqueta.id],
      error: erroresCasillas[etiqueta.id] ?? null,
    })),
    avisoCasillas: faltanCasillas && !marcadas ? textoFaltanCasillas(configuracion) : null,
    cambiarCasilla,
    abrirDocumento,
    enviando,
    errorEnvio,
    revisarCarrito,
    irAlCarrito,
    revisarMisPedidos,
    textoVerMisPedidos: revisarMisPedidos ? obtenerTexto('tienda.pedido.crear.verMisPedidos', {}, configuracion) : '',
    verMisPedidos,
    confirmar,
    atras,
  };
}

