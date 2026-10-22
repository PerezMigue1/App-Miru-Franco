import { useLocalSearchParams, useRouter } from 'expo-router';

import { useDocumentoLegal } from '@/shared/api/useDocumentoLegal';
import { VisorDocumentoLegal } from '@/shared/ui/VisorDocumentoLegal';

/**
 * Visor de un documento legal (/legal/terminos, /legal/anticipos...): público, con o sin sesión. La
 * ruta une el hook del repositorio de documentos con la vista compartida.
 */
export default function DocumentoLegalRuta() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { back } = useRouter();
  const documento = useDocumentoLegal(slug);
  return <VisorDocumentoLegal {...documento} onVolver={back} />;
}
