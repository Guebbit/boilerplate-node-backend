/**
 * The concurrency harness.
 *
 * Every other suite in this repo asks "does this operation do the right thing?". These ask "does
 * it still do the right thing when N of it happen at once?" — a question mutation testing
 * structurally cannot answer, because a mutation run executes one mutant against a serial suite.
 *
 * `Promise.allSettled`, never `Promise.all`. The whole point of a race is that some participants
 * lose, and losing is the normal, correct outcome: nine of ten signups for one address MUST fail.
 * `Promise.all` rejects on the first rejection and discards every other result, which throws away
 * precisely the outcomes being asserted.
 *
 * Two things worth knowing before changing anything here:
 *
 *  - **`--runInBand` serialises test FILES, not the requests inside a test.** `npm run
 *    test:integration` passes it so the in-memory Mongo is not shared by parallel workers. It
 *    does nothing to `Promise.allSettled` inside one test, which is still genuinely concurrent.
 *    Removing the flag would not make these tests "more concurrent"; it would make them flaky for
 *    an unrelated reason.
 *
 *  - **The rate limiters are raised, not disabled** (`tests/helpers/setup.ts`). `authRateLimiter`
 *    is mounted on exactly the endpoints these tests hammer, at 10 per IP per window by default,
 *    with `skipSuccessfulRequests`. At that budget an N=10 signup race sits exactly on the limit
 *    and N=12 starts returning 429s — and the test would still PASS, because "not two users" is
 *    trivially true when two of the requests never reached the handler. A race test truncated by
 *    a limiter is a green test that measured nothing, so the assertions below count 4xx codes by
 *    value and reject 429 explicitly rather than lumping it into "not a success".
 */
import type { Response } from 'supertest';

/** How many participants a race gets by default. Enough to contend, small enough to stay quick. */
export const RACE_SIZE = 10;

/**
 * Fire `count` copies of the same request simultaneously and return every outcome.
 *
 * The requests are BUILT first and awaited second, deliberately: supertest starts a request when
 * it is awaited (it is a thenable, not a promise), so building them in a loop and handing the
 * whole array to `allSettled` is what makes them overlap. Awaiting inside the loop would produce
 * a sequential suite that looks concurrent.
 *
 * @param count - number of simultaneous participants
 * @param build - produces the request for participant `index`
 */
export const raceN = <T>(count: number, build: (index: number) => PromiseLike<T>) =>
    Promise.allSettled(Array.from({ length: count }, (_, index) => build(index)));

/**
 * The HTTP status of each participant, sorted ascending.
 *
 * A rejected participant reports as 0, which never collides with a real status and makes a
 * transport-level failure visible in the assertion rather than silently absent from it.
 */
export const statuses = (results: PromiseSettledResult<Response>[]): number[] =>
    results
        .map((result) => (result.status === 'fulfilled' ? result.value.status : 0))
        .toSorted((left, right) => left - right);

/** How many participants answered with exactly this status. */
export const countStatus = (results: PromiseSettledResult<Response>[], status: number): number =>
    statuses(results).filter((value) => value === status).length;

/**
 * Assert the shape every race must have, whatever else it asserts.
 *
 * Three properties, and each one has been a real bug in some codebase:
 *
 *  - **no 5xx.** A race resolved by the database refusing a write is correct; a race resolved by
 *    the process throwing is a 500 on an ordinary user action. Closing the signup race without
 *    first teaching `databaseErrorInterpreter` about E11000 would produce exactly that, which is
 *    why the interpreter changed first.
 *  - **no 429.** See the header: a limiter that truncates the race makes the test vacuous.
 *  - **nobody crashed the connection.** A rejected supertest promise (status 0) means the server
 *    never answered at all.
 */
export const expectNoServerErrors = (results: PromiseSettledResult<Response>[]): void => {
    const observed = statuses(results);

    expect(observed.filter((status) => status >= 500)).toEqual([]);
    expect(observed.filter((status) => status === 429)).toEqual([]);
    expect(observed.filter((status) => status === 0)).toEqual([]);
};
