import { existsSync } from 'node:fs';
import i18next from 'i18next';
import enTranslation from '../../src/locales/en.json';

//
//
/**
 * Use a pre-installed mongod binary when available (set by `npm run setup:mongod`).
 * If the binary is absent, mongodb-memory-server will download it automatically at runtime.
 * So first run may be slow (download is 100mb)
 */
const systemBinary = process.env['MONGOMS_SYSTEM_BINARY'] ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env['MONGOMS_SYSTEM_BINARY'] = systemBinary;
    process.env['MONGOMS_SYSTEM_BINARY_VERSION_CHECK'] = 'false';
    process.env['MONGOMS_MD5_CHECK'] = 'false';
}

/**
 * WARNING: it's async
 */
void i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            translation: enTranslation as Record<string, unknown>
        }
    }
});
