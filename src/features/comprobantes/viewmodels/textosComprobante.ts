import { useMemo } from 'react';

import { useTextos } from '@/shared/api/useTextos';

/**
 * Textos fijos de la pantalla del comprobante (título, carga y estados), del catálogo con su respaldo
 * en la app. La vista no importa de shared/api: los toma de aquí. Los del ticket llegan ya armados en
 * el TicketVisible del viewmodel.
 */
export interface TextosComprobante {
  titulo: string;
  cargando: string;
  noEncontradoTitulo: string;
  noEncontradoTexto: string;
  enlaceInvalido: string;
  errorTitulo: string;
}

export function useTextosComprobante(): TextosComprobante {
  const texto = useTextos();
  return useMemo(
    () => ({
      titulo: texto('correos.comprobante.titulo'),
      cargando: texto('comprobante.app.cargando'),
      noEncontradoTitulo: texto('comprobante.app.noEncontradoTitulo'),
      noEncontradoTexto: texto('comprobante.app.noEncontradoTexto'),
      enlaceInvalido: texto('comprobante.app.enlaceInvalido'),
      errorTitulo: texto('comprobante.app.errorTitulo'),
    }),
    [texto],
  );
}
