import { Circle, CircleAlert, CircleDot } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';
import { Input } from '@/shared/ui/Input';
import { cancelacion, espacio, fuente, icono, radio, tipo, toqueMinimo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { EnlacePolitica } from './EnlacePolitica';

type ClaveMotivo = 'planes' | 'emergencia' | 'salud' | 'horario' | 'otro';

const MOTIVOS: { clave: ClaveMotivo; etiqueta: string }[] = [
  { clave: 'planes', etiqueta: 'Cambio de planes' },
  { clave: 'emergencia', etiqueta: 'Emergencia personal' },
  { clave: 'salud', etiqueta: 'Problemas de salud' },
  { clave: 'horario', etiqueta: 'Conflicto de horario' },
  { clave: 'otro', etiqueta: 'Otro' },
];

interface HojaCancelarCitaProps {
  visible: boolean;
  onCerrar: () => void;
  /** Qué pasa con el anticipo si cancela y con reagendar (la regla de la cita). */
  aviso: string;
  /** Texto del enlace a la Política de anticipos y cancelación (con anticipo pagado), o undefined. */
  enlacePolitica?: string;
  onVerPolitica?: () => void;
  /** false mientras carga la política del anticipo pagado: el aviso final debe decir si se devuelve. */
  puedeConfirmar: boolean;
  /** "Prefiero reprogramar" solo fuera de las horas de aviso de la cita. */
  puedeReprogramar: boolean;
  cancelando: boolean;
  /** Mensaje para la clienta si la cancelación falló, o null. */
  error: string | null;
  /** Cancela con el motivo ya recortado. */
  onCancelar: (motivo: string) => void;
  /** Cierra la hoja y abre la reprogramación. */
  onReprogramar: () => void;
}

/**
 * Hoja para cancelar una cita: aviso del anticipo (y enlace a la política si está pagado), motivo y
 * confirmación en color de peligro.
 */
export function HojaCancelarCita({ visible, onCerrar, aviso, ...formulario }: HojaCancelarCitaProps) {
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo="¿Cancelar tu cita?" texto={aviso}>
      {/* El Modal desmonta su contenido al cerrarse: el motivo elegido empieza de cero cada vez. */}
      <Formulario {...formulario} />
    </Hoja>
  );
}

function Formulario({
  enlacePolitica,
  onVerPolitica,
  puedeConfirmar,
  puedeReprogramar,
  cancelando,
  error,
  onCancelar,
  onReprogramar,
}: Omit<HojaCancelarCitaProps, 'visible' | 'onCerrar' | 'aviso'>) {
  const { colores } = useTheme();
  const [motivo, setMotivo] = useState<ClaveMotivo | null>(null);
  const [otro, setOtro] = useState('');
  const campoOtro = useRef<TextInput>(null);

  // Al elegir "Otro" el foco pasa al campo para escribir el motivo.
  useEffect(() => {
    if (motivo === 'otro') {
      campoOtro.current?.focus();
    }
  }, [motivo]);

  const otroLimpio = otro.trim();
  const motivoFinal =
    motivo === 'otro' ? otroLimpio : (MOTIVOS.find((m) => m.clave === motivo)?.etiqueta ?? '');
  const valido = motivoFinal !== '';

  const confirmar = () => {
    // El botón ya se desactiva sin motivo o mientras carga la política; el viewmodel lo vuelve a revisar.
    if (valido && !cancelando) {
      onCancelar(motivoFinal);
    }
  };

  return (
    <ScrollView
      style={styles.desplazable}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      {enlacePolitica && onVerPolitica ? <EnlacePolitica texto={enlacePolitica} onPress={onVerPolitica} /> : null}

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Motivo de la cancelación"
        style={styles.motivos}
      >
        <Text style={[styles.pregunta, { color: colores.textoCuerpo }]}>¿Por qué cancelas?</Text>
        {MOTIVOS.map((opcion) => {
          const elegida = opcion.clave === motivo;
          const Icono = elegida ? CircleDot : Circle;
          return (
            <Pressable
              key={opcion.clave}
              accessibilityRole="radio"
              accessibilityLabel={opcion.etiqueta}
              accessibilityState={{ checked: elegida, disabled: cancelando }}
              disabled={cancelando}
              onPress={() => setMotivo(opcion.clave)}
              style={({ pressed }) => [
                styles.opcion,
                { backgroundColor: pressed ? colores.presionado : colores.transparente },
              ]}
            >
              <Icono
                color={elegida ? colores.foco : colores.campoBorde}
                size={icono.tamano}
                strokeWidth={icono.trazo}
              />
              <Text style={[styles.etiqueta, { color: colores.textoCuerpo }]}>{opcion.etiqueta}</Text>
            </Pressable>
          );
        })}
      </View>

      {motivo === 'otro' ? (
        <Input
          ref={campoOtro}
          etiqueta="Cuéntanos el motivo"
          valor={otro}
          onCambiar={setOtro}
          largoMaximo={cancelacion.largoMotivo}
          ayuda={`Hasta ${cancelacion.largoMotivo} caracteres.`}
        />
      ) : null}

      {/* Región en vivo siempre montada: TalkBack anuncia el error cuando aparece. */}
      <View collapsable={false} accessibilityLiveRegion="polite">
        {error ? (
          <View style={styles.error}>
            <View style={styles.iconoLinea}>
              <CircleAlert color={colores.peligro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
            </View>
            <Text style={[styles.textoError, { color: colores.peligro }]}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.acciones}>
        <Button
          titulo={cancelando ? 'Cancelando tu cita' : 'Cancelar cita'}
          variante="peligro"
          onPress={confirmar}
          deshabilitado={!valido || !puedeConfirmar}
          cargando={cancelando}
          accessibilityHint={valido ? undefined : 'Elige un motivo para poder cancelar'}
        />
        {puedeReprogramar ? (
          <Button
            titulo="Prefiero reprogramar"
            variante="secundario"
            onPress={onReprogramar}
            deshabilitado={cancelando}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Se encoge si el teclado deja poco espacio; si no, mide lo que su contenido.
  desplazable: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contenido: {
    gap: espacio.l,
  },
  motivos: {
    gap: espacio.xxs,
  },
  pregunta: {
    marginBottom: espacio.xs,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  opcion: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: espacio.s,
    borderRadius: radio.campo,
  },
  etiqueta: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.m,
  },
  iconoLinea: {
    // Centra el ícono con la primera línea del texto.
    paddingTop: (tipo.cuerpo.linea - icono.tamanoPequeno) / 2,
  },
  textoError: {
    flex: 1,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  acciones: {
    gap: espacio.m,
  },
});
