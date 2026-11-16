/**
 * @module
 * Who hears what, for the work notices only a shop sends: the permission sets whose holders do the
 * work, whether it is worth an email, and where the notice points. The routing is data handed to
 * `notificationsService.notifyStaff` with each call; `notifications` keeps no table of these.
 *
 * The mail rule is the one `notifications` states: `now` only where someone must act soon;
 * `digest` where an overdue count is mailed once per run; `none` is the bell's alone. The ten
 * summary rows are counts the daily digest rewrites.
 *
 * @see docs/modules/shop-tasks.md#who-is-told
 */

import { NotificationSeverity } from '@types';
import type { NotificationCode, StaffLink, StaffRoute } from '@modules/notifications';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';

/** A work notice code this module owns. */
type ShopStaffCode = Extract<NotificationCode, `shop-tasks.staff.${string}`>;

/** Where the staff screens live: the shared `staffPages` paths, in the frontend's own router. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

/** Every work notice code this module writes and its routing. A code missing here does not compile. */
export const SHOP_STAFF_ROUTES = {
    /** Abuse defence: a bot or a loop is placing and cancelling orders; a person steps in soon. */
    'shop-tasks.staff.purchase-hold-placed': {
        sets: ['UserBanning'],
        email: 'now',
        severity: NotificationSeverity.warning
    },
    /** The buyer waits for an answer and the shop owes one: those who decide returns take it. */
    'shop-tasks.staff.return-requested': {
        sets: ['ReturnManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    /**
     * A refund, a ship or a stock movement began and never reported back, and was not run again.
     * Money or stock may or may not have moved: the people who do that work check now.
     */
    'shop-tasks.staff.outcome-unknown': {
        sets: 'per-notice',
        email: 'now',
        severity: NotificationSeverity.error
    },
    /**
     * The summary rows below are counts the daily digest rewrites. The ones that mail are the
     * overdue ones (something is late and nobody has acted); a count of work in the normal course
     * is the bell's alone.
     */
    'shop-tasks.staff.transfers-due': {
        sets: ['PaymentRecording'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    'shop-tasks.staff.preorders-late': {
        sets: ['OrderEditing'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'shop-tasks.staff.delivery-holds-open': {
        sets: ['DeliveryManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    /**
     * Only the overdue ones: an approved return with neither goods nor proof of sending long after
     * the buyer's days to send it ran out. Staff ask once for proof of posting and keep the refund on hold.
     */
    'shop-tasks.staff.returns-awaiting-goods': {
        sets: ['ReturnReceiving'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'shop-tasks.staff.returns-undecided': {
        sets: ['ReturnManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'shop-tasks.staff.low-stock': {
        sets: ['InventoryManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    'shop-tasks.staff.unshipped': {
        sets: ['DeliveryStart'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'shop-tasks.staff.awaiting-tracking': {
        sets: ['DeliveryManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    /** Until a parcel is marked arrived, the buyer's withdrawal window and guarantee don't start. */
    'shop-tasks.staff.undelivered': {
        sets: ['DeliveryManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    /** A refund open past the attention threshold runs against the 14-day refund clock. */
    'shop-tasks.staff.stale-refunds': {
        sets: ['PaymentRefunding'],
        email: 'digest',
        severity: NotificationSeverity.warning
    }
} as const satisfies Record<ShopStaffCode, StaffRoute>;

/** The summary rows: the codes the digest keeps as counts instead of announcing once. */
export const SUMMARY_PAGES = {
    'shop-tasks.staff.transfers-due': PAGES.transfersDue,
    'shop-tasks.staff.preorders-late': PAGES.preordersLate,
    'shop-tasks.staff.delivery-holds-open': PAGES.deliveryHoldsOpen,
    'shop-tasks.staff.returns-awaiting-goods': PAGES.returnsAwaitingGoods,
    'shop-tasks.staff.returns-undecided': PAGES.returnsUndecided,
    'shop-tasks.staff.low-stock': PAGES.lowStock,
    'shop-tasks.staff.unshipped': PAGES.unshipped,
    'shop-tasks.staff.awaiting-tracking': PAGES.awaitingTracking,
    'shop-tasks.staff.undelivered': PAGES.undelivered,
    'shop-tasks.staff.stale-refunds': PAGES.staleRefunds
} as const satisfies Partial<Record<ShopStaffCode, string>>;

/** One of the summary rows: its count is rewritten by the digest, its link is the page that lists what it counts. */
export type SummaryCode = keyof typeof SUMMARY_PAGES;

/**
 * The admin page that lists what a summary row counts.
 *
 * @param code - the summary row
 */
export const summaryLinkOf = (code: SummaryCode): StaffLink => ({
    template: SUMMARY_PAGES[code],
    parameters: {}
});
