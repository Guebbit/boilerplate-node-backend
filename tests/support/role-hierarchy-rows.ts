/**
 * Every staff write on something a person owns — the rows `tests/cross-cutting/role-hierarchy.test.ts`
 * drives through the real app, and the list `tests/cross-cutting/role-hierarchy-routes.test.ts` holds the route table
 * to. One row per route: the permission key it needs, and how to point a request at a resource
 * owned by a given person.
 *
 * Kept as data in one place so the two suites cannot disagree about which routes the rank rule
 * covers: a new write route on one of the seven modules is either a row here or an entry in
 * {@link UNOWNED_WRITES}, and the sweep fails until it is.
 */

import sharp from 'sharp';
import { assignRole } from '@modules/access';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { returnModel } from '@modules/returns/model';
import { createExample } from '@modules/example/tests/factories';
import { RETURN_POSTAGE_PAYERS } from '@modules/orders';

/** A person the request is aimed at: their account and the tenant role they hold, if any. */
export interface Owner {
    user: UserDocument;
    /** `null` for the platform-only account, which holds no shop role. */
    role: string | null;
}

/** A file a request carries as `multipart/form-data`, for a route whose handler reads one before the rank rule is asked. */
export interface HierarchyUpload {
    /** The form field the route reads. */
    field: string;
    /** The file's bytes. */
    bytes: Buffer;
}

/** One request, ready to send. */
export interface HierarchyRequest {
    method: 'put' | 'patch' | 'post' | 'delete';
    url: string;
    body?: Record<string, unknown>;
    /** Sent instead of `body`, as a multipart file. */
    upload?: HierarchyUpload;
}

/** One route the rank rule covers. */
export interface HierarchyRow {
    /** `${module} ${METHOD} ${path}`, spelled as `effectiveRouteTable` names the route. */
    route: string;
    /** The key the callers are the holders of: the route's own, or the one that makes a caller an operator. */
    key: string;
    /** `false` when a customer passes the route's own key (it mounts none, or a `self` key they hold). */
    keyed?: boolean;
    /**
     * `true` for a step that moves money: the caller's OWN thing is refused (`403 FORBIDDEN`,
     * "nobody handles their own money") rather than exempt, as it is for every other row.
     */
    selfRefused?: boolean;
    /** Builds the resource for `owner` and the request that changes it. */
    prepare: (owner: Owner) => Promise<HierarchyRequest>;
}

/** An order of `owner`'s, with one line, still pending. */
const orderOf = async (owner: Owner) =>
    createOrder(owner.user, [toOrderItem(await createProduct(), 1)]);

/** A return of `owner`'s order, in the given status. */
const returnOf = async (owner: Owner, status: 'requested' | 'approved') => {
    const order = await orderOf(owner);
    const [{ product }] = order.items;

    return returnModel.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        currency: 'EUR',
        status,
        reason: 'other',
        lines: [{ productId: product._id, quantity: 1, title: product.title, unitPrice: 10 }],
        returnPostage: RETURN_POSTAGE_PAYERS[0]
    });
};

/** A route addressed by an order id. */
const onOrder =
    (
        method: HierarchyRequest['method'],
        suffix: string,
        body?: Record<string, unknown>
    ): HierarchyRow['prepare'] =>
    async (owner) => ({
        method,
        url: `/orders/${String(await orderOf(owner).then((o) => o._id))}${suffix}`,
        body
    });

/** A route addressed by the owner's own account id. */
const onUser =
    (
        method: HierarchyRequest['method'],
        suffix: string,
        body: (owner: Owner) => Record<string, unknown> | undefined = () => undefined
    ): HierarchyRow['prepare'] =>
    (owner) =>
        Promise.resolve({ method, url: `/users/${owner.user.id}${suffix}`, body: body(owner) });

/** A delivery door, addressed by the order id. */
const onDelivery =
    (door: string, body: Record<string, unknown> = {}): HierarchyRow['prepare'] =>
    async (owner) => ({
        method: 'post',
        url: `/delivery/order/${String(await orderOf(owner).then((o) => o._id))}/${door}`,
        body
    });

/** A payments door, addressed by the order id. */
const onPayment =
    (door: string, body: Record<string, unknown> = {}): HierarchyRow['prepare'] =>
    async (owner) => ({
        method: 'post',
        url: `/payments/order/${String(await orderOf(owner).then((o) => o._id))}/${door}`,
        body
    });

/** A returns door, addressed by the return id. */
const onReturn =
    (
        door: string,
        status: 'requested' | 'approved',
        body: Record<string, unknown> = {}
    ): HierarchyRow['prepare'] =>
    async (owner) => ({
        method: 'post',
        url: `/returns/${String(await returnOf(owner, status).then((r) => r._id))}/${door}`,
        body
    });

/** An example of `owner`'s, in the draft state every example starts in. */
const exampleOf = (owner: Owner) => createExample({ userId: owner.user.id });

/** A route addressed by an example's id. */
const onExample =
    (
        method: HierarchyRequest['method'],
        suffix: string,
        body?: Record<string, unknown>
    ): HierarchyRow['prepare'] =>
    async (owner) => ({
        method,
        url: `/examples/${String(await exampleOf(owner).then((e) => e._id))}${suffix}`,
        body
    });

/** The cover upload: its handler needs a real image before the service, and so the rank rule, runs. */
const onExampleCover: HierarchyRow['prepare'] = async (owner) => ({
    method: 'put',
    url: `/examples/${String(await exampleOf(owner).then((e) => e._id))}/cover`,
    upload: {
        field: 'imageUpload',
        // sharp: build a 4x4 solid PNG in memory — https://sharp.pixelplumbing.com/api-constructor
        bytes: await sharp({
            create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } }
        })
            .png()
            .toBuffer()
    }
});

/** The rows. The route sweep holds this list to the real route table, so count and names matter. */
export const HIERARCHY_ROWS: readonly HierarchyRow[] = [
    {
        route: 'users PUT /:id',
        key: 'users.any.update',
        prepare: onUser('put', '', (o) => ({
            username: 'rank-check',
            role: o.role ?? 'customer',
            active: true
        }))
    },
    {
        route: 'users PATCH /:id',
        key: 'users.any.update',
        prepare: onUser('patch', '', () => ({ username: 'rank-check' }))
    },
    { route: 'users DELETE /:id', key: 'users.any.delete', prepare: onUser('delete', '') },
    {
        route: 'users DELETE /:id/hard',
        key: 'users.any.delete',
        prepare: onUser('delete', '/hard')
    },
    {
        route: 'users POST /:id/restore',
        key: 'users.any.delete',
        prepare: onUser('post', '/restore')
    },
    {
        route: 'users DELETE /',
        key: 'users.any.delete',
        prepare: (owner) =>
            Promise.resolve({ method: 'delete', url: '/users', body: { id: owner.user.id } })
    },
    {
        route: 'orders PUT /:id',
        key: 'orders.any.update',
        prepare: onOrder('put', '', { email: 'rank@check.test' })
    },
    {
        route: 'orders PATCH /:id',
        key: 'orders.any.update',
        prepare: onOrder('patch', '', { email: 'rank@check.test' })
    },
    { route: 'orders DELETE /:id', key: 'orders.any.delete', prepare: onOrder('delete', '') },
    {
        route: 'orders DELETE /:id/hard',
        key: 'orders.any.delete',
        prepare: onOrder('delete', '/hard')
    },
    {
        route: 'orders POST /:id/restore',
        key: 'orders.any.delete',
        prepare: onOrder('post', '/restore')
    },
    {
        route: 'orders DELETE /',
        key: 'orders.any.delete',
        prepare: async (owner) => ({
            method: 'delete',
            url: '/orders',
            body: { id: String(await orderOf(owner).then((o) => o._id)) }
        })
    },
    {
        route: 'orders POST /:id/status-override',
        key: 'orders.any.override',
        prepare: onOrder('post', '/status-override', { to: 'paid', reason: 'rank check' })
    },
    {
        route: 'orders POST /',
        key: 'orders.any.create',
        prepare: async (owner) => ({
            method: 'post',
            url: '/orders',
            body: {
                userId: owner.user.id,
                email: owner.user.email,
                items: [
                    { productId: String(await createProduct().then((p) => p._id)), quantity: 1 }
                ]
            }
        })
    },
    {
        route: 'orders POST /:id/cancel',
        key: 'orders.any.update',
        keyed: false,
        prepare: onOrder('post', '/cancel', {})
    },
    {
        route: 'delivery POST /order/:orderId/start',
        key: 'delivery.any.start',
        prepare: onDelivery('start')
    },
    {
        route: 'delivery POST /order/:orderId/ship',
        key: 'delivery.any.update',
        prepare: onDelivery('ship')
    },
    {
        route: 'delivery POST /order/:orderId/deliver',
        key: 'delivery.any.update',
        prepare: onDelivery('deliver')
    },
    {
        route: 'delivery POST /order/:orderId/fulfill',
        key: 'delivery.any.update',
        prepare: onDelivery('fulfill')
    },
    {
        route: 'payments POST /order/:orderId/refund',
        selfRefused: true,
        key: 'payments.any.update',
        prepare: onPayment('refund')
    },
    {
        route: 'payments POST /order/:orderId/offline',
        selfRefused: true,
        key: 'payments.any.create',
        prepare: onPayment('offline', { method: 'cash' })
    },
    {
        route: 'returns POST /:id/approve',
        selfRefused: true,
        key: 'returns.any.update',
        prepare: onReturn('approve', 'requested')
    },
    {
        route: 'returns POST /:id/decline',
        key: 'returns.any.update',
        prepare: onReturn('decline', 'requested', { reason: 'rank check' })
    },
    {
        route: 'returns POST /:id/receive',
        selfRefused: true,
        key: 'returns.any.receive',
        prepare: onReturn('receive', 'approved')
    },
    {
        route: 'example PUT /:id',
        keyed: false,
        key: 'examples.any.update',
        prepare: onExample('put', '', { title: 'rank check', body: 'rank check', status: 'draft' })
    },
    {
        route: 'example PATCH /:id',
        keyed: false,
        key: 'examples.any.update',
        prepare: onExample('patch', '', { title: 'rank check' })
    },
    {
        route: 'example DELETE /:id',
        keyed: false,
        key: 'examples.any.delete',
        prepare: onExample('delete', '')
    },
    {
        route: 'example PUT /:id/cover',
        keyed: false,
        key: 'examples.any.update',
        prepare: onExampleCover
    }
];

/**
 * The write routes of the seven modules that have NO owner for the rule to rank, each with the
 * reason — a create, a search that is a read in a POST, or a step only the customer takes. The
 * route sweep fails for a write route that is neither a row nor here.
 */
export const UNOWNED_WRITES: Readonly<Record<string, string>> = {
    'users POST /search': 'a read wearing a POST',
    'users POST /': 'creates an account; there is no owner yet',
    'orders POST /search': 'a read wearing a POST',
    'payments POST /webhook': 'the provider reporting an outcome, signed, no account',
    'payments POST /intent': 'the buyer’s own step, scoped to their own orders in the service',
    'payments POST /:id/confirm':
        'the payer’s own step, scoped to their own payments in the service',
    'payments POST /:id/sync': 'the payer’s own step, scoped to their own payments in the service',
    'returns POST /': 'the buyer opening a return on their own order',
    'api-keys POST /': 'mints a key for the caller themselves',
    'api-keys DELETE /:id': 'revoking only reduces access',
    'example POST /search': 'a read wearing a POST',
    'example POST /': 'creates an example for the caller themselves'
};

/** Creates an owner holding `role` in the shop (or nothing, when `role` is `null`). */
export const createOwner = async (
    name: string,
    role: string | null,
    platformRole?: string
): Promise<Owner> => {
    const user = await createUser(
        { email: `${name}@owners.test`, username: name, verifiedAt: new Date() },
        role ?? undefined
    );
    if (platformRole) await assignRole(user.id, null, 'platform', platformRole);

    return { user, role };
};
