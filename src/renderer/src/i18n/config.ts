import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json'
import enGB from './locales/en-GB.json'
import esES from './locales/es-ES.json'
import esMX from './locales/es-MX.json'
import frFR from './locales/fr-FR.json'
import deDE from './locales/de-DE.json'
import itIT from './locales/it-IT.json'
import ptBR from './locales/pt-BR.json'
import ptPT from './locales/pt-PT.json'
import nlNL from './locales/nl-NL.json'
import plPL from './locales/pl-PL.json'
import ruRU from './locales/ru-RU.json'
import ukUA from './locales/uk-UA.json'
import trTR from './locales/tr-TR.json'
import arSA from './locales/ar-SA.json'
import heIL from './locales/he-IL.json'
import hiIN from './locales/hi-IN.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import jaJP from './locales/ja-JP.json'
import koKR from './locales/ko-KR.json'
import thTH from './locales/th-TH.json'
import viVN from './locales/vi-VN.json'
import idID from './locales/id-ID.json'
import svSE from './locales/sv-SE.json'
import daDK from './locales/da-DK.json'
import fiFI from './locales/fi-FI.json'
import nbNO from './locales/nb-NO.json'

export const LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'es-MX', label: 'Español (México)', flag: '🇲🇽' },
  { code: 'fr-FR', label: 'Français', flag: '🇫🇷' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'pt-PT', label: 'Português', flag: '🇵🇹' },
  { code: 'nl-NL', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl-PL', label: 'Polski', flag: '🇵🇱' },
  { code: 'ru-RU', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk-UA', label: 'Українська', flag: '🇺🇦' },
  { code: 'tr-TR', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'ar-SA', label: 'العربية', flag: '🇸🇦' },
  { code: 'he-IL', label: 'עברית', flag: '🇮🇱' },
  { code: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'zh-CN', label: '中文 (简体)', flag: '🇨🇳' },
  { code: 'zh-TW', label: '中文 (繁體)', flag: '🇹🇼' },
  { code: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', label: '한국어', flag: '🇰🇷' },
  { code: 'th-TH', label: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'vi-VN', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id-ID', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'sv-SE', label: 'Svenska', flag: '🇸🇪' },
  { code: 'da-DK', label: 'Dansk', flag: '🇩🇰' },
  { code: 'fi-FI', label: 'Suomi', flag: '🇫🇮' },
  { code: 'nb-NO', label: 'Norsk', flag: '🇳🇴' },
]

i18n.use(initReactI18next).init({
  resources: {
    'en-US': { translation: enUS },
    'en-GB': { translation: enGB },
    'es-ES': { translation: esES },
    'es-MX': { translation: esMX },
    'fr-FR': { translation: frFR },
    'de-DE': { translation: deDE },
    'it-IT': { translation: itIT },
    'pt-BR': { translation: ptBR },
    'pt-PT': { translation: ptPT },
    'nl-NL': { translation: nlNL },
    'pl-PL': { translation: plPL },
    'ru-RU': { translation: ruRU },
    'uk-UA': { translation: ukUA },
    'tr-TR': { translation: trTR },
    'ar-SA': { translation: arSA },
    'he-IL': { translation: heIL },
    'hi-IN': { translation: hiIN },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    'ja-JP': { translation: jaJP },
    'ko-KR': { translation: koKR },
    'th-TH': { translation: thTH },
    'vi-VN': { translation: viVN },
    'id-ID': { translation: idID },
    'sv-SE': { translation: svSE },
    'da-DK': { translation: daDK },
    'fi-FI': { translation: fiFI },
    'nb-NO': { translation: nbNO },
  },
  lng: localStorage.getItem('manyai_language') ?? 'en-US',
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

export default i18n
