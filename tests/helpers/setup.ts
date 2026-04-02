import i18next from 'i18next';
import enTranslation from '../../src/locales/en.json';

process.env['NODE_DB_DIALECT'] = 'sqlite';
process.env['NODE_DB_STORAGE'] = ':memory:';
process.env['NODE_ENV'] = 'test';

void i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            translation: enTranslation as Record<string, unknown>
        }
    }
});
