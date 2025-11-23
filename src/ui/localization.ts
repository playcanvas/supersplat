import i18next from 'i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

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
        supportedLngs: ['de', 'en', 'fr', 'ja', 'ko', 'zh-CN'],
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });
};

const localize = (key: string) => {
    return i18next.t(key);
};

export { localizeInit, localize };
