import { useMemo } from 'react';

import { useNombreSalon } from '@/shared/api/useConfiguracionPublica';
import { useTextos } from '@/shared/api/useTextos';

/**
 * Textos de las pantallas y piezas de acceso (AuthContainer, hojas de acceso y bienvenida,
 * invitación a iniciar sesión y hoja de apariencia), del catálogo de textos con su respaldo en la
 * app (GP-07.6). Las vistas y los componentes no importan de shared/api: los toman de aquí. Las
 * etiquetas de los campos, los mensajes de validación y los textos legales se quedan en su sitio.
 */
export interface TextosAuth {
  /** Nombre del salón que anuncia TalkBack en el panel de marca. */
  nombreSalon: string;
  acceso: {
    iniciarSesion: string;
    crearCuenta: string;
    ahoraNo: string;
    hojaTitulo: string;
    hojaTexto: string;
    cerrarAyuda: string;
  };
  bienvenida: { titulo: string; texto: string; explorar: string };
  pestanas: { acceso: string; registro: string };
  login: { titulo: string; texto: string; olvidaste: string; entrar: string; entrando: string };
  google: { boton: string; abriendo: string; ayuda: string };
  /** Reactivar la cuenta que desactivó su titular (GP-09): el botón y el enlace discreto de Acceso. */
  cuenta: { reactivar: string; enlace: string };
  registro: {
    titulo: string;
    texto: string;
    pasoCuenta: string;
    pasoCabello: string;
    /** "Paso 1 de 2: Tu cuenta". */
    pasoDe: (numero: number, total: number, paso: string) => string;
    correoVerificando: string;
    correoRegistrado: string;
    correoRevisando: string;
    correoSinRed: string;
    correoSinVerificar: string;
    faltanRequisitos: string;
    cabelloTitulo: string;
    finalizar: string;
    registrando: string;
    preguntasAyuda: string;
    preguntasCargando: string;
    preguntasVacias: string;
  };
  apariencia: {
    titulo: string;
    sistema: string;
    sistemaDetalle: string;
    claro: string;
    claroDetalle: string;
    oscuro: string;
    oscuroDetalle: string;
  };
}

/** Los textos de acceso con la configuración vigente; cambian (y se vuelve a pintar) si cambia. */
export function useTextosAuth(): TextosAuth {
  const texto = useTextos();
  const nombreSalon = useNombreSalon();
  return useMemo<TextosAuth>(
    () => ({
      nombreSalon,
      acceso: {
        iniciarSesion: texto('auth.acceso.iniciarSesion'),
        crearCuenta: texto('auth.acceso.crearCuenta'),
        ahoraNo: texto('auth.acceso.ahoraNo'),
        hojaTitulo: texto('auth.acceso.hojaTitulo'),
        hojaTexto: texto('auth.acceso.hojaTexto'),
        cerrarAyuda: texto('auth.acceso.cerrarAyuda'),
      },
      bienvenida: {
        titulo: texto('auth.bienvenida.titulo'),
        texto: texto('auth.bienvenida.texto'),
        explorar: texto('auth.bienvenida.explorar'),
      },
      pestanas: { acceso: texto('auth.pestana.acceso'), registro: texto('auth.pestana.registro') },
      login: {
        titulo: texto('auth.login.titulo'),
        texto: texto('auth.login.texto'),
        olvidaste: texto('auth.login.olvidaste'),
        entrar: texto('auth.login.entrar'),
        entrando: texto('auth.login.entrando'),
      },
      google: {
        boton: texto('auth.google.boton'),
        abriendo: texto('auth.google.abriendo'),
        ayuda: texto('auth.google.ayuda'),
      },
      cuenta: {
        reactivar: texto('cuenta.reactivar.boton'),
        enlace: texto('cuenta.reactivar.enlaceGoogle'),
      },
      registro: {
        titulo: texto('auth.registro.titulo'),
        texto: texto('auth.registro.texto'),
        pasoCuenta: texto('auth.registro.pasoCuenta'),
        pasoCabello: texto('auth.registro.pasoCabello'),
        pasoDe: (numero, total, paso) => texto('auth.registro.pasoDe', { numero, total, paso }),
        correoVerificando: texto('auth.registro.correoVerificando'),
        correoRegistrado: texto('auth.registro.correoRegistrado'),
        correoRevisando: texto('auth.registro.correoRevisando'),
        correoSinRed: texto('auth.registro.correoSinRed'),
        correoSinVerificar: texto('auth.registro.correoSinVerificar'),
        faltanRequisitos: texto('auth.registro.faltanRequisitos'),
        cabelloTitulo: texto('auth.registro.cabelloTitulo'),
        finalizar: texto('auth.registro.finalizar'),
        registrando: texto('auth.registro.registrando'),
        preguntasAyuda: texto('auth.registro.preguntasAyuda'),
        preguntasCargando: texto('auth.registro.preguntasCargando'),
        preguntasVacias: texto('auth.registro.preguntasVacias'),
      },
      apariencia: {
        titulo: texto('perfil.apariencia.titulo'),
        sistema: texto('perfil.apariencia.sistema'),
        sistemaDetalle: texto('perfil.apariencia.sistemaDetalle'),
        claro: texto('perfil.apariencia.claro'),
        claroDetalle: texto('perfil.apariencia.claroDetalle'),
        oscuro: texto('perfil.apariencia.oscuro'),
        oscuroDetalle: texto('perfil.apariencia.oscuroDetalle'),
      },
    }),
    [texto, nombreSalon],
  );
}
