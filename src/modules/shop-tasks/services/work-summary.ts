/**
 * @module
 * The count behind each staff navigation badge: what waits on that screen, read through the
 * owning module's own list as the caller, so a badge and its screen cannot disagree.
 *
 * @see docs/modules/shop-tasks.md#the-nav-badge-summary
 */

import { holds } from '@kernel/ability';
import { callerForSubject, type ActionOn, type PermissionSubject } from '@kernel/permissions';
import type { AuthContext, ShopWorkSummary } from '@types';
import { deliveryService } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { returnService } from '@modules/returns';

/** One badge: the key it fills, whether the caller may open its screen, and its count. */
interface Badge {
    key: keyof ShopWorkSummary;
    opens: (caller: AuthContext) => boolean;
    count: (caller: AuthContext) => Promise<number>;
}

/**
 * The screen's route gate, asked of the held keys: `display:Order` by name, which `read:Order`
 * (every signed-in account) does not satisfy.
 */
const mayOpen =
    <TSubject extends PermissionSubject>(action: ActionOn<TSubject>, subject: TSubject) =>
    (caller: AuthContext): boolean =>
        holds(callerForSubject(caller, subject), action, subject);

/** One row is enough to learn a list's total: list counts read `meta.totalItems`, payments its list. */
const ONE_ROW = { pageSize: 1 };

/** The `meta.totalItems` of a page. */
const totalOf = ({ meta }: { meta: { totalItems: number } }): number => meta.totalItems;

/** The five badges, in the order the navigation lists them. */
const BADGES: readonly Badge[] = [
    {
        key: 'salesOrders',
        opens: mayOpen('display', 'Order'),
        /**
         * No third argument to `search`: a caller context there fires an `orders_viewed`
         * analytics event, and a badge refresh is not a person viewing orders.
         */
        count: (caller) =>
            orderService
                .search(
                    { ...ONE_ROW, fulfillmentStatus: 'awaiting_shipment', deleted: false },
                    orderService.callerScope(caller)
                )
                .then(totalOf)
    },
    {
        key: 'salesPayments',
        opens: mayOpen('display', 'Payment'),
        count: () => paymentService.listAttention().then(({ items }) => items.length)
    },
    {
        key: 'returns',
        opens: mayOpen('read', 'Return'),
        count: (caller) =>
            returnService.listReturns({ ...ONE_ROW, status: 'requested' }, caller).then(totalOf)
    },
    {
        key: 'salesPreorders',
        opens: mayOpen('display', 'Order'),
        count: (caller) =>
            deliveryService
                .listPreorderFulfillmentOrders({ ...ONE_ROW, late: true }, caller)
                .then(totalOf)
    },
    {
        key: 'inventory',
        opens: mayOpen('read', 'StockLevel'),
        count: () => inventoryService.listLevels({ ...ONE_ROW, lowOnly: true }).then(totalOf)
    }
];

/**
 * The open-work counts the caller may see: a key is present only when the caller's rules open
 * its screen, and zero is sent as zero.
 *
 * @param caller - the signed-in person asking
 */
export const workSummary = (caller: AuthContext): Promise<ShopWorkSummary> =>
    Promise.all(
        BADGES.filter(({ opens }) => opens(caller)).map(({ key, count }) =>
            count(caller).then((value) => [key, value] as const)
        )
        // `fromEntries` types its keys as `string`; every key is a `Badge.key`, so the shape holds.
    ).then((entries) => Object.fromEntries(entries) as ShopWorkSummary);
