import { existsSync } from 'node:fs';
import i18next from 'i18next';
import enTranslation from '../../src/locales/en.json';

/**
 * The global rate limiter (src/middlewares/security.ts) defaults to 100 requests per 15 minutes.
 * The contract suite issues far more than that across a run, and every request shares the same
 * source address, so without this the later tests fail with 429s that have nothing to do with
 * what they assert. Raised rather than disabled, so a runaway loop still terminates.
 */
process.env.NODE_RATE_LIMIT_MAX ??= '100000';

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
