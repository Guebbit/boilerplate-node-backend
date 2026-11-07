/**
 * @module
 * Locale configuration: the default, the fallback, which languages are offered, and how often the
 * edited-copy overlay is refreshed.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { csv, int, text } from '@infrastructure/config/fields';
import { MINUTE_MS } from '@domain-primitives/time';

/** The deployment's languages. */
export const localeConfig = defineConfig({
    name: 'locales',
    shape: {
        NODE_DEFAULT_LOCALE: text({ default: 'en' }),
        NODE_FALLBACK_LOCALE: text({ default: 'en' }),
        NODE_SUPPORTED_LOCALES: csv(),
        NODE_LOCALE_OVERRIDE_REFRESH_MS: int({ default: MINUTE_MS, min: 1 })
    }
});
