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
 * ── The multipart operations, sent as urlencoded ────────────────────────────────────────
 * Every `multipart/form-data` operation here ALSO declares an `application/json` variant, and
 * `readInput`'s decode rule (`docs/theory/request-input.md`#"Only the string transports are
 * decoded") coerces a string-typed boolean/array ONLY for a real multipart body. The second
 * `describe.each` below sends the same hostile, spec-valid arbitrary as
 * `application/x-www-form-urlencoded`, a type none of them declares: the 415 guard
 * (`docs/api/write-methods.md`) must refuse it before a controller sees a single field.
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
    type Operation,
    type SchemaNode
} from '@tests/spec-walk';
import { bodyArbitraryFor, queryArbitraryFor } from '@tests/spec-arbitraries';
import { FUZZ_RUNS_PER_OPERATION } from '@tests/knobs';
import { seedWorld, buildUrl, type World } from '@tests/spec-world';
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
    const parsed = raw ? Number(raw) : NaN;
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1e9);
    // eslint-disable-next-line no-console -- the reproduction seed must reach the terminal even where the logger is mocked
    console.log(`[fuzz] seed=${seed} (rerun with RANDOM_DATA_SEED=${seed} to reproduce)`);
    return seed;
})();

const OPERATIONS = listOperations();

/** Stands in for "this operation takes no request body". */
const NO_BODY = fc.constant(undefined);

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

/** Which of an operation's declared request bodies a fuzzed request carries. */
interface BodyVariant {
    /** The schema the body is drawn from. */
    schema: SchemaNode | undefined;
    /** Sent as `Content-Type` when set; superagent's JSON default otherwise. */
    contentType?: string;
}

/** The `application/json` body every operation declares. */
const jsonBody = (operation: Operation): BodyVariant => ({ schema: operation.bodySchema });

/** The `application/merge-patch+json` body a PATCH declares beside its JSON one. */
const mergePatchBody = (operation: Operation): BodyVariant => ({
    schema: operation.mergePatchSchema,
    contentType: 'application/merge-patch+json'
});

/**
 * Fires every drawn request for one operation as one caller and hands each response to `check`.
 *
 * @param operation - what to call
 * @param bearer - the caller's `Authorization` header value, or undefined for no credentials
 * @param world - the rows the path parameters name
 * @param runs - how many requests
 * @param check - the assertions every response must pass
 * @param variant - which declared body to send; the JSON one unless told otherwise
 */
const fuzzAs = (
    operation: Operation,
    bearer: string | undefined,
    world: World,
    runs: number,
    check: (response: Awaited<ReturnType<ReturnType<typeof api>['get']>>) => void,
    variant: BodyVariant = jsonBody(operation)
) => {
    const url = buildUrl(operation, world);
    return fc.assert(
        fc.asyncProperty(
            fc.tuple(
                bodyArbitraryFor(variant.schema) ?? NO_BODY,
                queryArbitraryFor(operation.queryParameters)
            ),
            async ([body, query]: Draw) => {
                const target = query ? `${url}?${query}` : url;
                const request = api()[operation.method](target).set('Accept-Language', 'en');
                if (bearer) request.set('Authorization', bearer);
                if (variant.contentType) request.type(variant.contentType);

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
 * The merge-patch variant of every PATCH that declares one (`docs/api/write-methods.md`). The
 * same field schemas as the JSON body, but a different content type — and a different reading of
 * `null` (clear) — so it is its own route through the body parser and the write.
 */
const MERGE_PATCH_FUZZABLE = OPERATIONS.filter((operation) => operation.mergePatchSchema);

describe('the merge-patch operations', () => {
    it('are all PATCH, and there are some', () => {
        // Same guard as the multipart one: a walk that stopped reading the variant would pass empty.
        expect(MERGE_PATCH_FUZZABLE.length).toBeGreaterThan(0);
        expect(MERGE_PATCH_FUZZABLE.every((operation) => operation.method === 'patch')).toBe(true);
    });
});

describe.each(
    MERGE_PATCH_FUZZABLE.map((operation) => [`PATCH ${operation.path}`, operation] as const)
)('%s (merge-patch)', (_label, operation) => {
    it('never answers 5xx, and always answers something the spec documents — as an admin', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const world = await seedWorld(user);

        await fuzzAs(
            operation,
            bearer,
            world,
            FUZZ_RUNS_PER_OPERATION,
            neverCrashesOffContract,
            mergePatchBody(operation)
        );
    }, 120_000);
});

/*
 * The multipart operations' JSON-shaped variant, sent as urlencoded — see the module doc.
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
    it('refuses it with 415, and always answers something the spec documents', async () => {
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
                    // `probe` keeps the encoded body non-empty: an empty one has no bytes for the guard to judge.
                    .send({ ...(body as Record<string, unknown>), probe: 'x' });

                expect(response.status).toBe(415);
                assertResponseMatchesContract(response);
            }),
            { seed: SEED, numRuns: FUZZ_RUNS_PER_OPERATION, endOnFailure: true }
        );
    }, 120_000);
});
