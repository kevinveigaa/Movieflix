/**
 * MovieFlix — Configuração oficial do aplicativo Android.
 *
 * Centraliza TODOS os dados de versão e download do APK em UM único lugar,
 * para que futuras atualizações só precisem alterar este arquivo
 * (e colocar o novo arquivo em public/apk/).
 */
export const APP_INFO = {
  /** Nome exibido do aplicativo */
  name: 'MovieFlix',
  /** Versão semântica atual (bate com android/app/build.gradle → versionName) */
  version: '1.1.0',
  /** Código de versão Android (bate com versionCode) */
  versionCode: 2,
  /** Plataformas suportadas */
  platforms: ['Android', 'Android TV', 'Google TV', 'TV Box'],
  /** Nome do arquivo do APK oficial (manter sincronizado com public/apk/) */
  apkFileName: 'MovieFlix-v1.1.0.apk',
} as const;

/** Caminho público do APK oficial dentro do app (servido pelo backend/static). */
export const APK_URL = `/apk/${APP_INFO.apkFileName}`;

/** Tamanho aproximado do APK em MB (exibido na página de download). */
export const APK_SIZE_MB = '32 MB';