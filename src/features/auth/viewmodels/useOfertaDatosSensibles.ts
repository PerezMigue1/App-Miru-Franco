import { useEffect, useState } from 'react';

import { alCerrarSesion } from '@/shared/api/eventosSesion';
import { useTextos } from '@/shared/api/useTextos';

import { obtenerEstadoDatosSensibles } from '../models/datosSensibles';
import { marcarOfertaHecha, ofertaYaHecha, olvidarOferta } from '../models/ofertaDatosSensibles';
import { useAuth } from './useAuth';
import {
  useAutorizacionDatosSensibles,
  type AutorizacionDatosSensiblesViewModel,
} from './useAutorizacionDatosSensibles';
import { useFaseReaceptacion } from './useDocumentosPendientes';

/**
 * Clientas (por id) a las que ya se les consultó el estado en este inicio de sesión: la oferta sale a
 * lo más una vez por sesión, la acepte o no. Vive en memoria (Singleton de módulo) y, para que no
 * vuelva a salir al reabrir la app con la sesión guardada, también en una marca del teléfono
 * (ofertaDatosSensibles.ts). Las dos se olvidan al cerrar sesión por cualquier motivo.
 */
const consultadas = new Set<string>();

alCerrarSesion(() => {
  for (const id of consultadas) {
    void olvidarOferta(id);
  }
  consultadas.clear();
});

/** Solo para pruebas: olvida a quién ya se le ofreció. */
export function reiniciarOfertaDatosSensibles(): void {
  consultadas.clear();
}

export interface OfertaDatosSensiblesViewModel {
  /** La hoja de la oferta está a la vista. */
  visible: boolean;
  titulo: string;
  texto: string;
  textoLeer: string;
  textoAhoraNo: string;
  /**
   * Cierra la oferta; la autorización con el texto completo del backend se abre cuando la hoja de la
   * oferta terminó de irse (alCerrarse), para que las dos no se crucen.
   */
  leer: () => void;
  /** La hoja de la oferta terminó de cerrarse (Hoja alCerrarse). */
  alCerrarseOferta: () => void;
  /** "Ahora no": no vuelve a salir en esta sesión. */
  ahoraNo: () => void;
  autorizacion: AutorizacionDatosSensiblesViewModel;
}

/**
 * Oferta al iniciar sesión (Ronda 5): si la clienta tiene alergias guardadas que esperan su
 * autorización (GET /api/consentimientos/datos-sensibles con pendiente: true), le ofrece autorizarlas
 * una sola vez por inicio de sesión, con "Ahora no". Espera a que no queden documentos legales
 * pendientes (fase 'listo') y a que la raíz la habilite (la intro ya terminó). Si la consulta falla,
 * no muestra nada ni bloquea; se vuelve a intentar en el siguiente arranque o inicio de sesión.
 */
export function useOfertaDatosSensibles(habilitada: boolean): OfertaDatosSensiblesViewModel {
  const texto = useTextos();
  const { estado, usuario } = useAuth();
  const fase = useFaseReaceptacion();
  const id = estado === 'autenticado' ? (usuario?.id ?? null) : null;
  const lista = habilitada && fase === 'listo' && id !== null;
  // Id de la clienta a la que se le está ofreciendo (si cambia la sesión, la oferta ya no aplica).
  const [ofertaPara, setOfertaPara] = useState<string | null>(null);
  // Id de la clienta que tocó "Leer y autorizar": su texto se abre al terminar de irse la oferta.
  const [textoPara, setTextoPara] = useState<string | null>(null);
  // Si la sesión cambia o se cierra mientras la oferta se va, el texto ya no se abre (aunque la misma
  // clienta vuelva a entrar antes de que termine la salida).
  if (textoPara !== null && textoPara !== id) {
    setTextoPara(null);
  }

  useEffect(() => {
    if (!lista || id === null || consultadas.has(id)) {
      return undefined;
    }
    let vigente = true;
    ofertaYaHecha(id)
      .then(async (yaHecha) => {
        if (!vigente || consultadas.has(id)) {
          return;
        }
        if (yaHecha) {
          // Ya se ofreció en este inicio de sesión (la app se reabrió con la sesión guardada).
          consultadas.add(id);
          return;
        }
        const estadoSensibles = await obtenerEstadoDatosSensibles();
        if (!vigente || consultadas.has(id)) {
          return;
        }
        consultadas.add(id);
        void marcarOfertaHecha(id);
        if (estadoSensibles.pendiente) {
          setOfertaPara(id);
        }
      })
      .catch(() => {
        // Sin red, 429 o 5xx: no se ofrece nada y no se bloquea; se vuelve a intentar en el siguiente
        // arranque o inicio de sesión.
      });
    return () => {
      vigente = false;
    };
  }, [lista, id]);

  const autorizacion = useAutorizacionDatosSensibles({
    ruta: '/inicio',
    registrarEnServidor: true,
    onAutorizada: () => setOfertaPara(null),
  });

  // Si la sesión cambia o se cierra con la hoja abierta, se cierra sin autorizar.
  const { visible: hojaAbierta, descartar: descartarHoja } = autorizacion;
  useEffect(() => {
    if (hojaAbierta && (ofertaPara === null || ofertaPara !== id)) {
      descartarHoja();
    }
  }, [hojaAbierta, ofertaPara, id, descartarHoja]);

  // Solo se toca con la oferta a la vista (mientras sale no recibe toques).
  const leer = () => setTextoPara(id);

  const alCerrarseOferta = () => {
    if (textoPara === null) {
      // Se cerró con "Ahora no", el velo, Atrás o porque cambió la sesión: no se abre nada.
      return;
    }
    setTextoPara(null);
    if (lista && textoPara === id && ofertaPara === id) {
      autorizacion.abrir();
    }
  };

  return {
    visible: lista && ofertaPara === id && textoPara === null && !hojaAbierta,
    titulo: texto('datosSensibles.app.ofertaTitulo'),
    texto: texto('datosSensibles.app.ofertaTexto'),
    textoLeer: texto('datosSensibles.app.ofertaLeer'),
    textoAhoraNo: texto('datosSensibles.app.ahoraNo'),
    leer,
    alCerrarseOferta,
    ahoraNo: () => setOfertaPara(null),
    autorizacion: {
      ...autorizacion,
      // "Ahora no" en la hoja del texto también termina la oferta de esta sesión.
      cerrar: () => {
        if (autorizacion.enviando) {
          return;
        }
        autorizacion.cerrar();
        setOfertaPara(null);
      },
    },
  };
}
