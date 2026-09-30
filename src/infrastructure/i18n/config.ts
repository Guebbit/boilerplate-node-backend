/**
 * @module
 * Locale configuration: the default, the fallback, which languages are offered, and how often the
 * edited-copy overlay is refreshed.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { csv, int, text } from '@infrastructure/config/fields';

/** The deployment's languages. */
export const localeConfig = defineConfig({
    name: 'locales',
    shape: {
        NODE_DEFAULT_LOCALE: text({
            default: 'en',
            describe: 'The locale a request falls back to when it asks for none.'
        }),
        NODE_FALLBACK_LOCALE: text({
            default: 'en',
            describe: 'The locale a missing translation key falls back to.'
        }),
        NODE_SUPPORTED_LOCALES: csv({
            describe: 'The languages offered. Unset lists every dictionary file.'
        }),
        NODE_LOCALE_OVERRIDE_REFRESH_MS: int({
            default: 60_000,
            min: 1,
            describe: 'How long a worker may serve copy another worker edited.'
        })
    }
});
