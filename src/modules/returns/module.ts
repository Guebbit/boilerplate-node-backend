/**
 * @module
 * Returns: sending goods back, and the EU withdrawal button. Depends on `orders` for what a return
 * is about — its lines, its owner, its status — and for the cancel a withdrawal before dispatch
 * becomes; on `inventory` to put received goods back on sale, on `payments` to pay the customer back
 * (and to hear a refund land), and on `delivery` for the return address and the delivery a
 * withdrawal refunds. `orders` knows nothing of this module: the arrow only ever points this way.
 *
 * A return is keyed by `orderId`, never by `userId`, so account erasure needs no `erase` hook here
 * — see `./services/personal-data.ts`.
 *
 * See: docs/modules/returns.md
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import { PAYMENT_REFUNDED } from '@modules/payments';
import { router } from './routes';
import { returnsRateLimits } from './rate-limits';
import { collectPersonalData } from './services/personal-data';
// Also installs this module's event declarations. Reached directly, never through this module's
// own barrel — see CLAUDE.md's module-barrel rule.
import { RETURN_REQUESTED, RETURN_RECEIVED, RETURN_CLOSED } from './events';
import { closeReturn } from './services/close';

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
    },
    [RETURN_RECEIVED]: {
        toPublicEvent: (payload: DomainEventMap[typeof RETURN_RECEIVED]) => ({
            eventType: 'return.received',
            data: { returnId: payload.returnId, orderId: payload.orderId }
        })
    },
    [RETURN_CLOSED]: {
        toPublicEvent: (payload: DomainEventMap[typeof RETURN_CLOSED]) => ({
            eventType: 'return.closed',
            data: {
                returnId: payload.returnId,
                orderId: payload.orderId,
                refundAmount: payload.refundAmount,
                currency: payload.currency
            }
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
    /*
     * A refund that pays for a return announces itself with that return's id. Closing is the same
     * conditional move whether this listener or the request that received the goods gets there
     * first — the refund may land in the request, or later when the payment sweep completes one
     * the provider first refused.
     */
    subscribe: () => {
        onDomainEvent(PAYMENT_REFUNDED, ({ returnId }) =>
            returnId ? closeReturn(returnId).then(() => undefined) : undefined
        );
    },
    personalData: [
        {
            section: 'returns',
            collect: (subject) => collectPersonalData(subject.userId)
            // No `erase` — see `services/personal-data.ts`'s own docblock.
        }
    ],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates'),
    /**
     * Two defective-goods requests awaiting an answer, each on its own order delivered today:
     * opened by the customer through `POST /returns`, so a journey can approve one and decline
     * the other. The ids are RETURN ids.
     */
    scenario: { shop: ['return.requested', 'return.requestedSecond'] }
} satisfies AppModule;
