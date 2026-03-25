/**
 * Jest global setup file — runs once per worker BEFORE any test module is loaded.
 *
 * Why this file exists
 * --------------------
 * 1. i18next initialisation
 *    Several Mongoose model files build their Zod validation schemas at
 *    module-evaluation time using i18next's `t()` helper.  If i18next has not
 *    been initialised yet, `t()` returns the raw translation key instead of the
 *    human-readable string.  By listing this file under `setupFiles` in
 *    jest.config.json, Jest guarantees it runs before the test module graph is
 *    resolved, so every subsequent `t()` call sees the correct locale data.
 *
 * 2. mongodb-memory-server binary path
 *    In sandboxed / offline CI environments the package cannot download the
 *    MongoDB binary from the internet.  Setting MONGOMS_SYSTEM_BINARY tells the
 *    package to use a pre-installed `mongod` binary instead of downloading one.
 *    The binary is extracted from the official `mongo` Docker image at CI
 *    bootstrap time and placed at /tmp/mongod.
 *
 * Referenced in jest.config.json → "setupFiles": ["<rootDir>/tests/helpers/setup.ts"]
 */

import i18next from 'i18next';
import enTranslation from '../../src/locales/en.json';

// ─── mongodb-memory-server configuration ────────────────────────────────────

/**
 * Point mongodb-memory-server at a pre-installed mongod binary.
 *
 * MONGOMS_SYSTEM_BINARY  – absolute path to the mongod executable.
 * MONGOMS_SYSTEM_BINARY_VERSION_CHECK – skip the version-match assertion so
 *   that any mongod version works (the Docker image may differ from the
 *   package's pinned version).
 *
 * These must be set BEFORE `mongodb-memory-server` is imported, because the
 * package reads them at module load time via `resolveConfig()`.
 */
if (!process.env['MONGOMS_SYSTEM_BINARY']) {
    // Default path where CI bootstrapping places the extracted mongod binary.
    // Override via MONGOMS_SYSTEM_BINARY env var if needed.
    process.env['MONGOMS_SYSTEM_BINARY'] = '/tmp/mongod';
}
process.env['MONGOMS_SYSTEM_BINARY_VERSION_CHECK'] = 'false';
process.env['MONGOMS_MD5_CHECK'] = 'false';

// ─── i18next initialisation ──────────────────────────────────────────────────

/**
 * Initialise i18next synchronously.
 *
 * `initImmediate: false` bypasses the default setTimeout(0) deferral that
 * i18next uses when running in Node, making the initialisation synchronous so
 * that `t()` is ready before the first test module is evaluated.
 */
i18next.init({
    initImmediate: false,
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            translation: enTranslation as Record<string, unknown>,
        },
    },
});
