/**
 * Contract assertions: judges real HTTP responses against `openapi.yaml`.
 *
 * `tests/support/response-contract.ts` is the judge — the orval-generated, per-status Zod schemas,
 * made strict by `orval.config.ts`. This file is only the AUTOMATIC wiring on top of it: an
 * explicit assertion at every call site would mean a call nobody writes is a response nobody
 * checks. `patchSupertestThen` below makes it automatic instead: EVERY response a contract-suite
 * file receives over `api()` is captured, then judged in one shared `afterEach` — including the
 * ones a test only used for setup (a login, a seed write) that nobody thought to assert on
 * directly.
 *
 * Usage: `import '@tests/contract';` — nothing else. A response that fails the contract fails
 * whichever `it()` produced it, from `afterEach`, exactly as if it had its own assertion.
 *
 * The fuzz suite (`tests/fuzz/endpoints.fuzz.test.ts`) does NOT import this file: it needs the
 * judge to throw INSIDE `fast-check`'s property function, so a mismatch shrinks to the smallest
 * failing input, and calls `assertResponseMatchesContract` from `./response-contract` directly.
 */
import supertest from 'supertest';
import type { Response } from 'supertest';
import { asStub } from './stub';
import { assertResponseMatchesContract } from './response-contract';

/** Responses captured so far this test — reset in `beforeEach`, judged and cleared in `afterEach`. */
let responsesThisTest: Response[] = [];

/**
 * Excludes ONE already-captured response from this test's automatic contract check — for a
 * response that is a genuine, deliberate DEVIATION from the spec (see the call site's own comment
 * for which), never for a tooling gap: `assertResponseMatchesContract` already skips what isn't its
 * job (an undeclared path) and matches a redirect or a binary body against the `zod.unknown()`
 * orval emits for them. Rare on purpose: the whole point of the automatic check is that a call site
 * does not get to opt out silently, so every use of this needs its own paper trail.
 */
export const excludeFromSpecCheck = (response: Response): void => {
    responsesThisTest = responsesThisTest.filter((candidate) => candidate !== response);
};

/**
 * The shape of `supertest.Test`'s inherited `.then` (superagent's `RequestBase.prototype.then`,
 * https://github.com/ladjs/superagent/blob/master/src/request-base.js) — restated here because
 * `@types/supertest` declares it as a class member, not a value this file can otherwise reference
 * the type of before reassigning it below.
 */
type SupertestThen = (
    this: unknown,
    onFulfilled?: ((value: Response) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
) => Promise<unknown>;

/**
 * Monkey-patches `supertest.Test.prototype.then` — the ONE method every `await api()...` call
 * resolves through, regardless of HTTP verb — so every response a contract-suite file receives is
 * captured before the caller ever sees it. Scoped safely despite patching a shared prototype: Jest
 * gives every test FILE its own module registry (`setupTestDb`'s own doc note says the same for its
 * hooks), so this runs once per file that imports `@tests/contract`, never for a file that doesn't.
 *
 * One cast, through the sanctioned seam: `Test.prototype.then` is typed as a class member, not a
 * reassignable property, so `asStub` is what narrows it to a value this file can read and patch.
 */
const patchSupertestThen = (): void => {
    const testPrototype = asStub<{ then: SupertestThen }>(supertest.Test.prototype);
    const originalThen = testPrototype.then;

    // Deliberately patching supertest's OWN thenable, not creating a new one — that is the whole
    // mechanism this function exists for.
    // eslint-disable-next-line unicorn/no-thenable -- patches an existing thenable, not a new one
    testPrototype.then = function (onFulfilled, onRejected) {
        return originalThen.call(
            this,
            (response: Response) => {
                responsesThisTest.push(response);
                return onFulfilled ? onFulfilled(response) : response;
            },
            onRejected
        );
    };
};

/** Install the supertest patch once, when this setup file loads. */
patchSupertestThen();

/** Jest `beforeEach`: start each test with no recorded responses. */
beforeEach(() => {
    responsesThisTest = [];
});

/** Jest `afterEach`: every response this test received must match the contract. */
afterEach(() => {
    for (const response of responsesThisTest) assertResponseMatchesContract(response);
});
