/**
 * @module
 * The schema of the `stepUp:` block in `shared/authorization-keys.yaml`: how recent a sign-in
 * must be, per tier, in seconds. Read through a loose wrapper, since the rest of the document is
 * `kernel/permissions.ts`'s business.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A positive whole number of seconds. */
const seconds = z.int().positive();

/** The step-up windows: one per tier a rule may name. */
export const stepUpWindowsSchema = z.strictObject({
    /** Money and destructive actions. */
    critical: seconds,
    /** Identity and sessions. */
    sensitive: seconds
});

/** The slice of `authorization-keys.yaml` this schema reads. */
export const stepUpDocumentSchema = z.looseObject({ stepUp: stepUpWindowsSchema });
