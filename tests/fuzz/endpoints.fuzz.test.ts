/**
 * Spec-driven fuzzing (L5).
 *
 * ── What this asks ───────────────────────────────────────────────────────────────────────────
 * For every operation `openapi.yaml` declares, throw generated **spec-valid but hostile** requests
 * at the real app and assert two things:
 *
 *   1. it never answers **5xx** — a well-formed request must not crash the server;
 *   2. the response **matches the spec**, including its status code.
 *
 * ── Why it is worth having ───────────────────────────────────────────────────────────────────
 * Every other suite tests endpoints somebody wrote a test for. This one tests endpoints nobody
 * wrote a test for, including ones added after it was written: the list comes from
 * `listOperations()`, which walks the spec. Add a route to `openapi.yaml` and it is covered on the
 * next run, with no list to remember to update.
 *
 * That auto-discovery is the property that made `schemathesis` tempting. It is achieved here in
 * TypeScript instead, by reusing four things this repo already has — the spec itself,
 * `fast-check`, the supertest harness, and the orval-generated, per-status Zod schemas
 * `tests/support/response-contract.ts` judges a response against — rather than adding a Python
 * toolchain that every copy of this boilerplate would inherit.
 *
 * ── Three callers, not one ───────────────────────────────────────────────────────────────────
 * Every operation is fuzzed as an admin, as a plain customer, and with no credentials. The admin
 * pass reaches the deepest code; the other two ask whether a caller the operation is NOT for gets
 * the refusal the spec documents — 401 without credentials where a token is required — rather
 * than a crash or an answer. Path parameters name REAL rows (a product, an order, a user) where
 * the path says which kind, so a handler runs past its 404; query parameters are drawn from the
 * spec like bodies are.
 *
 * ── Where it runs ─────────────────────────────────────────────────────────────────────────────
 * In `npm run test` — so in the merge gate — at `TEST_FUZZ_RUNS`' small default, and nightly in
 * `.github/workflows/fuzz.yml` at a much larger one. A failure is usually a real finding.

 * ── What it deliberately does not cover ──────────────────────────────────────────────────────
 * The FILE half of a `multipart/form-data` operation is skipped: its body is a file, `fast-check`
 * has nothing useful to say about a PNG, and the upload path already has
 * `tests/integration/upload-security.test.ts` driving real magic-byte checks. The count is
 * asserted below so "skipped" cannot quietly become "skipped everything".
 *
 * ── S13: the multipart operations, fuzzed anyway ─────────────────────────────────────────────
 * Every `multipart/form-data` operation here ALSO declares an `application/json` variant — a
 * create/update with no file — and `readInput`'s decode rule
 * (`docs/theory/request-input.md`#"Only the string transports are decoded") coerces a
 * string-typed boolean/array ONLY for a real multipart body; a `application/x-www-form-urlencoded`
 * one is treated exactly like JSON, untouched. The second `describe.each` below sends the same
 * hostile, spec-valid arbitrary as urlencoded instead of JSON — the one transport that is
 * genuinely still untested here, since every field arrives as a bare string without ever being a
 * real file upload.
 */
import fc from 'fast-check';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
// Not `@tests/contract`: that file's automatic afterEach would judge these same responses a
// second time. Calling the judge directly, inside the property function, is what lets `fast-check`
// shrink a mismatch to the smallest failing input instead of reporting from an unrelated afterEach.
import { assertResponseMatchesContract } from '@tests/response-contract';
import {
    listOperations,
    ungeneratablePatterns,
    unsupportedKeywords,
    type Operation
} from '@tests/spec-walk';
import { bodyArbitraryFor, queryArbitraryFor } from '@tests/spec-arbitraries';
import { FUZZ_RUNS_PER_OPERATION } from '@tests/knobs';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import type { UserDocument } from '@modules/users';
import { markServerListening } from '@infrastructure/runtime/readiness';

// No real Chromium here, and a missing browser is not what this suite hunts: the invoice route
// with a REAL order renders, and the stub would answer every request 500. Same stand-in the
// orders contract suite uses.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

// `GET /readyz` answers 503 until `src/app.ts`'s real boot marks the process listening, which
// never runs under `NODE_ENV=test` (`tests/support/http.ts`). Marked ready once, here, so the
// sweep below fuzzes it the way every other operation is fuzzed — as a route actually serving
// traffic — rather than tripping `neverCrashesOffContract`'s "no 5xx" invariant on every run.
markServerListening();

/**
 * One seed for the file, so a failure is reproducible rather than a story about last Tuesday.
 *
 * Rolled fresh per run unless `RANDOM_DATA_SEED` pins it, and printed either way — the same
 * contract `tests/support/contract-data.ts` follows, and the same variable name the paired frontend
 * reads for `npm run test:e2e:random`. One vocabulary across three generative suites and two repos,
 * so a seed quoted from a failing nightly means something wherever it is pasted.
 *
 * Rolling rather than pinning is deliberate: a fixed seed tests the same 660 requests forever, which
 * is a regression test wearing a fuzzer's name. The cost is that a failure needs its seed to
 * reproduce, which is why the seed is logged before the first case runs.
 */
const SEED = (() => {
    const raw = process.env.RANDOM_DATA_SEED;
    const parsed = raw ? Number(raw) : Number.NaN;
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1e9);
    // eslint-disable-next-line no-console -- the reproduction seed must reach the terminal even where the logger is mocked
    console.log(`[fuzz] seed=${seed} (rerun with RANDOM_DATA_SEED=${seed} to reproduce)`);
    return seed;
})();

const OPERATIONS = listOperations();

/** Stands in for "this operation takes no request body". */
const NO_BODY = fc.constant(undefined);

/** A syntactically valid ObjectId nothing holds — for a path whose resource kind is not seeded. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/** The rows a fuzzed path can name, created fresh for each operation. */
interface World {
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
const seedWorld = async (owner: UserDocument): Promise<World> => {
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
    provider: 'fake'
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

/** Fill every path parameter from {@link parameterValue}. */
const buildUrl = (operation: Operation, world: World): string => {
    let url = operation.path;
    for (const name of operation.pathParameters)
        url = url.replace(`{${name}}`, parameterValue(operation.path, name, world));
    return url;
};

describe('the spec walk itself', () => {
    it('finds every operation in the document', () => {
        // A walk that silently found nothing would make this entire file pass in milliseconds.
        expect(OPERATIONS.length).toBeGreaterThan(40);
    });

    it('uses no JSON Schema keyword the arbitrary builder ignores', () => {
        // The tripwire described in `spec-walk.ts`: an unknown keyword means the generator stops
        // constraining a field, the endpoint rightly 422s everything, and the suite goes green
        // while testing nothing. Failing here is the signal to teach the builder or drop to a
        // real OpenAPI tool.
        expect(unsupportedKeywords()).toEqual([]);
    });

    it('declares no pattern the arbitrary builder cannot build a string for', () => {
        // One level below the keyword tripwire: `pattern` IS understood, but a lookaround one is
        // more than `fc.stringMatching` can compile, so the field is omitted and its endpoint
        // 422s every run while this suite stays green. Register a sample in
        // `tests/support/pattern-samples.ts` — `contract-data.ts` reads the same table.
        expect(ungeneratablePatterns()).toEqual([]);
    });

    it('skips only the multipart operations', () => {
        const skipped = OPERATIONS.filter((operation) => operation.isMultipart);

        expect(skipped.length).toBeGreaterThan(0);
        expect(skipped.length).toBeLessThan(OPERATIONS.length / 4);
    });
});

/*
 * The fuzz itself, one jest case per operation so a failure names the endpoint rather than
 * reporting "something, somewhere, returned 500".
 */
const FUZZABLE = OPERATIONS.filter((operation) => !operation.isMultipart);

/** Requests per operation for the two refused callers — the refusal rarely depends on the body. */
const REFUSED_CALLER_RUNS = Math.max(1, Math.ceil(FUZZ_RUNS_PER_OPERATION / 4));

/** One fuzzed request: what was drawn for its body and its query string. */
type Draw = [body: unknown, query: string];

/**
 * Fires every drawn request for one operation as one caller and hands each response to `check`.
 *
 * @param operation - what to call
 * @param bearer - the caller's `Authorization` header value, or undefined for no credentials
 * @param world - the rows the path parameters name
 * @param runs - how many requests
 * @param check - the assertions every response must pass
 */
const fuzzAs = (
    operation: Operation,
    bearer: string | undefined,
    world: World,
    runs: number,
    check: (response: Awaited<ReturnType<ReturnType<typeof api>['get']>>) => void
) => {
    const url = buildUrl(operation, world);
    return fc.assert(
        fc.asyncProperty(
            fc.tuple(
                bodyArbitraryFor(operation.bodySchema) ?? NO_BODY,
                queryArbitraryFor(operation.queryParameters)
            ),
            async ([body, query]: Draw) => {
                const target = query ? `${url}?${query}` : url;
                const request = api()[operation.method](target).set('Accept-Language', 'en');
                if (bearer) request.set('Authorization', bearer);

                check(await (body === undefined || body === null ? request : request.send(body)));
            }
        ),
        { seed: SEED, numRuns: runs, endOnFailure: true }
    );
};

/**
 * The two properties every response must have, whoever asked:
 *   1. no 5xx — a well-formed request must not reach an unhandled throw;
 *   2. it matches the contract, status included — `assertResponseMatchesContract` fails on an
 *      undocumented status exactly as it does on a documented one whose body doesn't fit.
 *
 * A binary body (the invoice PDF) needs no special case: orval emits `zod.unknown()` for a
 * response with no JSON schema of its own, which any body satisfies.
 */
const neverCrashesOffContract = (response: Awaited<ReturnType<ReturnType<typeof api>['get']>>) => {
    expect(response.status).toBeLessThan(500);
    assertResponseMatchesContract(response);
};

describe.each(
    FUZZABLE.map(
        (operation) => [`${operation.method.toUpperCase()} ${operation.path}`, operation] as const
    )
)('%s', (_label, operation) => {
    it('never answers 5xx, and always answers something the spec documents — as an admin', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const world = await seedWorld(user);

        await fuzzAs(operation, bearer, world, FUZZ_RUNS_PER_OPERATION, neverCrashesOffContract);
    }, 120_000);

    it('does the same for a plain customer, whom most of the surface refuses', async () => {
        const { user: admin } = await authenticateAs('admin');
        const world = await seedWorld(admin);
        const { bearer } = await authenticateAs('user');

        await fuzzAs(operation, bearer, world, FUZZ_RUNS_PER_OPERATION, neverCrashesOffContract);
    }, 120_000);

    it('answers 401 without credentials where the spec requires them, and never crashes', async () => {
        const { user: admin } = await authenticateAs('admin');
        const world = await seedWorld(admin);

        await fuzzAs(operation, undefined, world, REFUSED_CALLER_RUNS, (response) => {
            neverCrashesOffContract(response);
            if (operation.requiresAuth) expect(response.status).toBe(401);
        });
    }, 120_000);
});

/*
 * S13: the multipart operations' JSON-shaped variant, sent as urlencoded — see the module doc.
 * Every one of these also declares an `application/json` body, so `bodySchema` is always present.
 */
const MULTIPART_FUZZABLE = OPERATIONS.filter(
    (operation) => operation.isMultipart && operation.bodySchema
);

describe('the multipart operations, urlencoded', () => {
    it('fuzzes more than zero of them', () => {
        // Mirrors "skips only the multipart operations" above: a walk that stopped finding any
        // dual-content-type operation would make this whole block pass by testing nothing.
        expect(MULTIPART_FUZZABLE.length).toBeGreaterThan(0);
    });
});

describe.each(
    MULTIPART_FUZZABLE.map(
        (operation) => [`${operation.method.toUpperCase()} ${operation.path}`, operation] as const
    )
)('%s (urlencoded)', (_label, operation) => {
    it('never answers 5xx, and always answers something the spec documents', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const world = await seedWorld(user);
        // Every MULTIPART_FUZZABLE operation has a bodySchema by construction (the filter above).
        const bodyArbitrary = bodyArbitraryFor(operation.bodySchema)!;
        const url = buildUrl(operation, world);

        await fc.assert(
            fc.asyncProperty(bodyArbitrary, async (body) => {
                // superagent: `.type('form')` serialises the body as
                // `application/x-www-form-urlencoded` via `qs.stringify`, the same encoding
                // `express.urlencoded({ extended: true })` (app/security.ts) decodes with — so a
                // nested field round-trips through bracket notation rather than flattening.
                // https://ladjs.github.io/superagent/#request-body
                const response = await api()
                    [operation.method](url)
                    .set('Authorization', bearer)
                    .set('Accept-Language', 'en')
                    .type('form')
                    .send(body as Record<string, unknown>);

                expect(response.status).toBeLessThan(500);
                assertResponseMatchesContract(response);
            }),
            { seed: SEED, numRuns: FUZZ_RUNS_PER_OPERATION, endOnFailure: true }
        );
    }, 120_000);
});
