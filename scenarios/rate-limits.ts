/**
 * @module
 * The rate-limit budgets a SCRIPT driving this API needs, as opposed to a person browsing it.
 *
 * Two callers, one reason: `scenarios/run-server.ts` serves the paired e2e suite, and
 * `scenarios/apply.ts` drives several hundred requests of its own to build the shop's history.
 * Both arrive from a single address in seconds, which every rung of the anti-automation ladder is
 * built to refuse — and a refusal lands on whatever request happened to be next, so the failure
 * reads as "login is broken" rather than "out of allowance".
 *
 * EVERY budget, not just the global one: each rung carries its own, and one left at its human
 * default throttles a script exactly as the global one would. `docs/tools/security.md` lists what
 * each bounds.
 *
 * Never for a deployment. Both callers refuse production — `run-server.ts` binds loopback with
 * throwaway secrets, and `apply.ts`'s first gate is `NODE_ENV === 'production'`.
 */

/**
 * What each budget is raised to.
 *
 * Far above the suites' own `1000` because of `run-server.ts`: ONE process serves the paired e2e
 * suite end to end, so its counters accumulate across every spec inside a sixty-second window,
 * and building the shop is several hundred requests before the first spec has even started.
 * `apply.ts` is the short-lived half and would be happy with far less.
 */
const SCRIPTED_MAX = '100000';

/**
 * Count IN MEMORY, never in the deployment's Redis.
 *
 * Two directions, both wrong without this. A seeder sharing the live buckets SPENDS a real
 * visitor's allowance — several hundred requests from the host, against a budget sized for one
 * person. And it inherits what everyone else already spent, so the build dies on a 429 earned by
 * traffic that was not its own. A counter that lives and dies with the process is the only one
 * that describes the process.
 *
 * The kill switch is explicit because the URL is INHERITED from the cache's: leaving a variable
 * unset cannot say "do not share counters" — see `rate-limit-store.ts`'s own note.
 */
const PRIVATE_COUNTERS = { NODE_RATE_LIMIT_REDIS_ENABLED: '0' };

/** Every rate-limit variable a scripted driver trips. */
const RAISED = [
    'NODE_RATE_LIMIT_MAX',
    'NODE_AUTH_RATE_LIMIT_MAX',
    'NODE_AUTH_RATE_LIMIT_ADDRESS_MAX',
    'NODE_AUTH_RATE_LIMIT_BLOCK_MAX',
    'NODE_SIGNUP_RATE_LIMIT_MAX',
    'NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX',
    'NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX',
    'NODE_RESET_RATE_LIMIT_MAX',
    'NODE_RESET_RATE_LIMIT_ADDRESS_MAX',
    'NODE_RESET_RATE_LIMIT_BLOCK_MAX',
    'NODE_SUBMISSION_RATE_LIMIT_MAX',
    'NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX',
    'NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX',
    'NODE_UPLOAD_RATE_LIMIT_MAX'
];

/** Every budget raised to {@link SCRIPTED_MAX}, plus {@link PRIVATE_COUNTERS}. */
export const SCRIPTED_RATE_LIMITS: Readonly<Record<string, string>> = {
    ...Object.fromEntries(RAISED.map((key) => [key, SCRIPTED_MAX])),
    ...PRIVATE_COUNTERS
};

/**
 * Bank transfer at checkout, which `GET /payments/methods` offers only where a deployment names
 * both of these — and the `shop` scenario's `order.awaitingTransfer` guarantee needs it offered.
 *
 * Fictional values: nobody can send money to a demo. A deployment that names its own in `.env`
 * keeps them, since both callers apply these only where nothing is set.
 */
export const DEMO_BANK_TRANSFER: Readonly<Record<string, string>> = {
    NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Demo Shop',
    NODE_BANK_TRANSFER_IBAN: 'IT60X0542811101000000123456'
};
