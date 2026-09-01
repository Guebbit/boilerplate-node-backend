/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. Records an email address
 * rather than referencing a user, since the form is open to people with no account — which is
 * also why deleting an account leaves their feedback standing. A leaf in both directions.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   account (the data export, `findOwnTickets` — behind
 *               `NODE_EXPORT_INCLUDE_FEEDBACK`, default off; the guess that a ticket and an
 *               account are the same person is the caller's to make, not this module's)
 *
 * See: docs/modules/feedback.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: public contact form, admin-only triage. */
export default {
    name: 'feedback',
    basePath: '/feedback',
    routes: router,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
