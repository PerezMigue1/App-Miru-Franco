import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Monograma } from '@/shared/ui/Monograma';
import {
  acceso,
  borde,
  curva,
  duracion,
  espacio,
  fuente,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
  tracking,
} from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

export type VistaAcceso = 'acceso' | 'registro';

interface AuthContainerProps {
  vistaInicial: VistaAcceso;
  onEntrar: () => void;
}

const EASE_ENTRADA_SALIDA = Easing.bezier(...curva.entradaSalida);
const VISTAS: VistaAcceso[] = ['acceso', 'registro'];
const ETIQUETA_PESTANA: Record<VistaAcceso, string> = { acceso: 'Acceso', registro: 'Registro' };

/**
 * Acceso y registro (DESIGN.md, piezas de marca): panel carbón compacto con el monograma y
 * pestañas con indicador dorado. Los dos formularios quedan montados y el contenido se desliza
 * en horizontal 680 ms; cambiar de vista no navega ni recarga la pantalla. Con movimiento
 * reducido el cambio es inmediato y solo se funde la opacidad.
 */
export function AuthContainer({ vistaInicial, onEntrar }: AuthContainerProps) {
  const { colores } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { width: ancho } = useWindowDimensions();
  const reducido = useMovimientoReducido();
  const [vista, setVista] = useState<VistaAcceso>(vistaInicial);

  const indiceInicial = VISTAS.indexOf(vistaInicial);
  const progreso = useSharedValue(indiceInicial);
  const opacidadContenido = useSharedValue(1);

  const anchoPestana = (ancho - pantalla.margen * 2) / VISTAS.length;

  const estiloCarril = useAnimatedStyle(() => ({
    opacity: opacidadContenido.get(),
    transform: [{ translateX: -progreso.get() * ancho }],
  }));
  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: progreso.get() * anchoPestana }],
  }));

  const cambiarA = (destino: VistaAcceso) => {
    if (destino === vista) {
      return;
    }
    setVista(destino);
    const indice = VISTAS.indexOf(destino);
    if (reducido) {
      progreso.set(indice);
      opacidadContenido.set(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: duracion.pestana, easing: EASE_ENTRADA_SALIDA }),
        ),
      );
      return;
    }
    progreso.set(withTiming(indice, { duration: duracion.acceso, easing: EASE_ENTRADA_SALIDA }));
  };

  return (
    <View style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <StatusBar style="light" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottom + espacio.x3 }}
      >
        <View
          style={[
            styles.panel,
            { backgroundColor: colores.panel, borderBottomColor: colores.hairline },
            { paddingTop: top + acceso.rellenoPanel },
          ]}
        >
          <Monograma tamano="mediano" />
          <View accessible accessibilityRole="header" accessibilityLabel="Mirú Franco Beauty Salón">
            <View style={styles.marca}>
              <Text style={[styles.marcaMiru, { color: colores.textoSobrePanel }]}>Mirú</Text>
              <Text style={[styles.marcaFranco, { color: colores.oro }]}>Franco</Text>
            </View>
            <Text style={[styles.lema, { color: colores.oroTextoPequeno }]}>BEAUTY SALÓN</Text>
          </View>
        </View>

        <View
          accessibilityRole="tablist"
          style={[styles.pestanas, { borderBottomColor: colores.hairline }]}
        >
          {VISTAS.map((v) => {
            const activa = v === vista;
            return (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: activa }}
                onPress={() => cambiarA(v)}
                style={styles.pestana}
              >
                <Text
                  style={[
                    styles.textoPestana,
                    { color: activa ? colores.texto : colores.textoSuave },
                  ]}
                >
                  {ETIQUETA_PESTANA[v]}
                </Text>
              </Pressable>
            );
          })}
          <Animated.View
            style={[
              styles.indicador,
              { width: anchoPestana, backgroundColor: colores.oro },
              estiloIndicador,
            ]}
          />
        </View>

        <View style={styles.ventana}>
          <Animated.View style={[styles.carril, { width: ancho * VISTAS.length }, estiloCarril]}>
            <Panel ancho={ancho} activo={vista === 'acceso'}>
              <Encabezado
                titulo="Inicia sesión"
                texto="Consulta tus citas, tus pedidos y tus recordatorios."
              />
              <Campo etiqueta="Correo" id="acceso-correo" tipo="correo" />
              <Campo etiqueta="Contraseña" id="acceso-clave" tipo="claveActual" />
              <View style={styles.accion}>
                <Button titulo="Entrar" onPress={onEntrar} />
              </View>
            </Panel>
            <Panel ancho={ancho} activo={vista === 'registro'}>
              <Encabezado
                titulo="Crea tu cuenta"
                texto="Reserva tus citas y compra en la tienda del salón."
              />
              <Campo etiqueta="Nombre" id="registro-nombre" tipo="nombre" />
              <Campo etiqueta="Correo" id="registro-correo" tipo="correo" />
              <Campo etiqueta="Contraseña" id="registro-clave" tipo="claveNueva" />
              <View style={styles.accion}>
                {/* TODO(GP-05): conectar el registro real; por ahora el formulario es solo visual. */}
                <Button titulo="Crear cuenta" />
              </View>
            </Panel>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

function Panel({
  ancho,
  activo,
  children,
}: {
  ancho: number;
  activo: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[styles.formulario, { width: ancho }]}
      pointerEvents={activo ? 'auto' : 'none'}
      importantForAccessibility={activo ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!activo}
    >
      {children}
    </View>
  );
}

function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.encabezado}>
      <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
        {titulo}
      </Text>
      <Text style={[styles.texto, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

type TipoCampo = 'nombre' | 'correo' | 'claveActual' | 'claveNueva';

const AJUSTES_CAMPO: Record<TipoCampo, TextInputProps> = {
  nombre: { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' },
  correo: {
    autoComplete: 'email',
    textContentType: 'emailAddress',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
  },
  claveActual: {
    autoComplete: 'current-password',
    textContentType: 'password',
    secureTextEntry: true,
    autoCapitalize: 'none',
  },
  claveNueva: {
    autoComplete: 'new-password',
    textContentType: 'newPassword',
    secureTextEntry: true,
    autoCapitalize: 'none',
  },
};

/** Campo visual: etiqueta siempre visible y borde vino u oro al enfocar. Sin lógica (GP-05). */
function Campo({ etiqueta, id, tipo: tipoCampo }: { etiqueta: string; id: string; tipo: TipoCampo }) {
  const { colores } = useTheme();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={styles.campo}>
      <Text nativeID={id} style={[styles.etiqueta, { color: colores.texto }]}>
        {etiqueta}
      </Text>
      <TextInput
        {...AJUSTES_CAMPO[tipoCampo]}
        accessibilityLabelledBy={id}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        selectionColor={colores.foco}
        cursorColor={colores.foco}
        placeholderTextColor={colores.campoPlaceholder}
        style={[
          styles.entrada,
          {
            backgroundColor: colores.campoFondo,
            borderColor: enfocado ? colores.foco : colores.campoBorde,
            color: colores.campoTexto,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  panel: {
    alignItems: 'center',
    gap: espacio.m,
    paddingBottom: espacio.xxl,
    borderBottomWidth: borde.hairline,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: espacio.s,
  },
  marcaMiru: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
  marcaFranco: {
    fontFamily: fuente.manuscrita,
    fontSize: tipo.marcaManuscrita.tamano,
    lineHeight: tipo.marcaManuscrita.linea,
  },
  lema: {
    textAlign: 'center',
    fontFamily: fuente.textoMedio,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    letterSpacing: tracking.lema,
  },
  pestanas: {
    flexDirection: 'row',
    marginHorizontal: pantalla.margen,
    marginTop: espacio.l,
    borderBottomWidth: borde.hairline,
  },
  pestana: {
    flex: 1,
    minHeight: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPestana: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  indicador: {
    position: 'absolute',
    left: 0,
    bottom: -borde.hairline,
    height: borde.indicador,
  },
  ventana: {
    overflow: 'hidden',
  },
  carril: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  formulario: {
    paddingHorizontal: pantalla.margen,
    paddingTop: espacio.x3,
    gap: espacio.xl,
  },
  encabezado: {
    gap: espacio.xs,
  },
  titulo: {
    fontFamily: fuente.titulo,
    fontSize: tipo.titulo.tamano,
    lineHeight: tipo.titulo.linea,
    letterSpacing: tracking.titulo,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  campo: {
    gap: espacio.s,
  },
  etiqueta: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  entrada: {
    minHeight: toqueMinimo,
    paddingHorizontal: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.campo,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
  },
  accion: {
    marginTop: espacio.s,
  },
});
