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
 * `fast-check`, the supertest harness, and `jest-openapi`'s `toSatisfyApiSpec()` — rather than
 * adding a Python toolchain that every copy of this boilerplate would inherit.
 *
 * ── Why it is not in `npm run test` ──────────────────────────────────────────────────────────
 * It is slow and it is a HUNTER, not a gate: a failure here is usually a real finding that needs a
 * person to read it, not a red X that should block a merge. Same reasoning as mutation testing.
 * It runs nightly, and on demand via `npm run test:fuzz`.
 *
 * ── What it deliberately does not cover ──────────────────────────────────────────────────────
 * `multipart/form-data` operations are skipped: their bodies are files, `fast-check` has nothing
 * useful to say about a PNG, and the upload path already has `tests/integration/upload-security.
 * test.ts` driving real magic-byte checks. The count is asserted below so "skipped" cannot quietly
 * become "skipped everything".
 */
import fc from 'fast-check';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
// Imported for its side effect: it calls `jestOpenAPI(openapi.yaml)`, which is what
// registers the `toSatisfyApiSpec()` matcher used below.
import '@tests/contract';
import { listOperations, unsupportedKeywords, type IOperation } from '@tests/spec-walk';
import { bodyArbitraryFor } from '@tests/spec-arbitraries';

setupTestDb();

/**
 * Runs per operation. Deliberately small: 55 operations × N requests × a real in-memory Mongo,
 * and the auth rate limiter is raised but finite (`tests/support/setup.ts`). Raise it when
 * hunting something specific, not as a default.
 */
const RUNS_PER_OPERATION = 12;

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
    // eslint-disable-next-line no-console
    console.log(`[fuzz] seed=${seed} (rerun with RANDOM_DATA_SEED=${seed} to reproduce)`);
    return seed;
})();

const OPERATIONS = listOperations();

/** Stands in for "this operation takes no request body". */
const NO_BODY = fc.constant(undefined);

/** A syntactically valid ObjectId, so `{id}` paths reach the handler rather than a CastError. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/** Fill path parameters with something well-formed; the handler's 404 is a fine outcome. */
const buildUrl = (operation: IOperation): string => {
    let url = operation.path;
    for (const name of operation.pathParameters)
        url = url.replace(`{${name}}`, name.toLowerCase().includes('token') ? 'tok' : OBJECT_ID);
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

describe.each(
    FUZZABLE.map(
        (operation) => [`${operation.method.toUpperCase()} ${operation.path}`, operation] as const
    )
)('%s', (_label, operation) => {
    it('never answers 5xx, and always answers something the spec documents', async () => {
        const { bearer } = await authenticateAs('admin');
        const bodyArbitrary = bodyArbitraryFor(operation.bodySchema);
        const url = buildUrl(operation);

        await fc.assert(
            fc.asyncProperty(bodyArbitrary ?? NO_BODY, async (body) => {
                const request = api()
                    [operation.method](url)
                    .set('Authorization', bearer)
                    .set('Accept-Language', 'en');

                const response = await (body === undefined || body === null
                    ? request
                    : request.send(body as object));

                // 1. No crash. This is the finding worth hunting: a spec-valid request that
                //    reaches an unhandled throw.
                expect(response.status).toBeLessThan(500);

                // 2. The response matches the contract — shape AND status. An undocumented
                //    status is as much a contract break as an undeclared field, and
                //    `additionalProperties: false` on 95 schemas makes the shape check real.
                expect(response).toSatisfyApiSpec();
            }),
            { seed: SEED, numRuns: RUNS_PER_OPERATION, endOnFailure: true }
        );
    }, 120_000);
});
