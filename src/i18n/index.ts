import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import ptBR from './locales/pt-BR.json';

export const IDIOMAS = [
    { codigo: 'pt-BR', nome: 'Português (Brasil)', curto: 'PT' },
    { codigo: 'en-US', nome: 'English (US)', curto: 'EN' },
    { codigo: 'es-ES', nome: 'Español (España)', curto: 'ES' },
] as const;

export type Idioma = (typeof IDIOMAS)[number]['codigo'];

export const IDIOMA_PADRAO: Idioma = 'pt-BR';

export function ehIdioma(valor: unknown): valor is Idioma {
    return IDIOMAS.some((i) => i.codigo === valor);
}

export function iniciarI18n(idioma: Idioma) {
    return i18n.use(initReactI18next).init({
        resources: {
            'pt-BR': { translation: ptBR },
            'en-US': { translation: enUS },
            'es-ES': { translation: esES },
        },
        lng: idioma,
        fallbackLng: IDIOMA_PADRAO,
        interpolation: { escapeValue: false },
    });
}

export default i18n;
