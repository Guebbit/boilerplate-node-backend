import { existsSync } from 'node:fs';
import i18next from 'i18next';
import enTranslation from '../../src/locales/en.json';

/**
 * 10x the live default (`DEFAULT_RATE_LIMIT_MAX` in src/middlewares/security.ts, currently 100).
 *
 * A suite issues far more requests than a person does, and every one of them shares a single
 * source address, so the per-IP limiter sees one very busy client. Without this the later tests
 * fail with 429s that have nothing to do with what they assert.
 *
 * Raised rather than disabled, so a runaway loop still terminates — and written as a literal
 * rather than imported from `security.ts`, because importing that module here would evaluate
 * `rateLimit()` before this line had a chance to set the variable it reads.
 */
process.env.NODE_RATE_LIMIT_MAX ??= '1000';

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
