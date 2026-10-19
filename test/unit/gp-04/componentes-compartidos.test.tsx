/// <reference types="jest" />

import { fireEvent, isHiddenFromAccessibility, render, screen, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { Bell, LogOut } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { sesionCabecera } from '@/features/auth/viewmodels/sesionCabecera';
import { AuthProvider } from '@/features/auth/viewmodels/useAuth';
import { SesionRequeridaProvider } from '@/features/auth/viewmodels/useRequiereSesion';
import { SesionCabeceraProvider } from '@/shared/ui/AccionesCabecera';
import { AparienciaProvider } from '@/shared/ui/apariencia';
import { Button } from '@/shared/ui/Button';
import { Contador, cifraContador } from '@/shared/ui/Contador';
import { EmptyState } from '@/shared/ui/EmptyState';
import {
  BotonFiltros,
  CasillaFiltro,
  OpcionesFiltro,
  PieFiltros,
  RangoFiltro,
  SeccionFiltro,
} from '@/shared/ui/Filtros';
import { Hoja } from '@/shared/ui/Hoja';
import { Input } from '@/shared/ui/Input';
import { ListRow } from '@/shared/ui/ListRow';
import { OtpInput } from '@/shared/ui/OtpInput';
import { PastillaFiltro } from '@/shared/ui/PastillaFiltro';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { SearchBar } from '@/shared/ui/SearchBar';
import { Skeleton } from '@/shared/ui/Skeleton';

import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { leerSecureStore } from '../../helpers/secureStore';

/**
 * Igual que en test/integration/gp-02/arranque-app.test.tsx: expo-router/testing-library carga
 * build/testing-library/mocks.js, que volvería a registrar el mock básico de Reanimated encima del
 * de test/setup.ts (sin cubicBezier, steps, linear ni useReducedMotion). Se sustituye por lo mismo
 * que hace, salvo lo de Reanimated.
 */
jest.mock('expo-router/build/testing-library/mocks', () => {
  require('react-native-gesture-handler/jestSetup');
  return {};
});

jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (ruta: string) => `appmirufranco://${ruta}`,
  resolveScheme: () => 'appmirufranco',
  addEventListener: () => ({ remove: () => undefined }),
}));

/**
 * Pruebas de comportamiento y accesibilidad de los componentes compartidos de src/shared/ui
 * (GP-04). No revisan estilos: roles, nombres accesibles, estados, textos y callbacks.
 *
 * useTheme no necesita AparienciaProvider (el contexto trae 'sistema' por omisión), así que los
 * componentes sueltos se montan sin él. Hoja usa useSafeAreaInsets: va dentro de un
 * SafeAreaProvider con medidas fijas.
 */

const MEDIDAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function ConAreaSegura({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={MEDIDAS}>{children}</SafeAreaProvider>;
}

/** Nodos host del árbol que cumplen la condición (para lo que no tiene rol ni texto accesible). */
function nodosHost(condicion: (nodo: TestInstance) => boolean): TestInstance[] {
  return screen.container.queryAll((nodo) => typeof nodo.type === 'string' && condicion(nodo));
}

describe('Button', () => {
  it('se anuncia como botón con su título y llama a onPress al tocarlo', async () => {
    const alTocar = jest.fn();
    await render(<Button titulo="Reservar cita" onPress={alTocar} />);

    const boton = screen.getByRole('button', { name: 'Reservar cita' });
    expect(boton).toBeEnabled();
    expect(boton).not.toBeBusy();

    await fireEvent.press(boton);
    expect(alTocar).toHaveBeenCalledTimes(1);
  });

  it('deshabilitado: se anuncia deshabilitado, no ocupado, y no responde al toque', async () => {
    const alTocar = jest.fn();
    await render(<Button titulo="Continuar" onPress={alTocar} deshabilitado />);

    const boton = screen.getByRole('button', { name: 'Continuar' });
    expect(boton).toBeDisabled();
    expect(boton).not.toBeBusy();

    await fireEvent.press(boton);
    expect(alTocar).not.toHaveBeenCalled();
  });

  it('cargando: se anuncia ocupado y deshabilitado y no responde al toque', async () => {
    const alTocar = jest.fn();
    await render(<Button titulo="Guardar" onPress={alTocar} cargando />);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toBeBusy();
    expect(boton).toBeDisabled();

    await fireEvent.press(boton);
    expect(alTocar).not.toHaveBeenCalled();
  });

  it('usa accessibilityLabel y accessibilityHint cuando se dan', async () => {
    await render(
      <Button
        titulo="Pagar"
        variante="contorno"
        accessibilityLabel="Pagar anticipo de 100 pesos"
        accessibilityHint="Abre Mercado Pago"
      />,
    );

    const boton = screen.getByRole('button', { name: 'Pagar anticipo de 100 pesos' });
    expect(boton).toHaveAccessibleName('Pagar anticipo de 100 pesos');
    expect(screen.getByHintText('Abre Mercado Pago')).toBe(boton);
    // El título se sigue pintando.
    expect(screen.getByText('Pagar')).toBeOnTheScreen();
  });
});

describe('Input', () => {
  it('la etiqueta visible nombra al campo y escribir llama a onCambiar', async () => {
    const onCambiar = jest.fn();
    await render(<Input etiqueta="Nombre completo" valor="" onCambiar={onCambiar} tipo="nombre" />);

    expect(screen.getByText('Nombre completo')).toBeOnTheScreen();
    const campo = screen.getByLabelText('Nombre completo');
    await fireEvent.changeText(campo, 'María López');
    expect(onCambiar).toHaveBeenCalledWith('María López');
  });

  it('la ayuda va bajo el campo y como pista; con error se ve el error y se oculta la ayuda', async () => {
    const props = {
      etiqueta: 'Correo electrónico',
      valor: 'maria@',
      onCambiar: jest.fn(),
      tipo: 'correo' as const,
      ayuda: 'Te enviaremos un código',
    };
    const { rerender } = await render(<Input {...props} />);

    expect(screen.getByText('Te enviaremos un código')).toBeOnTheScreen();
    expect(screen.getByHintText('Te enviaremos un código')).toBe(screen.getByLabelText('Correo electrónico'));

    await rerender(<Input {...props} error="Escribe un correo válido" />);

    expect(screen.getByText('Escribe un correo válido')).toBeOnTheScreen();
    expect(screen.queryByText('Te enviaremos un código')).not.toBeOnTheScreen();
  });

  it('el error manda sobre el estado del campo', async () => {
    await render(
      <Input
        etiqueta="Correo electrónico"
        valor="maria@correo.com"
        onCambiar={jest.fn()}
        error="Este correo ya tiene cuenta"
        estado={{ tipo: 'exito', texto: 'Correo disponible' }}
      />,
    );

    expect(screen.getByText('Este correo ya tiene cuenta')).toBeOnTheScreen();
    expect(screen.queryByText('Correo disponible')).not.toBeOnTheScreen();
  });

  it('muestra el estado del campo y su acción como enlace', async () => {
    const alIniciar = jest.fn();
    await render(
      <Input
        etiqueta="Correo electrónico"
        valor="maria@correo.com"
        onCambiar={jest.fn()}
        estado={{
          tipo: 'aviso',
          texto: 'Este correo ya tiene cuenta',
          accion: { texto: 'Iniciar sesión', onPress: alIniciar },
        }}
      />,
    );

    expect(screen.getByText('Este correo ya tiene cuenta')).toBeOnTheScreen();
    const enlace = screen.getByRole('link', { name: 'Iniciar sesión' });
    await fireEvent.press(enlace);
    expect(alIniciar).toHaveBeenCalledTimes(1);
  });

  it('contraseña: empieza oculta y el botón la muestra y la vuelve a ocultar', async () => {
    await render(<Input etiqueta="Contraseña" valor="secreta123" onCambiar={jest.fn()} tipo="claveActual" />);

    const campo = screen.getByLabelText('Contraseña');
    expect(campo).toHaveProp('secureTextEntry', true);

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveProp('secureTextEntry', false);
    expect(screen.queryByRole('button', { name: 'Mostrar contraseña' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveProp('secureTextEntry', true);
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeOnTheScreen();
  });

  it('un campo que no es contraseña no trae el botón de mostrar', async () => {
    await render(<Input etiqueta="Teléfono" valor="" onCambiar={jest.fn()} tipo="telefono" />);

    expect(screen.queryByRole('button', { name: 'Mostrar contraseña' })).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Teléfono')).toHaveProp('secureTextEntry', false);
  });

  it('fecha: da formato DD/MM/AAAA a lo escrito', async () => {
    const onCambiar = jest.fn();
    await render(<Input etiqueta="Fecha de nacimiento" valor="" onCambiar={onCambiar} tipo="fecha" />);

    await fireEvent.changeText(screen.getByLabelText('Fecha de nacimiento'), '15031990');
    expect(onCambiar).toHaveBeenLastCalledWith('15/03/1990');
  });

  it('teléfono: lo pegado con lada se limpia y lo escrito se queda en dígitos', async () => {
    const onCambiar = jest.fn();
    const { rerender } = await render(
      <Input etiqueta="Teléfono" valor="" onCambiar={onCambiar} tipo="telefono" />,
    );

    await fireEvent.changeText(screen.getByLabelText('Teléfono'), '+52 771 123 4567');
    expect(onCambiar).toHaveBeenLastCalledWith('7711234567');

    // Tecla por tecla (un dígito más que el valor actual) solo se quitan los que no son dígitos.
    await rerender(<Input etiqueta="Teléfono" valor="77" onCambiar={onCambiar} tipo="telefono" />);
    await fireEvent.changeText(screen.getByLabelText('Teléfono'), '77-1');
    expect(onCambiar).toHaveBeenLastCalledWith('771');
  });

  it('avisa al salir del campo y al enviar con el teclado', async () => {
    const onSalir = jest.fn();
    const alEnviar = jest.fn();
    await render(
      <Input
        etiqueta="Correo electrónico"
        valor="maria@correo.com"
        onCambiar={jest.fn()}
        onSalir={onSalir}
        alEnviar={alEnviar}
      />,
    );

    const campo = screen.getByLabelText('Correo electrónico');
    expect(campo).toHaveProp('returnKeyType', 'done');

    await fireEvent(campo, 'focus');
    await fireEvent(campo, 'blur');
    expect(onSalir).toHaveBeenCalledTimes(1);

    await fireEvent(campo, 'submitEditing');
    expect(alEnviar).toHaveBeenCalledTimes(1);
  });
});

describe('OtpInput', () => {
  it('la etiqueta nombra al campo, la pista dice el largo y escribir llama a onCambiar', async () => {
    const onCambiar = jest.fn();
    await render(<OtpInput etiqueta="Código de verificación" valor="" onCambiar={onCambiar} />);

    const campo = screen.getByLabelText('Código de verificación');
    expect(screen.getByHintText('6 dígitos')).toBe(campo);

    // Sin maxLength ni limpieza: lo pegado llega tal cual y el view model lo limpia.
    await fireEvent.changeText(campo, '123 456');
    expect(onCambiar).toHaveBeenCalledWith('123 456');
  });

  it('las casillas pintan los dígitos pero quedan ocultas al lector de pantalla', async () => {
    await render(<OtpInput etiqueta="Código" valor="123" onCambiar={jest.fn()} largo={4} />);

    expect(screen.getByHintText('4 dígitos')).toBeOnTheScreen();
    expect(screen.queryByText('1')).not.toBeOnTheScreen();
    const digito = screen.getByText('1', { includeHiddenElements: true });
    expect(isHiddenFromAccessibility(digito)).toBe(true);
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy();
  });

  it('con deletrear, la etiqueta lee el código dígito por dígito', async () => {
    const { rerender } = await render(
      <OtpInput etiqueta="Código de verificación" valor="" onCambiar={jest.fn()} deletrear />,
    );
    expect(screen.getByLabelText('Código de verificación')).toBeOnTheScreen();

    await rerender(<OtpInput etiqueta="Código de verificación" valor="123" onCambiar={jest.fn()} deletrear />);
    expect(screen.getByLabelText('Código de verificación: 1, 2, 3')).toBeOnTheScreen();
  });

  it('muestra el error bajo las casillas', async () => {
    await render(
      <OtpInput etiqueta="Código" valor="000000" onCambiar={jest.fn()} error="El código no es válido" />,
    );
    expect(screen.getByText('El código no es válido')).toBeOnTheScreen();
  });
});

describe('SearchBar', () => {
  it('es un botón con el texto como nombre, la pista dada y llama a onPress', async () => {
    const alTocar = jest.fn();
    await render(
      <SearchBar texto="Buscar servicios" onPress={alTocar} accessibilityHint="Abre la búsqueda" />,
    );

    const barra = screen.getByRole('button', { name: 'Buscar servicios' });
    expect(screen.getByHintText('Abre la búsqueda')).toBe(barra);
    expect(screen.getByText('Buscar servicios')).toBeOnTheScreen();

    await fireEvent.press(barra);
    expect(alTocar).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('pinta el título como encabezado y el mensaje, sin botón si no hay acción', async () => {
    await render(<EmptyState titulo="Aún no tienes citas" mensaje="Cuando reserves, aparecerán aquí." />);

    expect(screen.getByRole('header', { name: 'Aún no tienes citas' })).toBeOnTheScreen();
    expect(screen.getByText('Cuando reserves, aparecerán aquí.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    // El monograma es decorativo.
    expect(screen.queryByText('MF')).not.toBeOnTheScreen();
  });

  it('con acción, muestra su botón y lo llama al tocarlo', async () => {
    const reintentar = jest.fn();
    await render(
      <EmptyState
        titulo="No pudimos cargar"
        mensaje="Revisa tu conexión."
        accion={{ titulo: 'Reintentar', onPress: reintentar }}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });
});

describe('Skeleton', () => {
  it('se pinta y queda oculto al lector de pantalla', async () => {
    await render(<Skeleton estilo={{ width: 120, height: 16 }} />);

    const bloques = nodosHost((nodo) => nodo.props.importantForAccessibility === 'no-hide-descendants');
    expect(bloques).toHaveLength(1);
    expect(bloques[0].props.accessible).toBe(false);
    expect(isHiddenFromAccessibility(bloques[0])).toBe(true);
  });
});

describe('ListRow', () => {
  it('nombre accesible con título y detalle, pista y onPress', async () => {
    const alTocar = jest.fn();
    await render(
      <ListRow
        icono={Bell}
        titulo="Notificaciones"
        detalle="2 sin leer"
        onPress={alTocar}
        accessibilityHint="Abre tus avisos"
      />,
    );

    const fila = screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' });
    expect(fila).toBeEnabled();
    expect(screen.getByHintText('Abre tus avisos')).toBe(fila);
    expect(screen.getByText('Notificaciones')).toBeOnTheScreen();
    expect(screen.getByText('2 sin leer')).toBeOnTheScreen();

    await fireEvent.press(fila);
    expect(alTocar).toHaveBeenCalledTimes(1);
  });

  it('deshabilitada: se anuncia deshabilitada y no responde', async () => {
    const alTocar = jest.fn();
    await render(
      <ListRow icono={Bell} titulo="Métodos de pago" detalle="Disponible pronto" onPress={alTocar} deshabilitada />,
    );

    const fila = screen.getByRole('button', { name: 'Métodos de pago, Disponible pronto' });
    expect(fila).toBeDisabled();
    await fireEvent.press(fila);
    expect(alTocar).not.toHaveBeenCalled();
  });

  it('destructiva: sigue respondiendo al toque', async () => {
    const salir = jest.fn();
    await render(<ListRow icono={LogOut} titulo="Cerrar sesión" onPress={salir} destructiva />);

    const fila = screen.getByRole('button', { name: 'Cerrar sesión' });
    expect(fila).toBeEnabled();
    await fireEvent.press(fila);
    expect(salir).toHaveBeenCalledTimes(1);
  });
});

describe('Hoja', () => {
  it('cerrada no pinta nada', async () => {
    await render(
      <ConAreaSegura>
        <Hoja visible={false} onCerrar={jest.fn()} titulo="Cancelar cita">
          <Button titulo="Sí, cancelar" />
        </Hoja>
      </ConAreaSegura>,
    );

    expect(screen.queryByText('Cancelar cita')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sí, cancelar' })).not.toBeOnTheScreen();
  });

  it('abierta pinta título como encabezado, texto y acciones; se cierra al quitar visible', async () => {
    const confirmar = jest.fn();
    const elemento = (visible: boolean) => (
      <ConAreaSegura>
        <Hoja visible={visible} onCerrar={jest.fn()} titulo="Cancelar cita" texto="Esta acción no se puede deshacer.">
          <Button titulo="Sí, cancelar" variante="peligro" onPress={confirmar} />
        </Hoja>
      </ConAreaSegura>
    );
    const { rerender } = await render(elemento(true));

    expect(screen.getByRole('header', { name: 'Cancelar cita' })).toBeOnTheScreen();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(confirmar).toHaveBeenCalledTimes(1);

    // Con los mocks de Reanimated la salida termina al instante y el Modal se desmonta.
    await rerender(elemento(false));
    await waitFor(() => expect(screen.queryByText('Cancelar cita')).not.toBeOnTheScreen());
  });

  it('Atrás de Android y el velo llaman a onCerrar', async () => {
    const onCerrar = jest.fn();
    await render(
      <ConAreaSegura>
        <Hoja visible onCerrar={onCerrar} titulo="Filtros">
          <Text>Contenido</Text>
        </Hoja>
      </ConAreaSegura>,
    );

    const [modal] = nodosHost((nodo) => typeof nodo.props.onRequestClose === 'function');
    await fireEvent(modal, 'requestClose');
    expect(onCerrar).toHaveBeenCalledTimes(1);

    // El velo no es accesible (TalkBack usa Atrás), pero cierra al tocarlo.
    const [velo] = nodosHost(
      (nodo) => nodo.props.accessible === false && nodo.props.importantForAccessibility === 'no',
    );
    await fireEvent.press(velo);
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });
});

describe('PastillaFiltro', () => {
  it('se anuncia seleccionada o no y llama a onPress', async () => {
    const alTocar = jest.fn();
    const { rerender } = await render(<PastillaFiltro texto="Cabello" activo={false} onPress={alTocar} />);

    const pastilla = screen.getByRole('button', { name: 'Cabello' });
    expect(pastilla).not.toBeSelected();
    await fireEvent.press(pastilla);
    expect(alTocar).toHaveBeenCalledTimes(1);

    await rerender(<PastillaFiltro texto="Cabello" activo onPress={alTocar} />);
    expect(screen.getByRole('button', { name: 'Cabello' })).toBeSelected();
  });

  it('usa accessibilityLabel si se da', async () => {
    await render(
      <PastillaFiltro texto="Todas" activo onPress={jest.fn()} accessibilityLabel="Todas las categorías" />,
    );
    expect(screen.getByRole('button', { name: 'Todas las categorías' })).toBeSelected();
    expect(screen.getByText('Todas')).toBeOnTheScreen();
  });
});

describe('Filtros', () => {
  it('BotonFiltros: sin filtros activos no trae contador', async () => {
    const abrir = jest.fn();
    await render(<BotonFiltros activos={0} onPress={abrir} />);

    const boton = screen.getByRole('button', { name: 'Filtros' });
    expect(screen.getByHintText('Abre los filtros')).toBe(boton);
    expect(screen.queryByText('0', { includeHiddenElements: true })).not.toBeOnTheScreen();

    await fireEvent.press(boton);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('BotonFiltros: con filtros activos los dice en su nombre y pinta el contador oculto', async () => {
    await render(<BotonFiltros activos={3} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Filtros, 3 activos' })).toBeOnTheScreen();
    expect(screen.queryByText('3')).not.toBeOnTheScreen();
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy();
  });

  it('SeccionFiltro: título como encabezado y su contenido', async () => {
    await render(
      <SeccionFiltro titulo="Precio">
        <Text>Control del precio</Text>
      </SeccionFiltro>,
    );
    expect(screen.getByRole('header', { name: 'Precio' })).toBeOnTheScreen();
    expect(screen.getByText('Control del precio')).toBeOnTheScreen();
  });

  it('RangoFiltro: dos campos con su etiqueta que solo dejan pasar dígitos', async () => {
    const onMinimo = jest.fn();
    const onMaximo = jest.fn();
    await render(
      <RangoFiltro
        etiquetaMinimo="Precio mínimo"
        etiquetaMaximo="Precio máximo"
        minimo=""
        maximo=""
        onCambiarMinimo={onMinimo}
        onCambiarMaximo={onMaximo}
      />,
    );

    expect(screen.getByPlaceholderText('Mín')).toBe(screen.getByLabelText('Precio mínimo'));
    expect(screen.getByPlaceholderText('Máx')).toBe(screen.getByLabelText('Precio máximo'));

    await fireEvent.changeText(screen.getByLabelText('Precio mínimo'), '$1,500');
    expect(onMinimo).toHaveBeenCalledWith('1500');
    await fireEvent.changeText(screen.getByLabelText('Precio máximo'), '2 000');
    expect(onMaximo).toHaveBeenCalledWith('2000');
  });

  it('CasillaFiltro: casilla con su estado que pide el contrario al tocarla', async () => {
    const onCambiar = jest.fn();
    const { rerender } = await render(<CasillaFiltro texto="Solo disponibles" activo={false} onCambiar={onCambiar} />);

    const casilla = screen.getByRole('checkbox', { name: 'Solo disponibles' });
    expect(casilla).not.toBeChecked();
    await fireEvent.press(casilla);
    expect(onCambiar).toHaveBeenLastCalledWith(true);

    await rerender(<CasillaFiltro texto="Solo disponibles" activo onCambiar={onCambiar} />);
    expect(screen.getByRole('checkbox', { name: 'Solo disponibles' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Solo disponibles' }));
    expect(onCambiar).toHaveBeenLastCalledWith(false);
  });

  it('OpcionesFiltro: una pastilla por opción, marca las elegidas y alterna la tocada', async () => {
    const onAlternar = jest.fn();
    await render(
      <OpcionesFiltro opciones={['Loreal', 'Kerastase', 'Redken']} seleccionadas={['Kerastase']} onAlternar={onAlternar} />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Loreal' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Kerastase' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: 'Redken' }));
    expect(onAlternar).toHaveBeenCalledWith('Redken');
  });

  it('OpcionesFiltro: sin opciones muestra el texto de vacío, o nada si no lo hay', async () => {
    const { rerender } = await render(
      <OpcionesFiltro opciones={[]} seleccionadas={[]} onAlternar={jest.fn()} vacio="Sin marcas en catálogo" />,
    );
    expect(screen.getByText('Sin marcas en catálogo')).toBeOnTheScreen();

    await rerender(<OpcionesFiltro opciones={[]} seleccionadas={[]} onAlternar={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('PieFiltros: "Limpiar filtros" se deshabilita sin filtros y "Aplicar" siempre responde', async () => {
    const onLimpiar = jest.fn();
    const onAplicar = jest.fn();
    const { rerender } = await render(<PieFiltros activos={0} onLimpiar={onLimpiar} onAplicar={onAplicar} />);

    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(limpiar).toBeDisabled();
    await fireEvent.press(limpiar);
    expect(onLimpiar).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onAplicar).toHaveBeenCalledTimes(1);

    await rerender(<PieFiltros activos={2} onLimpiar={onLimpiar} onAplicar={onAplicar} />);
    const limpiarActivo = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(limpiarActivo).toBeEnabled();
    await fireEvent.press(limpiarActivo);
    expect(onLimpiar).toHaveBeenCalledTimes(1);
  });
});

describe('Contador', () => {
  it('cifraContador escribe el número y "N+" arriba del máximo (99 por omisión)', () => {
    expect(cifraContador(5)).toBe('5');
    expect(cifraContador(99)).toBe('99');
    expect(cifraContador(100)).toBe('99+');
    expect(cifraContador(10, 9)).toBe('9+');
  });

  it('con 0 o menos no pinta nada', async () => {
    const { rerender } = await render(<Contador valor={0} />);
    expect(screen.toJSON()).toBeNull();

    await rerender(<Contador valor={-2} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('pinta la cifra oculta al lector de pantalla (la lee el botón que lo contiene)', async () => {
    const { rerender } = await render(<Contador valor={7} />);

    expect(screen.queryByText('7')).not.toBeOnTheScreen();
    const cifra = screen.getByText('7', { includeHiddenElements: true });
    expect(isHiddenFromAccessibility(cifra)).toBe(true);

    await rerender(<Contador valor={150} />);
    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeTruthy();

    await rerender(<Contador valor={12} maximo={9} />);
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy();
  });
});

/**
 * ScreenHeader monta AccionesCabecera, que usa la sesión (useAuth, useRequiereSesion) y el router.
 * Se monta con renderRouter y un mapa de rutas en memoria; el layout de prueba envuelve el Stack con
 * los proveedores reales, todos en ProveedoresPrueba (un solo lugar para agregar otro proveedor).
 * Sin sesión: SecureStore llega vacío (test/setup.ts lo vacía antes de cada prueba).
 */
function ProveedoresPrueba({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SesionCabeceraProvider sesion={sesionCabecera}>
        <AparienciaProvider>
          <SesionRequeridaProvider>{children}</SesionRequeridaProvider>
        </AparienciaProvider>
      </SesionCabeceraProvider>
    </AuthProvider>
  );
}

function LayoutPrueba() {
  return (
    <ProveedoresPrueba>
      <Stack screenOptions={{ headerShown: false }} />
    </ProveedoresPrueba>
  );
}

/** Rutas en memoria: la pantalla inicial con la cabecera y destinos simples para revisar la navegación. */
function rutasCon(pantalla: () => ReactElement) {
  return {
    _layout: LayoutPrueba,
    index: pantalla,
    login: () => <Text>Pantalla de acceso</Text>,
    registro: () => <Text>Pantalla de registro</Text>,
    notificaciones: () => <Text>Pantalla de notificaciones</Text>,
    perfil: () => <Text>Pantalla de perfil</Text>,
  };
}

describe('ScreenHeader (sin sesión)', () => {
  afterEach(cerrarRouter);

  it('pinta el título como encabezado, el subtítulo, la campana e "Iniciar sesión"', async () => {
    expect(leerSecureStore()).toEqual({});
    const app = iniciarRouter(
      rutasCon(() => <ScreenHeader titulo="Mis citas" subtitulo="Tus próximas visitas al salón" />),
      { initialUrl: '/' },
    );
    await app;

    expect(await screen.findByRole('header', { name: 'Mis citas' })).toBeOnTheScreen();
    expect(screen.getByText('Tus próximas visitas al salón')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mirú Franco Beauty Salón')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });

  it('sin subtítulo solo pinta el título', async () => {
    const app = iniciarRouter(rutasCon(() => <ScreenHeader titulo="Tienda" />), { initialUrl: '/' });
    await app;

    expect(await screen.findByRole('header', { name: 'Tienda' })).toBeOnTheScreen();
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it('la acción extra va antes de la campana y de "Iniciar sesión"', async () => {
    const abrirCarrito = jest.fn();
    const app = iniciarRouter(
      rutasCon(() => (
        <ScreenHeader
          titulo="Tienda"
          accion={<Pressable accessibilityRole="button" accessibilityLabel="Abrir carrito" onPress={abrirCarrito} />}
        />
      )),
      { initialUrl: '/' },
    );
    await app;

    await screen.findByRole('header', { name: 'Tienda' });
    const nombres = screen.getAllByRole('button').map((boton) => boton.props.accessibilityLabel as string);
    expect(nombres).toEqual(['Abrir carrito', 'Abrir notificaciones', 'Iniciar sesión']);

    await fireEvent.press(screen.getByRole('button', { name: 'Abrir carrito' }));
    expect(abrirCarrito).toHaveBeenCalledTimes(1);
  });

  it('con tituloEnContenido no pinta el título, pero sí las acciones', async () => {
    const app = iniciarRouter(rutasCon(() => <ScreenHeader titulo="Carrito" subtitulo="Tus piezas" tituloEnContenido />), {
      initialUrl: '/',
    });
    await app;

    expect(await screen.findByRole('button', { name: 'Abrir notificaciones' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Carrito' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Tus piezas')).not.toBeOnTheScreen();
  });

  it('"Iniciar sesión" lleva a /login', async () => {
    const app = iniciarRouter(rutasCon(() => <ScreenHeader titulo="Inicio" />), { initialUrl: '/' });
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(app.getPathname()).toBe('/login'));
    expect(await screen.findByText('Pantalla de acceso')).toBeOnTheScreen();
  });

  it('la campana sin sesión abre "Inicia sesión para continuar" sin ir a notificaciones', async () => {
    const app = iniciarRouter(rutasCon(() => <ScreenHeader titulo="Inicio" />), { initialUrl: '/' });
    await app;

    expect(screen.queryByText('Inicia sesión para continuar')).not.toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir notificaciones' }));

    const titulo = await screen.findByRole('header', { name: 'Inicia sesión para continuar' });
    expect(titulo).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    expect(screen.queryByText('Pantalla de notificaciones')).not.toBeOnTheScreen();

    // "Ahora no" cierra la hoja y la clienta sigue donde estaba.
    await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
    await waitFor(() => expect(screen.queryByText('Inicia sesión para continuar')).not.toBeOnTheScreen());
    expect(app.getPathname()).toBe('/');
  });

  it('desde la hoja de la campana, "Crear cuenta" lleva a /registro', async () => {
    const app = iniciarRouter(rutasCon(() => <ScreenHeader titulo="Inicio" />), { initialUrl: '/' });
    await app;

    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir notificaciones' }));
    const hoja = await screen.findByRole('header', { name: 'Inicia sesión para continuar' });
    expect(hoja).toBeOnTheScreen();

    // Hay dos "Iniciar sesión" (cabecera y hoja); "Crear cuenta" solo está en la hoja.
    expect(screen.getAllByRole('button', { name: 'Iniciar sesión' })).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(app.getPathname()).toBe('/registro'));
    expect(await screen.findByText('Pantalla de registro')).toBeOnTheScreen();
  });
});

