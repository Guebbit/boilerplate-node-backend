/**
 * @module
 * The schema of `shared/rules/frontend-links.yaml`: the frontend paths a mail or a sitemap links
 * to, the staff screens a work-notice mail points at, and the sitemap's static pages.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A non-empty path template. */
const template = z.string().min(1);

/** Shape of `shared/rules/frontend-links.yaml`. */
export const frontendLinksSchema = z.strictObject({
    /** One path template per kind of link, under the frontend's `/<locale>/`. */
    links: z.strictObject({
        /** Confirm an e-mail address. */
        verify: template,
        /** Choose a new password. */
        reset: template,
        /** Choose the first password of an account staff created. */
        setup: template,
        /** Undo an account deletion. */
        restore: template,
        /** Confirm a new e-mail address. */
        emailChange: template,
        /** Undo an e-mail change. */
        emailUndo: template,
        /** Download a data export. */
        export: template,
        /** One order. */
        order: template,
        /** One product. */
        product: template,
        /** The contact page, pre-filled for an account question. */
        contact: template,
        /** The privacy notice. */
        privacy: template,
        /** The Terms of Service. */
        terms: template
    }),
    /** Staff screens a work-notice mail links to, under the frontend's `/<locale>/`. */
    staffPages: z.strictObject({
        /** One user's account screen. */
        user: template,
        /** One webhook subscription. */
        webhookSubscription: template,
        /** One task. */
        task: template,
        /** One return. */
        return: template,
        /** The payments list. */
        salesPayments: template,
        /** Summary row: bank transfers still unpaid, on the awaiting tab. */
        transfersDue: template,
        /** Summary row: preorders past their expected date. */
        preordersLate: template,
        /** Summary row: fulfillment orders held too long. */
        deliveryHoldsOpen: template,
        /** Summary row: withdrawals whose goods have not come back. */
        returnsAwaitingGoods: template,
        /** Summary row: return requests awaiting a decision. */
        returnsUndecided: template,
        /** Summary row: the low-stock board. */
        lowStock: template,
        /** Summary row: paid orders not yet shipped. */
        unshipped: template,
        /** Summary row: shipped orders still without tracking. */
        awaitingTracking: template,
        /** Summary row: shipped orders not yet delivered. */
        undelivered: template,
        /** Summary row: refunds open past the attention threshold. */
        staleRefunds: template
    }),
    /** Public pages that take no id. The empty string is the home page. */
    staticPages: z.array(z.string())
});
