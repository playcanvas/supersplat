import deJson from './locales/de.json';
import enJson from './locales/en.json';
import esJson from './locales/es.json';
import frJson from './locales/fr.json';
import jaJson from './locales/ja.json';
import koJson from './locales/ko.json';
import ptBRJson from './locales/pt-BR.json';
import ruJson from './locales/ru.json';
import zhCNJson from './locales/zh-CN.json';

type Dictionary = Record<string, string>;

const en: Dictionary = enJson;

const dictionaries: Record<string, Dictionary> = {
    de: deJson,
    en,
    es: esJson,
    fr: frJson,
    ja: jaJson,
    ko: koJson,
    'pt-BR': ptBRJson,
    ru: ruJson,
    'zh-CN': zhCNJson
};

let current: Dictionary = en;

const detectLocale = (): string => {
    const candidates = [
        new URLSearchParams(location.search).get('lang'),
        ...(navigator.languages ?? [navigator.language])
    ];
    const keys = Object.keys(dictionaries);
    for (const c of candidates) {
        if (!c) continue;
        const lc = c.toLowerCase();
        const base = lc.split('-')[0];
        // 1. exact tag match (case-insensitive: "DE" → "de", "pt-br" → "pt-BR")
        // 2. base-language match ("fr-CA" → "fr")
        // 3. any region variant sharing the base ("pt" → "pt-BR", "zh" → "zh-CN")
        const match = keys.find(k => k.toLowerCase() === lc) ??
            keys.find(k => k.toLowerCase() === base) ??
            keys.find(k => k.toLowerCase().split('-')[0] === base);
        if (match) return match;
    }
    return 'en';
};

// Look up a key in the active locale, falling back to English, then the key
// itself so missing translations are visible rather than blank.
const localize = (key: string): string => current[key] ?? en[key] ?? key;

// Detect the preferred locale and replace the text of every `[data-i18n]`
// element with its translation. Call once after the DOM is parsed and before
// any code reads localized strings.
const initLocalization = () => {
    const locale = detectLocale();
    current = dictionaries[locale];
    document.documentElement.lang = locale;
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        el.textContent = localize(el.dataset.i18n);
    });
};

export { initLocalization, localize };
