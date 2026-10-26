import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

import { useOfertaDatosSensibles } from '../viewmodels/useOfertaDatosSensibles';
import { HojaDatosSensibles } from './HojaDatosSensibles';

/**
 * Oferta al iniciar sesión (vista: solo pinta): hoja con la explicación, "Leer y autorizar" como
 * acción principal y "Ahora no"; la autorización abre la hoja del texto completo del backend cuando
 * la de la oferta terminó de irse. La raíz la monta una vez y la habilita cuando la intro de la
 * grieta ya terminó.
 */
export function OfertaDatosSensibles({ habilitada }: { habilitada: boolean }) {
  const vm = useOfertaDatosSensibles(habilitada);
  return (
    <>
      <Hoja
        visible={vm.visible}
        onCerrar={vm.ahoraNo}
        alCerrarse={vm.alCerrarseOferta}
        titulo={vm.titulo}
        texto={vm.texto}
      >
        <Button titulo={vm.textoLeer} onPress={vm.leer} />
        <Button titulo={vm.textoAhoraNo} variante="secundario" onPress={vm.ahoraNo} />
      </Hoja>
      <HojaDatosSensibles vm={vm.autorizacion} />
    </>
  );
}
