/// <reference types="jest" />

/**
 * Contexto e imagen simulados de ImageManipulator (expo-image-manipulator), sin tocar imágenes reales:
 * la imagen se guarda como JPEG cuadrado en `uri` con `lado` px por lado. Los dos traen su release
 * para revisar que se liberan.
 */
export function manipuladorSimulado(uri: string, lado: number) {
  const imagen = {
    saveAsync: jest.fn(() => Promise.resolve({ uri, width: lado, height: lado })),
    release: jest.fn(),
  };
  const contexto = {
    crop: jest.fn(),
    resize: jest.fn(),
    renderAsync: jest.fn(() => Promise.resolve(imagen)),
    release: jest.fn(),
  };
  return { contexto, imagen };
}
