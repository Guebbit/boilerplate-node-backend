/**
 * @module
 * Triggers the database overlay refresh after a write that may have changed it. `entries.ts` and
 * `languages.ts` both funnel their write paths through {@link refreshOverlay} so a future write
 * path picks up the refresh by construction, rather than its controller having to remember it.
 */

import { refreshLocaleOverrides } from '@infrastructure/i18n';

/**
 * Re-read the API's own overrides after a write that may have changed them.
 * Fire-and-forget: makes the edit visible immediately on the worker that served the write,
 * others catch up on their next scheduled refresh. Called for frontend-app writes too,
 * even though those can't affect the overlay — cheaper than threading the app through.
 */
export const refreshOverlay = (): void => void refreshLocaleOverrides();

/**
 * Re-read the overlay and wait for it. For the writes that change which languages are SERVED:
 * the request right after a language is switched on or off, on the worker that took the write,
 * must already negotiate against the new list. Never rejects, like the refresh itself.
 */
export const refreshOverlayNow = (): Promise<void> => refreshLocaleOverrides();
