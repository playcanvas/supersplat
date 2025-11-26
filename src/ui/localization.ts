import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const localizeInit = () => {
    return i18next
    .use(Backend)
    .use(LanguageDetector)
    .init({
        detection: {
            order: ['querystring', /* 'cookie', 'localStorage', 'sessionStorage',*/ 'navigator', 'htmlTag']
        },
        backend: {
            loadPath: './static/locales/{{lng}}.json'
        },
        supportedLngs: ['de', 'en', 'es', 'fr', 'ja', 'ko', 'ru', 'zh-CN'],
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });
};

interface LocalizeOptions {
    ellipsis?: boolean;
}

const localize = (key: string, options?: LocalizeOptions): string => {
    let text = i18next.t(key);

    if (options?.ellipsis) text += '...';

    return text;
};

/**
 * Get the current locale code (e.g., 'en', 'de', 'fr')
 */
const getLocale = (): string => {
    return i18next.language || 'en';
};

/**
 * Format an integer according to the current locale
 * @param value - The number to format
 * @returns Formatted integer string with thousands separators
 */
const formatInteger = (value: number): string => {
    return new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits: 0
    }).format(Math.round(value));
};

export { localizeInit, localize, formatInteger };
export type { LocalizeOptions };
