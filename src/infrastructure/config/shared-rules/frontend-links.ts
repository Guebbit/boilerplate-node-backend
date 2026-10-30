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
        privacy: template
    }),
    /** Staff screens a work-notice mail links to, under the frontend's `/<locale>/`. */
    staffPages: z.strictObject({
        /** One user's account screen. */
        user: template,
        /** One webhook subscription. */
        webhookSubscription: template,
        /** One ticket. */
        ticket: template,
        /** One return. */
        return: template,
        /** The orders list. */
        salesOrders: template,
        /** The preorders list. */
        salesPreorders: template,
        /** The payments list. */
        salesPayments: template,
        /** The returns list. */
        returns: template,
        /** The inventory board. */
        inventory: template
    }),
    /** Public pages that take no id. The empty string is the home page. */
    staticPages: z.array(z.string())
});

/** Parsed `frontend-links.yaml`. */
export type FrontendLinksRules = z.infer<typeof frontendLinksSchema>;
