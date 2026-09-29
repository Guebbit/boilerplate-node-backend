/**
 * @module
 * Returns: sending goods back, and the EU withdrawal button. Depends on `orders` for what a return
 * is about — its lines, its owner, its status — and for the cancel a withdrawal before dispatch
 * becomes. `orders` knows nothing of this module: the arrow only ever points this way.
 *
 * A return is keyed by `orderId`, never by `userId`, so account erasure needs no `erase` hook here
 * — see `./services/personal-data.ts`.
 *
 * See: docs/modules/returns.md
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import type { DomainEventMap } from '@kernel/events';
import { router } from './routes';
import { returnsRateLimits } from './rate-limits';
import { collectPersonalData } from './services/personal-data';
// Also installs this module's event declarations. Reached directly, never through this module's
// own barrel — see CLAUDE.md's module-barrel rule.
import { RETURN_REQUESTED } from './events';

/**
 * This module's public (webhook-visible) events, projected by `webhooks` through
 * `kernel/registry.ts`'s `resolvePublicEvents` — the same registry every other module uses, so
 * `webhooks` never imports this module by name.
 */
const publicEvents: Readonly<Record<string, PublicEventTarget>> = {
    [RETURN_REQUESTED]: {
        toPublicEvent: (payload: DomainEventMap[typeof RETURN_REQUESTED]) => ({
            eventType: 'return.requested',
            data: { returnId: payload.returnId, orderId: payload.orderId, reason: payload.reason }
        })
    }
};

/** This module's manifest entry: routes, its export section, budgets, public events and locales. */
export default {
    name: 'returns',
    basePath: '/returns',
    routes: router,
    rateLimits: returnsRateLimits,
    publicEvents,
    personalData: [
        {
            section: 'returns',
            collect: (subject) => collectPersonalData(subject.userId)
            // No `erase` — see `services/personal-data.ts`'s own docblock.
        }
    ],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
