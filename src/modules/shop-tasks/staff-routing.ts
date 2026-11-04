/**
 * @module
 * Who hears what, for the work notices only a shop sends: the permission sets whose holders do the
 * work, whether it is worth an email, and where the notice points. The routing is data handed to
 * `notificationsService.notifyStaff` with each call; `notifications` keeps no table of these.
 *
 * The mail rule is the one `notifications` states: `now` only where someone must act soon, every
 * other code is the bell's alone. The ten summary rows are counts the daily digest rewrites.
 *
 * See: docs/modules/shop-tasks.md#who-is-told
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
    // Abuse defence: a bot or a loop is placing and cancelling orders, and a person steps in soon.
    'shop-tasks.staff.purchase-hold-placed': {
        sets: ['UserBanning'],
        email: 'now',
        severity: NotificationSeverity.warning
    },
    // The buyer waits for an answer and the shop owes one: the people who decide returns take it.
    'shop-tasks.staff.return-requested': {
        sets: ['ReturnManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    // The summary rows below are counts the daily digest rewrites. The ones that mail are the
    // overdue ones (something is late and nobody has acted); a count of work in the normal course
    // is the bell's alone.
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
    'shop-tasks.staff.withdrawals-awaiting-goods': {
        sets: ['ReturnReceiving'],
        email: 'none',
        severity: NotificationSeverity.info
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
    // Until a parcel is marked arrived, the buyer's withdrawal window and guarantee have not started.
    'shop-tasks.staff.undelivered': {
        sets: ['DeliveryManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    // A refund open past the attention threshold runs against the 14-day refund clock.
    'shop-tasks.staff.stale-refunds': {
        sets: ['PaymentRefunding'],
        email: 'digest',
        severity: NotificationSeverity.warning
    }
} as const satisfies Record<ShopStaffCode, StaffRoute>;

/** The summary rows: the codes the digest keeps as counts instead of announcing once. */
export const SUMMARY_PAGES = {
    'shop-tasks.staff.transfers-due': PAGES.salesOrders,
    'shop-tasks.staff.preorders-late': PAGES.salesPreorders,
    'shop-tasks.staff.delivery-holds-open': PAGES.salesOrders,
    'shop-tasks.staff.withdrawals-awaiting-goods': PAGES.returns,
    'shop-tasks.staff.returns-undecided': PAGES.returns,
    'shop-tasks.staff.low-stock': PAGES.inventory,
    'shop-tasks.staff.unshipped': PAGES.salesOrders,
    'shop-tasks.staff.awaiting-tracking': PAGES.salesOrders,
    'shop-tasks.staff.undelivered': PAGES.salesOrders,
    'shop-tasks.staff.stale-refunds': PAGES.salesPayments
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
