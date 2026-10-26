import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';
import { fechaHoraLegible, fechaLargaLegible } from '@/shared/ui/fechasLegibles';
import { useCandado } from '@/shared/ui/useCandado';

import { leerMisDatos, oponerseAPromociones, resumirMisDatos, type PerfilMisDatos, type ResumenMisDatos } from '../models/arcoModel';
import { obtenerEstadoDatosSensibles } from '../models/datosSensibles';
import { invalidarPerfil } from '../models/perfilCompartido';
import {
  usePermisosPrivacidad,
  type AvisoPrivacidad,
  type ConfirmacionRetiro,
  type PermisosPrivacidadViewModel,
} from './usePermisosPrivacidad';
import { useSolicitudesArco, type SolicitudesArcoViewModel } from './useSolicitudesArco';

export type EstadoAcceso = 'oculto' | 'cargando' | 'listo' | 'error';
export type DerechoArco = 'acceso' | 'rectificacion' | 'cancelacion' | 'oposicion';

/** Una fila de "Mis derechos". */
export interface DerechoVista {
  derecho: DerechoArco;
  titulo: string;
  descripcion: string;
  deshabilitado: boolean;
  abrir: () => void;
}

export interface CampoMisDatos {
  clave: string;
  etiqueta: string;
  valor: string;
  /** "Etiqueta: valor", lo que TalkBack lee de corrido. */
  accessibilityLabel: string;
}

export interface ConteoMisDatos {
  clave: string;
  etiqueta: string;
  cantidad: number;
  accessibilityLabel: string;
}

/** Derecho de acceso: lo que devolvió GET /api/arco/mis-datos, ya resumido. */
export interface AccesoVista {
  estado: EstadoAcceso;
  textoCargando: string;
  error: string | null;
  textoReintentar: string;
  /** Tras un 429: el reintento espera los segundos del servidor. */
  reintentarDeshabilitado: boolean;
  reintentar: () => void;
  generado: string | null;
  tituloPerfil: string;
  campos: CampoMisDatos[];
  /** Hay alergias guardadas y ocultas (sin autorización vigente): el texto y el botón para autorizar. */
  alergiasOcultas: { texto: string; boton: string; autorizar: () => void } | null;
  tituloRegistros: string;
  conteos: ConteoMisDatos[];
  textoOcultar: string;
  ocultar: () => void;
}

export interface ConservaVista {
  titulo: string;
  intro: string;
  puntos: string[];
}

export interface MisDatosViewModel {
  titulo: string;
  subtitulo: string;
  volver: () => void;
  tituloDerechos: string;
  derechos: DerechoVista[];
  /** Resultado de la oposición (se anuncia). */
  avisoDerechos: AvisoPrivacidad | null;
  acceso: AccesoVista;
  /** Confirmación de la oposición a las promociones. */
  oposicion: ConfirmacionRetiro;
  solicitudes: SolicitudesArcoViewModel;
  permisos: PermisosPrivacidadViewModel;
  conserva: ConservaVista;
}

/** Primera letra en mayúscula (el tipo de cabello llega en minúsculas). */
const capital = (valor: string) => (valor ? `${valor.charAt(0).toUpperCase()}${valor.slice(1)}` : valor);

function tratamientosDe(texto: FuncionTexto, perfil: PerfilMisDatos): string {
  if (perfil.tratamientosQuimicos === null) {
    return '';
  }
  if (!perfil.tratamientosQuimicos) {
    return texto('privacidad.app.valor.no');
  }
  return perfil.tratamientos || texto('privacidad.app.valor.si');
}

/**
 * Campos del perfil para pintar. Las alergias solo aparecen con la autorización vigente: si se
 * retiró mientras la pantalla estaba abierta, se dejan de mostrar sin volver a pedir nada.
 */
function camposDe(texto: FuncionTexto, perfil: PerfilMisDatos, alergiasVisibles: boolean): CampoMisDatos[] {
  const sinDato = texto('privacidad.app.valor.sinDato');
  const campos: [string, string][] = [
    ['nombre', perfil.nombre],
    ['correo', perfil.email],
    ['telefono', perfil.telefono],
    ['nacimiento', perfil.fechaNacimiento ? fechaLargaLegible(perfil.fechaNacimiento) : ''],
    ['tipoCabello', capital(perfil.tipoCabello)],
    ['colorNatural', perfil.colorNatural],
    ['colorActual', perfil.colorActual],
    ['productos', perfil.productosUsados],
    ['tratamientos', tratamientosDe(texto, perfil)],
  ];
  if (alergiasVisibles && perfil.alergias !== null) {
    campos.push(['alergias', perfil.alergias]);
  }
  campos.push(
    ['promociones', texto(perfil.recibePromociones ? 'privacidad.app.valor.recibe' : 'privacidad.app.valor.noRecibe')],
    ['creada', perfil.creadoEn ? fechaLargaLegible(new Date(perfil.creadoEn)) : ''],
  );
  return campos.map(([clave, valor]) => {
    const etiqueta = texto(`privacidad.app.campo.${clave}`);
    const final = valor || sinDato;
    return { clave, etiqueta, valor: final, accessibilityLabel: `${etiqueta}: ${final}` };
  });
}

/** Pide los datos y el estado de la autorización a la vez; sin estado, las alergias no se guardan. */
async function cargarResumen(): Promise<ResumenMisDatos> {
  const [crudo, autorizadas] = await Promise.all([
    leerMisDatos(),
    obtenerEstadoDatosSensibles().then(
      (estado) => estado.autorizado,
      () => false,
    ),
  ]);
  return resumirMisDatos(crudo, autorizadas);
}

/**
 * Perfil > Mis datos y privacidad (GP-09): los derechos ARCO (acceso con GET /api/arco/mis-datos,
 * rectificación en Editar perfil, cancelación en Mi cuenta y oposición a las promociones), las
 * solicitudes ARCO y los permisos opcionales. Los permisos y las solicitudes se vuelven a leer al
 * regresar a la pantalla (por ejemplo, desde Editar perfil). Los errores se deciden por code y
 * estado; los 429 usan useEsperaLimite.
 */
export function useMisDatosViewModel(): MisDatosViewModel {
  const { back, push } = useRouter();
  const texto = useTextos();
  const esperaAcceso = useEsperaLimite();
  const esperaOposicion = useEsperaLimite();
  const candadoOposicion = useCandado();
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso>('oculto');
  const [resumen, setResumen] = useState<ResumenMisDatos | null>(null);
  const [errorAcceso, setErrorAcceso] = useState<string | null>(null);
  const [confirmandoOposicion, setConfirmandoOposicion] = useState(false);
  const [enviandoOposicion, setEnviandoOposicion] = useState(false);
  const [avisoDerechos, setAvisoDerechos] = useState<AvisoPrivacidad | null>(null);
  const { esperarSiLimite: esperarAcceso } = esperaAcceso;
  const turnoAcceso = useRef(0);
  const montado = useRef(true);
  const estadoAccesoRef = useRef(estadoAcceso);
  useEffect(() => {
    estadoAccesoRef.current = estadoAcceso;
  });

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      turnoAcceso.current++;
    };
  }, []);

  const cargarAcceso = useCallback(() => {
    const actual = ++turnoAcceso.current;
    setEstadoAcceso('cargando');
    setErrorAcceso(null);
    cargarResumen()
      .then((leido) => {
        if (turnoAcceso.current === actual) {
          setResumen(leido);
          setEstadoAcceso('listo');
        }
      })
      .catch((causa: unknown) => {
        if (turnoAcceso.current === actual) {
          esperarAcceso(causa);
          setResumen(null);
          setErrorAcceso(mensajeParaClienta(causa, { respaldo: texto('privacidad.app.acceso.error') }));
          setEstadoAcceso('error');
        }
      });
  }, [esperarAcceso, texto]);

  /** La autorización de salud cambió: al retirarla se borran las alergias; al darla, se vuelven a pedir. */
  const alCambiarSalud = useCallback(
    (autorizada: boolean) => {
      if (!autorizada) {
        setResumen((previo) => {
          if (!previo) {
            return previo;
          }
          const ocultas = previo.perfil.alergiasOcultas || Boolean(previo.perfil.alergias);
          return { ...previo, perfil: { ...previo.perfil, alergias: null, alergiasOcultas: ocultas } };
        });
        return;
      }
      if (estadoAccesoRef.current === 'listo') {
        cargarAcceso();
      }
    },
    [cargarAcceso],
  );

  const permisos = usePermisosPrivacidad(alCambiarSalud);
  const solicitudes = useSolicitudesArco();

  // Al entrar y al volver a la pantalla se lee el estado real de permisos y solicitudes.
  const { recargar: recargarPermisos } = permisos;
  const { recargar: recargarSolicitudes } = solicitudes;
  useFocusEffect(
    useCallback(() => {
      recargarPermisos();
      recargarSolicitudes();
    }, [recargarPermisos, recargarSolicitudes]),
  );

  const verMisDatos = () => {
    if (estadoAcceso === 'cargando' || esperaAcceso.activa) {
      return;
    }
    cargarAcceso();
  };

  const ocultar = () => {
    turnoAcceso.current++;
    setResumen(null);
    setEstadoAcceso('oculto');
  };

  const oponerse = async () => {
    setEnviandoOposicion(true);
    setAvisoDerechos(null);
    try {
      const solicitud = await oponerseAPromociones();
      invalidarPerfil();
      if (!montado.current) {
        return;
      }
      permisos.fijarPromociones(false);
      setResumen((previo) =>
        previo ? { ...previo, perfil: { ...previo.perfil, recibePromociones: false } } : previo,
      );
      setAvisoDerechos({ tono: 'exito', texto: texto('privacidad.app.oposicion.lista', { folio: solicitud.folio }) });
      recargarSolicitudes();
    } catch (causa) {
      if (montado.current) {
        esperaOposicion.esperarSiLimite(causa);
        setAvisoDerechos({
          tono: 'peligro',
          texto: mensajeParaClienta(causa, { respaldo: texto('privacidad.app.oposicion.error') }),
        });
      }
    } finally {
      if (montado.current) {
        setEnviandoOposicion(false);
      }
    }
  };

  const oposicionOcupada = enviandoOposicion || esperaOposicion.activa;

  const derecho = (
    clave: DerechoArco,
    abrir: () => void,
    descripcion = texto(`privacidad.app.${clave}.descripcion`),
    deshabilitado = false,
  ): DerechoVista => ({
    derecho: clave,
    titulo: texto(`privacidad.app.${clave}.titulo`),
    descripcion,
    deshabilitado,
    abrir,
  });

  const textoOposicion =
    esperaOposicion.texto ??
    (enviandoOposicion ? texto('privacidad.app.oposicion.enviando') : texto('privacidad.app.oposicion.descripcion'));
  const textoAcceso = esperaAcceso.texto ?? texto('privacidad.app.acceso.descripcion');
  const alergiasVisibles = permisos.saludAutorizada !== false;

  return {
    titulo: texto('privacidad.app.titulo'),
    subtitulo: texto('privacidad.app.subtitulo'),
    volver: back,
    tituloDerechos: texto('privacidad.app.derechos.titulo'),
    derechos: [
      derecho('acceso', verMisDatos, textoAcceso, estadoAcceso === 'cargando' || esperaAcceso.activa),
      derecho('rectificacion', () => push('/editar-perfil')),
      derecho('cancelacion', () => push('/mi-cuenta')),
      derecho(
        'oposicion',
        () => {
          if (!oposicionOcupada) {
            setConfirmandoOposicion(true);
          }
        },
        textoOposicion,
        oposicionOcupada,
      ),
    ],
    avisoDerechos,
    acceso: {
      estado: estadoAcceso,
      textoCargando: texto('privacidad.app.acceso.cargando'),
      error: errorAcceso,
      textoReintentar: esperaAcceso.texto ?? texto('privacidad.app.reintentar'),
      reintentarDeshabilitado: esperaAcceso.activa,
      reintentar: verMisDatos,
      generado: resumen?.generadoEn
        ? texto('privacidad.app.acceso.generado', { fecha: fechaHoraLegible(resumen.generadoEn) })
        : null,
      tituloPerfil: texto('privacidad.app.acceso.perfil'),
      campos: resumen ? camposDe(texto, resumen.perfil, alergiasVisibles) : [],
      alergiasOcultas:
        resumen?.perfil.alergiasOcultas === true
          ? {
              texto: texto('privacidad.app.alergias.ocultas'),
              boton: texto('privacidad.app.alergias.autorizar'),
              autorizar: permisos.hojaSalud.abrir,
            }
          : null,
      tituloRegistros: texto('privacidad.app.acceso.registros'),
      conteos: (resumen?.conteos ?? []).map(({ seccion, cantidad }) => {
        const etiqueta = texto(`privacidad.app.seccion.${seccion}`);
        return { clave: seccion, etiqueta, cantidad, accessibilityLabel: `${etiqueta}: ${cantidad}` };
      }),
      textoOcultar: texto('privacidad.app.acceso.ocultar'),
      ocultar,
    },
    oposicion: {
      visible: confirmandoOposicion,
      titulo: texto('privacidad.app.oposicion.confirmarTitulo'),
      texto: texto('privacidad.app.oposicion.confirmarTexto'),
      accion: texto('privacidad.app.oposicion.confirmar'),
      cancelar: texto('privacidad.app.cancelar'),
      confirmar: () => {
        setConfirmandoOposicion(false);
        if (!oposicionOcupada) {
          candadoOposicion(oponerse);
        }
      },
      cerrar: () => setConfirmandoOposicion(false),
    },
    solicitudes,
    permisos,
    conserva: {
      titulo: texto('eliminarCuenta.conserva.titulo'),
      intro: texto('eliminarCuenta.conserva.intro'),
      puntos: [
        texto('eliminarCuenta.conserva.fiscal'),
        texto('eliminarCuenta.conserva.historial'),
        texto('eliminarCuenta.conserva.constancias'),
      ],
    },
  };
}
