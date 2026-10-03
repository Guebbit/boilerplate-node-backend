/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. Records an email address
 * rather than referencing a user, since the form is open to people with no account — which is
 * also why deleting an account leaves their feedback standing. A leaf in both directions.
 *
 * See: docs/modules/feedback.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { feedbackRateLimits } from './rate-limits';
import { findOwnTicketsForExport } from './service';
import { feedbackConfig } from './config';

/** This module's manifest entry: public contact form, keyed triage (`feedback.*`). */
export default {
    name: 'feedback',
    basePath: '/feedback',
    routes: router,
    config: [feedbackConfig.slice],
    /** The contact-form budgets — see `./rate-limits.ts`. */
    rateLimits: feedbackRateLimits,
    personalData: [
        {
            section: 'feedback',
            // Matched by email, not id: this form is open to people with no account. `undefined`
            // (not an empty array) when the flag is off, so `account`'s assembly omits the key
            // entirely — `feedback` is optional in the contract precisely because most exports
            // carry none.
            collect: (subject) =>
                feedbackConfig().NODE_EXPORT_INCLUDE_FEEDBACK
                    ? findOwnTicketsForExport(subject.email)
                    : Promise.resolve(undefined)
        }
    ],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
