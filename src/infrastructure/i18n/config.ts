/**
 * @module
 * Locale configuration: the default, the fallback, which languages are offered, and how often the
 * edited-copy overlay is refreshed.
 *
 * @see docs/operate/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, locale, locales } from '@infrastructure/config/fields';
import { MINUTE_MS } from '@domain-primitives/time';

/** The deployment's languages. */
export const localeConfig = defineConfig({
    name: 'locales',
    shape: {
        NODE_DEFAULT_LOCALE: locale({ default: 'en' }),
        NODE_FALLBACK_LOCALE: locale({ default: 'en' }),
        NODE_SUPPORTED_LOCALES: locales(),
        NODE_LOCALE_OVERRIDE_REFRESH_MS: int({ default: MINUTE_MS, min: 1 })
    }
});
