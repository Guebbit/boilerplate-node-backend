/**
 * @module
 * The staff notice for a do-not-retry write whose outcome nobody knows: a refund, a ship or a stock
 * movement that began, never reported back, and was not run again. The ledger in
 * `infrastructure/http/middlewares/idempotency.ts` finds it and calls the sink this module
 * registers; here the subject is named in words (the order's number, the product's name) and the
 * people who do that work are told, once per stuck key.
 *
 * See: docs/understand/idempotency.md#do-not-retry-operations
 */

import type { PermissionSetName } from '@api/permission-vocabulary';
import { logger } from '@infrastructure/adapters/logger';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import type { OutcomeUnknownFacts } from '@infrastructure/http/middlewares/idempotency';
import { deliveryService } from '@modules/delivery';
import { notificationsService } from '@modules/notifications';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { productService } from '@modules/products';
import { SHOP_STAFF_ROUTES } from '../staff-routing';

/** The operations of the contract's notice params, as a type guard needs them. */
type OutcomeUnknownOperation = 'refund' | 'ship' | 'receive-stock' | 'adjust-stock';

/** A subject named in words: the id the notice links to, and what staff read of it. */
interface NamedSubject {
    /** The order's id, or the product's. */
    subjectId: string;
    /** The order's number, or the product's name. */
    subjectName: string;
}

/** How a do-not-retry operation is told: to whom, and how its subject is found and named. */
interface OperationTelling {
    /** The permission set whose holders do the work: the one holding the route's own key. */
    set: PermissionSetName;
    /** The frontend screen the notice points at, for the mail. */
    page: 'order' | 'inventory';
    /** The subject of this request, as the notice names it; `undefined` when it no longer exists. */
    name: (facts: OutcomeUnknownFacts) => Promise<NamedSubject | undefined>;
}

/**
 * The order an order-bound subject names, as the notice shows it.
 *
 * @param orderId - the order the refunded payment or the shipped fulfillment order belongs to
 */
const orderNamed = (orderId: string | undefined): Promise<NamedSubject | undefined> =>
    orderId === undefined
        ? Promise.resolve(undefined)
        : orderService.findManyByIds([orderId]).then((orders) => {
              const order = orders.at(0);
              return order ? { subjectId: orderId, subjectName: order.orderNumber } : undefined;
          });

/**
 * The product a stock movement was on, as the notice shows it.
 *
 * @param facts - the stuck key; its subject is the product's id
 */
const productNamed = ({ subjectId }: OutcomeUnknownFacts): Promise<NamedSubject | undefined> =>
    productService.findManyByIds([subjectId]).then((products) => {
        const product = products.at(0);
        return product ? { subjectId, subjectName: product.title } : undefined;
    });

/** Every do-not-retry operation a route can name, and how it is told. */
const OPERATIONS: Record<OutcomeUnknownOperation, OperationTelling> = {
    refund: {
        set: 'PaymentRefunding',
        page: 'order',
        name: ({ subjectId }) => paymentService.orderIdOf(subjectId).then(orderNamed)
    },
    ship: {
        set: 'DeliveryManagement',
        page: 'order',
        name: ({ subjectId }) =>
            deliveryService.orderIdOfFulfillmentOrder(subjectId).then(orderNamed)
    },
    'receive-stock': { set: 'InventoryManagement', page: 'inventory', name: productNamed },
    'adjust-stock': { set: 'InventoryManagement', page: 'inventory', name: productNamed }
};

/**
 * Whether a route's operation name is one this module can tell staff about.
 *
 * @param operation - what the route passed to `requireIdempotencyKey`
 */
const isKnownOperation = (operation: string): operation is OutcomeUnknownOperation =>
    Object.hasOwn(OPERATIONS, operation);

/**
 * Tell the staff who do this work that a do-not-retry key's first attempt has an unknown outcome.
 * Never rejects: the 409 the client gets must not wait on, or fail with, the notice.
 *
 * @param facts - the stuck key, from the ledger
 */
export const tellOutcomeUnknown = (facts: OutcomeUnknownFacts): Promise<void> => {
    if (!isKnownOperation(facts.operation)) {
        logger.error({
            message: 'A do-not-retry operation has no outcome-unknown notice.',
            operation: facts.operation
        });
        return Promise.resolve();
    }
    const { operation } = facts;
    const telling = OPERATIONS[operation];

    return telling
        .name(facts)
        .then((subject) => {
            if (!subject) {
                logger.error({
                    message: 'The subject of an unknown-outcome key no longer exists.',
                    operation
                });
                return;
            }
            return notificationsService.notifyStaff({
                tenantId: facts.tenantId,
                body: {
                    code: 'shop-tasks.staff.outcome-unknown',
                    params: { operation, ...subject, since: facts.since.toISOString() }
                },
                route: SHOP_STAFF_ROUTES['shop-tasks.staff.outcome-unknown'],
                sets: [telling.set],
                link: {
                    template: FRONTEND_LINK_RULES.staffPages[telling.page],
                    parameters: { id: subject.subjectId }
                },
                dedupeKey: `outcome-unknown:${facts.recordId}`
            });
        })
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.error({
                message: 'A do-not-retry outcome-unknown notice could not be written.',
                operation,
                error
            });
        });
};
