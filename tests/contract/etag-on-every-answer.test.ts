/**
 * A create, a restore or an action answers the resource's REAL tag and names the resource in
 * `Content-Location` (RFC 9110 §8.8.3, §15.3.2, §6.4.2 rule 7), so the next edit needs no read.
 *
 * What the suite proves, through the real app:
 * - the tag an answer carries is accepted as `If-Match` on the resource it names (the strong claim:
 *   Express's byte-hash would be refused with 412);
 * - a write that answers no resource of its own carries no tag at all;
 * - an idempotent replay keeps both headers.
 *
 * The shared `afterEach` (`@tests/contract`) walks the spec on every answer here: a write whose
 * operation declares `ETag` must send it, and a write that sends one the spec never declares fails.
 */
import '@tests/contract';
import { declaredResponseHeaders, readSpec, listOperations } from '@tests/spec-walk';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

/** What a write answered, and who may follow it up. */
interface Answered {
    /** The write's own answer. */
    answer: { status: number; headers: Record<string, string> };
    /** The resource the answer's tag belongs to. */
    resource: string;
    /** The bearer that wrote it, which can also edit what it named. */
    bearer: string;
    /** A PATCH body the resource accepts, to put the tag to the test. */
    edit: Record<string, unknown>;
}

/** One write: how to make it, and the resource family whose edit proves the tag. */
interface Door {
    name: string;
    run: () => Promise<Answered>;
}

/** An admin edit of a user (`username`), of a product (`tags`), of an order or example. */
const EDITS = {
    user: { username: 'afterwards' },
    product: { tags: ['afterwards'] },
    order: { email: 'afterwards@example.com' },
    example: { title: 'Afterwards' },
    subscription: { description: 'afterwards' },
    language: { nativeName: 'Afterwards' },
    account: { username: 'afterwards' }
} as const;

/** A fresh user the admin may act on. */
const targetOf = (): Promise<string> =>
    createUser({ email: 'target@example.com', username: 'target' }).then((user) =>
        String(user._id)
    );

/** Posts `path` as `bearer`, with an optional body. */
const post = (path: string, bearer: string, body?: Record<string, unknown>) =>
    // No body at all for an action: it takes none, and a JSON content type would be refused with 415.
    api().post(path).set('Authorization', bearer).send(body);

/** A user door: an admin posts `path` to a fresh user and reads the user back. */
const userDoor = (name: string, path: string, body?: Record<string, unknown>): Door => ({
    name,
    run: async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await targetOf();
        const answer = await post(`/users/${id}${path}`, bearer, body);
        return { answer, resource: `/users/${id}`, bearer, edit: EDITS.user };
    }
});

/** A door that needs the user to be deactivated (or deleted) first. */
const userAfter = (name: string, setup: 'deactivate' | 'delete', path: string): Door => ({
    name,
    run: async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await targetOf();
        if (setup === 'deactivate') await post(`/users/${id}/deactivate`, bearer).expect(200);
        else await api().delete(`/users/${id}`).set('Authorization', bearer).expect(204);
        const answer = await post(`/users/${id}${path}`, bearer);
        return { answer, resource: `/users/${id}`, bearer, edit: EDITS.user };
    }
});

/** A language door: an admin registers `pt`, switches it off first when the door is `activate`. */
const languageDoor = (name: string, move: 'activate' | 'deactivate'): Door => ({
    name,
    run: async () => {
        const { bearer } = await authenticateAs('admin');
        await post('/locales', bearer, {
            tag: 'pt',
            name: 'Portuguese',
            nativeName: 'Português'
        }).expect(201);
        if (move === 'activate') await post('/locales/pt/deactivate', bearer).expect(200);
        const answer = await post(`/locales/pt/${move}`, bearer);
        return { answer, resource: '/locales/pt', bearer, edit: EDITS.language };
    }
});

/** The doors, one per family of answer the card lists. */
const DOORS: Door[] = [
    {
        name: 'POST /products (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/products', bearer, {
                price: '24.90',
                translations: { en: { title: 'Memory Foam Bed' } }
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.product
            };
        }
    },
    {
        name: 'POST /products/{id}/restore',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();
            const resource = `/products/${product.id}`;
            await api().delete(resource).set('Authorization', bearer).expect(204);
            const answer = await post(`${resource}/restore`, bearer);
            return { answer, resource, bearer, edit: EDITS.product };
        }
    },
    {
        name: 'POST /users (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/users', bearer, {
                email: 'located@example.com',
                username: 'located'
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.user
            };
        }
    },
    userDoor('POST /users/{id}/assign-role', '/assign-role', { role: 'support' }),
    userDoor('POST /users/{id}/place-purchase-hold', '/place-purchase-hold', {
        until: new Date(Date.now() + 86_400_000).toISOString()
    }),
    userDoor('POST /users/{id}/deactivate', '/deactivate'),
    userAfter('POST /users/{id}/activate', 'deactivate', '/activate'),
    userAfter('POST /users/{id}/restore', 'delete', '/restore'),
    {
        name: 'POST /orders (a create)',
        run: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const answer = await post('/orders', bearer, {
                userId: String(user._id),
                email: user.email,
                items: [{ productId: String(product._id), quantity: 1 }]
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.order
            };
        }
    },
    {
        name: 'POST /orders/{id}/cancel',
        run: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            const resource = `/orders/${String(order._id)}`;
            const answer = await post(`${resource}/cancel`, bearer);
            return { answer, resource, bearer, edit: EDITS.order };
        }
    },
    {
        name: 'POST /examples (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/examples', bearer, { title: 'First', body: 'Hello' });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.example
            };
        }
    },
    {
        name: 'POST /examples/{id}/publish',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const created = await post('/examples', bearer, { title: 'First', body: 'Hello' });
            const resource = created.headers['content-location'];
            const answer = await post(`${resource}/publish`, bearer);
            return { answer, resource, bearer, edit: EDITS.example };
        }
    },
    {
        name: 'POST /webhooks/subscriptions (a create)',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const answer = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.subscription
            };
        }
    },
    {
        name: 'POST /webhooks/subscriptions/{id}/secrets (a rotation)',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const created = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            const resource = created.headers['content-location'];
            const answer = await post(`${resource}/secrets`, bearer);
            return { answer, resource, bearer, edit: EDITS.subscription };
        }
    },
    languageDoor('POST /locales/{locale}/deactivate', 'deactivate'),
    languageDoor('POST /locales/{locale}/activate', 'activate'),
    {
        name: 'POST /account/email-change',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/account/email-change', bearer, {
                email: 'moved@example.com'
            });
            return { answer, resource: '/account', bearer, edit: EDITS.account };
        }
    },
    {
        name: 'POST /webhooks/subscriptions/{id}/disable',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const created = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            const resource = created.headers['content-location'];
            const answer = await post(`${resource}/disable`, bearer);
            return { answer, resource, bearer, edit: EDITS.subscription };
        }
    },
    {
        name: 'POST /webhooks/subscriptions/{id}/enable',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const created = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            const resource = created.headers['content-location'];
            await post(`${resource}/disable`, bearer).expect(200);
            const answer = await post(`${resource}/enable`, bearer);
            return { answer, resource, bearer, edit: EDITS.subscription };
        }
    },
    {
        name: 'POST /examples/{id}/archive',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const created = await post('/examples', bearer, { title: 'First', body: 'Hello' });
            const resource = created.headers['content-location'];
            await post(`${resource}/publish`, bearer).expect(200);
            const answer = await post(`${resource}/archive`, bearer);
            return { answer, resource, bearer, edit: EDITS.example };
        }
    },
    {
        name: 'POST /locales (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/locales', bearer, {
                tag: 'pt',
                name: 'Portuguese',
                nativeName: 'Português'
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.language
            };
        }
    }
];

/** The operation each door above exercises, which the contract walk below holds the spec to. */
const DOOR_OPERATIONS: Record<string, string> = {
    'POST /products (a create)': 'createProduct',
    'POST /products/{id}/restore': 'restoreProductById',
    'POST /users (a create)': 'createUser',
    'POST /users/{id}/assign-role': 'assignUserRole',
    'POST /users/{id}/place-purchase-hold': 'placeUserPurchaseHold',
    'POST /users/{id}/deactivate': 'deactivateUserById',
    'POST /users/{id}/activate': 'activateUserById',
    'POST /users/{id}/restore': 'restoreUserById',
    'POST /orders (a create)': 'createOrder',
    'POST /orders/{id}/cancel': 'cancelOrderById',
    'POST /examples (a create)': 'createExample',
    'POST /examples/{id}/publish': 'publishExample',
    'POST /examples/{id}/archive': 'archiveExample',
    'POST /webhooks/subscriptions (a create)': 'createWebhookSubscription',
    'POST /webhooks/subscriptions/{id}/secrets (a rotation)': 'createWebhookSubscriptionSecret',
    'POST /webhooks/subscriptions/{id}/enable': 'enableWebhookSubscription',
    'POST /webhooks/subscriptions/{id}/disable': 'disableWebhookSubscription',
    'POST /locales/{locale}/deactivate': 'deactivateLocale',
    'POST /locales/{locale}/activate': 'activateLocale',
    'POST /locales (a create)': 'createLocale',
    'POST /account/email-change': 'requestEmailChange'
};

describe('a create, a restore or an action answers the real tag of the resource it names', () => {
    it.each(DOORS)('$name', async ({ run }) => {
        const { answer, resource, bearer, edit } = await run();

        expect(answer.status).toBeLessThan(300);
        expect(answer.headers['content-location']).toBe(resource);
        const tag = answer.headers.etag;

        // The tag is accepted as If-Match on the resource it names: Express's byte-hash would 412.
        await api()
            .patch(resource)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send(edit)
            .expect(200);
    });
});

/**
 * Doors whose body no GET repeats byte for byte: a subscription's create and rotation carry the
 * one-time secret, and the account read moves its own digest on every call (`lastActiveAt`).
 */
const NOT_REPEATED_BY_A_GET = new Set([
    'POST /webhooks/subscriptions (a create)',
    'POST /webhooks/subscriptions/{id}/secrets (a rotation)',
    'POST /account/email-change'
]);

describe('the answer is what a GET on its Content-Location returns right after (RFC 9110 §8.7)', () => {
    // The tag is a digest of the exact body, so equal tags mean equal bodies.
    it.each(DOORS.filter(({ name }) => !NOT_REPEATED_BY_A_GET.has(name)))(
        '$name',
        async ({ run }) => {
            const { answer, resource, bearer } = await run();

            const read = await api().get(resource).set('Authorization', bearer);

            expect(read.headers.etag).toBe(answer.headers.etag);
        }
    );
});

/**
 * Schemas that restate a versioned resource's fields flat instead of `$ref`-ing it, so the walk
 * cannot see the likeness: the answer's schema, and the versioned schema it is a copy of.
 */
const FLAT_COPIES: Record<string, string> = {
    // A subscription plus the one-time secret (flat: `allOf` of two closed objects fails ajv).
    WebhookSubscriptionCreated: 'WebhookSubscription',
    // The PUT/PATCH answer; the read adds the abilities and the idle clock.
    Account: 'AccountView'
};

/** Writes that answer a versioned resource and are untagged on purpose, with the reason. */
const EXEMPT: Record<string, string> = {
    signup: 'answers an account nobody can edit yet, and may answer a refused address the same way'
};

/**
 * Tagged writes with no door above, each held to its header by the shared `afterEach` wherever a
 * contract test calls it (a declared header that is not sent fails the answer). A new tagged write
 * is not on this list until someone says where its tag is proven.
 */
const NO_DOOR: Record<string, string> = {
    checkout: 'the cart contract tests',
    processOrder: 'the delivery contract tests',
    unarchiveExample: 'the example module contract tests',
    restoreOrderById: 'the orders contract tests',
    overrideOrderStatus: 'the orders contract tests',
    revokeUserRole: 'the users contract tests',
    liftUserPurchaseHold: 'the users contract tests'
};

/** The schema name a 2xx answer's JSON body refers to, if it refers to one. */
const bodySchemaName = (response: unknown): string | undefined =>
    // Narrowing a parsed YAML node the compiler cannot see into: only `$ref` is read from it.
    (response as { content?: Record<string, { schema?: { $ref?: string } }> }).content?.[
        'application/json'
    ]?.schema?.$ref
        ?.split('/')
        .pop();

/** The first 2xx status an operation declares. */
const successStatus = (responses: Record<string, unknown>): string | undefined =>
    Object.keys(responses).find((status) => status.startsWith('2'));

/**
 * Whether a path reads one resource whose writes take `If-Match`: it ends in a path parameter or
 * is the caller's own account, and its PUT or PATCH declares the header. A list or a dictionary
 * also sends an `ETag`, and so does an address, but neither is edited under a tag.
 */
const isVersionedRead = (route: string): boolean => {
    const item = readSpec().paths[route];
    const takesIfMatch = ['put', 'patch'].some((method) =>
        JSON.stringify(item[method] ?? {}).includes('#/components/parameters/IfMatchHeader')
    );
    return (/\/\{\w+\}$/.test(route) || route === '/account') && takesIfMatch;
};

/** Every operation with the schema its 2xx body names, from the bundled contract. */
const answers = () => {
    const spec = readSpec();
    const headers = declaredResponseHeaders(spec);
    const operations = listOperations(spec);
    return operations.flatMap(({ path: route, method, operationId }) => {
        const operation = spec.paths[route][method] as { responses: Record<string, unknown> };
        const status = successStatus(operation.responses);
        const schema = status ? bodySchemaName(operation.responses[status]) : undefined;
        return operationId && status && schema
            ? [{ route, operationId, method, schema, sent: headers[operationId][status] }]
            : [];
    });
};

describe('the contract: every write that answers a versioned resource declares its tag', () => {
    const walked = answers();
    // A versioned schema is one a GET hands out with an ETag.
    const versioned = new Set(
        walked
            .filter(
                ({ method, sent, route }) =>
                    method === 'get' && sent.includes('etag') && isVersionedRead(route)
            )
            .map(({ schema }) => schema)
    );
    const isVersioned = (schema: string) =>
        versioned.has(schema) || versioned.has(FLAT_COPIES[schema]);

    it('finds versioned resources to hold writes against', () => {
        // A walk that matches nothing would pass vacuously.
        expect(versioned.size).toBeGreaterThan(3);
    });

    const writes = walked.filter(
        // A PUT answer never carries a validator (RFC 9110 §9.3.4), and a delete is not tagged.
        ({ method, schema, operationId }) =>
            !['get', 'put', 'delete'].includes(method) &&
            isVersioned(schema) &&
            !(operationId in EXEMPT)
    );

    it('has a door, or a named place where its tag is proven, for every POST it holds', () => {
        const doors = new Set(Object.values(DOOR_OPERATIONS));
        const unproven = writes
            // An edit's own answer is held by `tests/integration/conditional-writes.test.ts`.
            .filter(({ method }) => method === 'post')
            .filter(({ operationId }) => !doors.has(operationId) && !(operationId in NO_DOOR))
            .map(({ operationId }) => operationId);

        expect(unproven).toEqual([]);
        // A walk that saw no write would pass vacuously.
        expect(writes.filter(({ method }) => method === 'post').length).toBeGreaterThan(10);
    });

    it('names only doors that exist', () => {
        expect(Object.keys(DOOR_OPERATIONS).toSorted()).toEqual(
            DOORS.map(({ name }) => name).toSorted()
        );
    });

    it.each(writes)('$method $operationId', ({ method, sent }) => {
        // A PATCH is a write on the resource's own URI, so it needs no `Content-Location`.
        const expected = method === 'patch' ? ['etag'] : ['etag', 'content-location'];

        expect(sent).toEqual(expect.arrayContaining(expected));
    });
});

describe('a write that answers no resource of its own carries no tag', () => {
    it('answers a search, which Express would hash, without an ETag', async () => {
        const { bearer } = await authenticateAs('admin');

        const answer = await post('/products/search', bearer).expect(200);

        expect(answer.headers).not.toHaveProperty('etag');
        expect(answer.headers).not.toHaveProperty('content-location');
    });

    it('answers a signup, real or not, tagless (nothing to edit yet)', async () => {
        const answer = await api().post('/account/signup').send({
            email: 'joiner@example.com',
            username: 'joiner',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(answer.status).toBe(201);
        expect(answer.headers).not.toHaveProperty('etag');
        expect(answer.headers).not.toHaveProperty('content-location');
    });
});

describe('an idempotent replay of a create keeps its tag and its Content-Location', () => {
    it('sends both again, marked as a replay', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const send = () =>
            api()
                .post('/orders')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'tagged-create-1')
                .send({
                    userId: String(user._id),
                    email: user.email,
                    items: [{ productId: String(product._id), quantity: 1 }]
                });

        const first = await send();
        const second = await send();

        expect(second.headers['idempotent-replayed']).toBe('true');
        expect(second.headers.etag).toBe(first.headers.etag);
        expect(second.headers['content-location']).toBe(first.headers['content-location']);
    });
});
