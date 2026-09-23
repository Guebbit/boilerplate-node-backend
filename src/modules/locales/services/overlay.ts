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
 * others catch up on their next scheduled refresh. Called for frontend-tenant writes too,
 * even though those can't affect the overlay — cheaper than threading the tenant through.
 */
export const refreshOverlay = (): void => void refreshLocaleOverrides();
