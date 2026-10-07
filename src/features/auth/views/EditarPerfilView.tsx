import { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { Skeleton } from '@/shared/ui/Skeleton';
import { esqueleto, espacio, fuente, pantalla, tipo, toqueMinimo, tracking } from '@/shared/ui/tokens';
import { useMovimientoReducido } from '@/shared/ui/useMovimientoReducido';
import { useTheme } from '@/shared/ui/useTheme';

import {
  Aviso,
  Casilla,
  OPCIONES_SI_NO,
  Opciones,
  TEXTO_CONSENTIMIENTO_SALUD,
  aSiNo,
  traerALaVista,
} from '../components/AuthContainer';
import { EncabezadoVolver } from '../components/EncabezadoVolver';
import { HojaConfirmacion } from '../components/HojaConfirmacion';
import { AYUDA_TELEFONO, TIPOS_CABELLO } from '../models/AuthModel';
import { useEditarPerfilViewModel, type CampoPerfil } from '../viewmodels/useEditarPerfilViewModel';

/** Editar perfil: "Tus datos" y "Tu cabello", con las reglas y los componentes del registro. */
export default function EditarPerfilView() {
  const { colores } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const reducido = useMovimientoReducido();
  const vm = useEditarPerfilViewModel();
  const { formulario: f, cambiar, salirDe, errores } = vm;
  const refScroll = useRef<ScrollView>(null);
  const refsTexto = useRef<Partial<Record<CampoPerfil, TextInput | null>>>({});
  const refsBloque = useRef<Partial<Record<CampoPerfil, View | null>>>({});
  const enfoqueAtendido = useRef(0);

  // Al guardar con errores, el foco va al primer campo con error.
  useEffect(() => {
    if (!vm.enfoque || vm.enfoque.vez === enfoqueAtendido.current) {
      return;
    }
    enfoqueAtendido.current = vm.enfoque.vez;
    const entrada = refsTexto.current[vm.enfoque.campo];
    if (entrada) {
      entrada.focus();
      return;
    }
    // Controles sin teclado (consentimiento, Sí/No): se desplaza hasta ellos.
    traerALaVista(refsBloque.current[vm.enfoque.campo], refScroll.current, !reducido);
  }, [vm.enfoque, reducido]);

  const texto = (campo: CampoPerfil) => (instancia: TextInput | null) => {
    refsTexto.current[campo] = instancia;
  };

  const bloque = (campo: CampoPerfil) => (instancia: View | null) => {
    refsBloque.current[campo] = instancia;
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.raiz, { backgroundColor: colores.fondo }]}>
      <EncabezadoVolver titulo="Editar perfil" onVolver={vm.volver} />
      {vm.estado === 'error' ? (
        <View style={styles.cuerpo}>
          <EmptyState
            titulo="No pudimos cargar tu perfil"
            mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
            accion={{ titulo: 'Reintentar', onPress: vm.reintentar }}
          />
        </View>
      ) : null}
      {vm.estado === 'cargando' ? (
        <View style={styles.cuerpo} accessible accessibilityLabel="Cargando tu perfil">
          <Skeleton estilo={styles.campoEsqueleto} />
          <Skeleton estilo={styles.campoEsqueleto} />
          <Skeleton estilo={styles.campoEsqueleto} />
        </View>
      ) : null}
      {vm.estado === 'listo' ? (
        <ScrollView
          ref={refScroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.cuerpo, { paddingBottom: bottom + espacio.x3 }]}
        >
          <Text accessibilityRole="header" style={[styles.seccion, { color: colores.texto }]}>
            Tus datos
          </Text>
          <Input
            ref={texto('nombre')}
            etiqueta="Nombre completo"
            tipo="nombre"
            valor={f.nombre}
            onCambiar={(t) => cambiar('nombre', t)}
            onSalir={() => salirDe('nombre')}
            error={errores.nombre}
          />
          <View accessible accessibilityLabel={`Correo electrónico: ${vm.correo}. El correo no se puede cambiar desde aquí.`}>
            <Text style={[styles.etiqueta, { color: colores.texto }]}>Correo electrónico</Text>
            <Text style={[styles.valor, { color: colores.texto }]}>{vm.correo}</Text>
            <Text style={[styles.nota, { color: colores.textoSuave }]}>
              El correo no se puede cambiar desde aquí.
            </Text>
          </View>
          <Input
            ref={texto('telefono')}
            etiqueta="Teléfono"
            tipo="telefono"
            valor={f.telefono}
            onCambiar={(t) => cambiar('telefono', t)}
            onSalir={() => salirDe('telefono')}
            ayuda={AYUDA_TELEFONO}
            error={errores.telefono}
          />
          <Input
            ref={texto('nacimiento')}
            etiqueta="Fecha de nacimiento"
            tipo="fecha"
            valor={f.nacimiento}
            onCambiar={(t) => cambiar('nacimiento', t)}
            onSalir={() => salirDe('nacimiento')}
            placeholder="DD/MM/AAAA"
            error={errores.nacimiento}
          />

          <Text accessibilityRole="header" style={[styles.seccion, { color: colores.texto }]}>
            Tu cabello
          </Text>
          <Opciones
            etiqueta="Tipo de cabello"
            opciones={TIPOS_CABELLO}
            valor={f.tipoCabello}
            onElegir={(v) => cambiar('tipoCabello', v)}
            error={null}
          />
          <Input
            etiqueta="Color natural"
            valor={f.colorNatural}
            onCambiar={(t) => cambiar('colorNatural', t)}
            placeholder="Ej. Castaño oscuro"
          />
          <Input
            etiqueta="Color actual"
            valor={f.colorActual}
            onCambiar={(t) => cambiar('colorActual', t)}
            placeholder="Ej. Rubio cenizo"
          />
          <Input
            etiqueta="Productos que usas"
            valor={f.productosUsados}
            onCambiar={(t) => cambiar('productosUsados', t)}
            placeholder="Ej. Shampoo sin sulfatos"
          />
          <Input
            ref={texto('alergias')}
            etiqueta="Alergias"
            tipo="sensible"
            valor={f.alergias}
            onCambiar={(t) => cambiar('alergias', t)}
            onSalir={() => salirDe('alergias')}
            error={errores.alergias}
          />
          {vm.pideConsentimiento ? (
            <View ref={bloque('consiente')}>
              <Casilla
                marcada={vm.consiente}
                onCambiar={vm.setConsiente}
                texto={TEXTO_CONSENTIMIENTO_SALUD}
                enlace={{ texto: 'Aviso de Privacidad', accion: 'Abrir el Aviso de Privacidad', onPress: vm.abrirAviso }}
                error={errores.consiente ?? null}
              />
            </View>
          ) : null}
          {/* La pregunta y su detalle van juntos: más cerca entre sí que del resto. */}
          <View style={styles.grupo}>
            <Opciones
              refContenedor={bloque('tratamientosQuimicos')}
              etiqueta="¿Has tenido tratamientos químicos?"
              opciones={OPCIONES_SI_NO}
              valor={aSiNo(f.tratamientosQuimicos)}
              onElegir={(v) => cambiar('tratamientosQuimicos', v === 'si')}
              error={errores.tratamientosQuimicos ?? null}
            />
            {f.tratamientosQuimicos ? (
              <Input
                ref={texto('tratamientos')}
                etiqueta="Especifica los tratamientos"
                valor={f.tratamientos}
                onCambiar={(t) => cambiar('tratamientos', t)}
                onSalir={() => salirDe('tratamientos')}
                placeholder="Ej. Alaciado con keratina"
                error={errores.tratamientos}
              />
            ) : null}
          </View>
          <Casilla
            marcada={f.recibePromociones}
            onCambiar={(v) => cambiar('recibePromociones', v)}
            texto="Deseo recibir promociones"
            error={null}
          />

          <Aviso tipo="error" texto={vm.errorGeneral} />
          <Button
            titulo={vm.guardando ? 'Guardando…' : 'Guardar cambios'}
            onPress={vm.guardar}
            cargando={vm.guardando}
          />
        </ScrollView>
      ) : null}

      <HojaConfirmacion
        visible={vm.confirmarSalida}
        titulo="¿Descartar los cambios?"
        texto="Lo que cambiaste no se guardará."
        accion="Descartar cambios"
        cancelar="Seguir editando"
        onConfirmar={vm.descartar}
        onCancelar={vm.seguirEditando}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cuerpo: {
    paddingHorizontal: pantalla.margen,
    gap: espacio.xl,
  },
  grupo: {
    gap: espacio.m,
  },
  seccion: {
    marginTop: espacio.s,
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  etiqueta: {
    marginBottom: espacio.s,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  valor: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nota: {
    marginTop: espacio.xs,
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  campoEsqueleto: {
    height: toqueMinimo,
    width: esqueleto.anchoMedio,
  },
});
