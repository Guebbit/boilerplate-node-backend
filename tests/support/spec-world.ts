/**
 * The rows a spec-driven request can name, and the URL that names them.
 *
 * Shared by the fuzz suite and the write-operation contract walk: both take a templated path from
 * `openapi.yaml` and need `{id}` to mean something that exists, so a handler runs past its 404.
 */
import { randomUUID } from 'node:crypto';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import type { UserDocument } from '@modules/users';
import type { Operation } from './spec-walk';

/** A syntactically valid ObjectId nothing holds — for a path whose resource kind is not seeded. */
export const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/** The rows a fuzzed path can name, created fresh for each operation. */
export interface World {
    productId: string;
    orderId: string;
    userId: string;
}

/**
 * A product, an order for it owned by `owner`, and a second user — enough for most `{id}` paths
 * to name something that exists. Per operation, because every test starts on an empty database.
 *
 * @param owner - who the order belongs to (the admin the first pass runs as)
 */
export const seedWorld = async (owner: UserDocument): Promise<World> => {
    const product = await createProduct({ onHand: 50 });
    const order = await createOrder(owner, [toOrderItem(product, 1)]);
    const other = await createUser({ email: 'fuzz-target@example.com', username: 'fuzz-target' });
    return {
        productId: String(product._id),
        orderId: String(order._id),
        userId: String(other._id)
    };
};

/** Fixed values for the path parameters that are not ids. */
const LITERAL_PARAMETERS: Record<string, string> = {
    locale: 'en',
    entityType: 'product',
    method: 'totp',
    provider: 'fake',
    // A tenant this deployment serves — an unknown one is refused before the body is read.
    tenant: 'demo-be'
};

/**
 * The value for one path parameter: a literal where the spec's vocabulary is fixed, the seeded row
 * whose kind the path names, and a well-formed id nothing holds otherwise — a 404 is a fine
 * outcome, a 500 is not.
 *
 * @param path - the templated path, which says what kind of row `{id}` is
 * @param name - the parameter
 * @param world - the rows seeded for this operation
 */
const parameterValue = (path: string, name: string, world: World): string => {
    if (name in LITERAL_PARAMETERS) return LITERAL_PARAMETERS[name];
    if (name.toLowerCase().includes('token')) return 'tok';
    if (name === 'productId' || /^\/(products|wishlist|cart)\//.test(path)) return world.productId;
    if (name === 'orderId' || path.startsWith('/orders/')) return world.orderId;
    if (path.startsWith('/users/')) return world.userId;
    // `entityType` is fixed to `product` above, so the entity is the seeded product.
    if (path.startsWith('/locales/translations/')) return world.productId;
    return OBJECT_ID;
};

/**
 * A legal value for every header the operation requires. A fresh value each call: the only
 * required header today is `Idempotency-Key`, and a reused one replays or mismatches.
 */
export const requiredHeadersOf = (operation: Operation): Record<string, string> =>
    Object.fromEntries(operation.requiredHeaders.map((name) => [name, randomUUID()]));

/** Fill every path parameter from {@link parameterValue}. */
export const buildUrl = (operation: Operation, world: World): string => {
    let url = operation.path;
    for (const name of operation.pathParameters)
        url = url.replace(`{${name}}`, () => parameterValue(operation.path, name, world));
    return url;
};
