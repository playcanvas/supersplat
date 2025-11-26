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

export { localizeInit, localize };
export type { LocalizeOptions };
