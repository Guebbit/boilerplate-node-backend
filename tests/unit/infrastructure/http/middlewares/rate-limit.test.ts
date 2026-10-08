/**
 * `src/infrastructure/http/middlewares/rate-limit.ts` — the budgets no one module owns (the
 * global brake, the api-key budget, the upload budget). Every other module's own budgets are
 * pinned in that module's own `tests/unit/rate-limits.test.ts` (e.g.
 * `src/modules/account/tests/unit/rate-limits.test.ts`); the relationships BETWEEN a module's
 * budget and this file's global one — "stays a small fraction of the browsing budget" — are
 * cross-cutting and live in `tests/cross-cutting/rate-limit-budgets.test.ts`. The metrics scrape
 * guard, `isMetricsScraper`, lives in `src/modules/observability` — it guards one module's own
 * route, not a shared budget — and is pinned in that module's own
 * `tests/unit/metrics-scraper.test.ts`.
 */
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { rateLimitConfig } from '@infrastructure/http/config';
import { withoutEnvironment } from '@tests/environment';
import {
    addressBlockOf,
    identityOf,
    DEFAULT_RATE_LIMIT_MAX,
    DEFAULT_API_KEY_RATE_LIMIT_MAX,
    DEFAULT_UPLOAD_RATE_LIMIT_MAX,
    INFRASTRUCTURE_RATE_LIMITS,
    KEYED_BY_ADDRESS,
    KEYED_BY_ADDRESS_BLOCK,
    KEYED_BY_AUTHENTICATED_ACCOUNT,
    KEYED_BY_CHALLENGE,
    KEYED_BY_SUBMITTED_EMAIL,
    accountIdOf,
    readBodyField,
    refuseRateLimited
} from '@infrastructure/http/middlewares/rate-limit';
import { recordAudit, coreAuditActions } from '@infrastructure/observability/audit';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { rateLimitRefusalsTotal } from '@infrastructure/observability/metrics-rate-limit';

// Only the audit write is replaced; the action names stay real so a renamed action fails here.
jest.mock('@infrastructure/observability/audit', () => ({
    ...jest.requireActual<object>('@infrastructure/observability/audit'),
    recordAudit: jest.fn()
}));

describe('rate limit defaults', () => {
    it('measures the browsing budget per minute', () =>
        // The window is the load-bearing half of the pair: the same 100 requests spread over a
        // quarter of an hour is a session quota an ordinary browsing session trips. Unset first:
        // `tests/support/setup-environment.ts` raises it tenfold for the suites.
        withoutEnvironment(['NODE_RATE_LIMIT_WINDOW_MS'], () => {
            expect(rateLimitConfig().NODE_RATE_LIMIT_WINDOW_MS).toBe(60 * 1000);
            expect(DEFAULT_RATE_LIMIT_MAX).toBe(100);
            return Promise.resolve();
        }));

    it('keeps the upload budget a small fraction of the browsing budget', () => {
        expect(DEFAULT_UPLOAD_RATE_LIMIT_MAX).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 2);
    });

    it('sizes the api-key budget above the upload budget, below the browsing one', () => {
        // A partner integration's steady state is well above one browsing session but must never
        // out-run the address-keyed global brake layered on top of it.
        expect(DEFAULT_API_KEY_RATE_LIMIT_MAX).toBeGreaterThan(DEFAULT_UPLOAD_RATE_LIMIT_MAX);
        expect(DEFAULT_API_KEY_RATE_LIMIT_MAX).toBeLessThan(DEFAULT_RATE_LIMIT_MAX * 2);
    });
});

/*
 * The behavioural property — a SUCCESSFUL request spending the budget — sends a real request
 * through `express-rate-limit`'s middleware, which `no-restricted-imports` treats as an
 * integration concern: see `src/modules/feedback/tests/integration/submission-rate-limit.test.ts`.
 */

/** A request as a limiter sees it: `body` is whatever the parsers left, `ip` the caller. */
const requestWith = (body: unknown, ip: string) => asStub<Request>({ body, ip });

/** A request as the global budget's `skip` sees it: only `method` and `path` matter. */
const requestFor = (method: string, path: string) => asStub<Request>({ method, path });

/**
 * The global browsing budget's own `skip` — an orchestrator's `/livez` and `/readyz` probes, on a fixed
 * interval, must never trip the budget every other caller shares.
 */
describe("the global budget's skip", () => {
    const globalBudget = INFRASTRUCTURE_RATE_LIMITS.find(
        (budget) => budget.name === 'Browsing (global)'
    );

    it('exempts GET /readyz', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/readyz'))).toBe(true);
    });

    it('does not exempt other methods on /readyz', () => {
        expect(globalBudget?.skip?.(requestFor('POST', '/readyz'))).toBe(false);
    });

    it('exempts GET /livez, and not POST', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/livez'))).toBe(true);
        expect(globalBudget?.skip?.(requestFor('POST', '/livez'))).toBe(false);
    });

    it('does not exempt GET on any other path', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/products'))).toBe(false);
    });
});

/** The block a caller at `ip` is bucketed in. */
const blockOf = (ip: string | undefined) => addressBlockOf(asStub<Request>({ ip }));

describe('addressBlockOf', () => {
    // Node listens dual-stack, so on a direct deploy every IPv4 caller is `::ffff:a.b.c.d`. It used
    // to fall past the /24 mask and get a bucket of its own per address.
    it('puts an IPv4-mapped caller in its IPv4 /24, the same block as the plain address', () => {
        expect(blockOf('::ffff:203.0.113.5')).toBe('203.0.113.0/24');
        expect(blockOf('::ffff:203.0.113.77')).toBe(blockOf('203.0.113.5'));
        expect(blockOf('203.0.113.5')).toBe('203.0.113.0/24');
    });

    it('treats the hex spelling of a mapped address the same way', () => {
        expect(blockOf('::ffff:cb00:7105')).toBe('203.0.113.0/24');
    });

    it('keeps two IPv4 blocks apart', () => {
        expect(blockOf('203.0.113.5')).not.toBe(blockOf('203.0.114.5'));
    });

    it('buckets an IPv6 caller by its /64', () => {
        expect(blockOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
        expect(blockOf('2001:db8:1:2::1')).toBe(blockOf('2001:db8:1:2:ffff::9'));
        expect(blockOf('2001:db8:1:3::1')).not.toBe(blockOf('2001:db8:1:2::1'));
    });

    it('gives a request with no address one stable key instead of throwing', () => {
        expect(blockOf(undefined)).toBe('unknown');
    });
});

describe('identityOf', () => {
    it('never keys on a bare sha256 of the email — a Redis dump must not be dictionary-attackable', () => {
        const bare = createHash('sha256').update('ada@example.com').digest('hex');
        const key = identityOf(requestWith({ email: 'ada@example.com' }, '1.2.3.4'));

        expect(key).toMatch(/^[\da-f]{64}$/);
        expect(key).not.toBe(bare);
    });

    it('buckets one account the same however its email is cased', () => {
        expect(identityOf(requestWith({ email: 'Ada@Example.com' }, '1.2.3.4'))).toBe(
            identityOf(requestWith({ email: 'ada@example.com ' }, '5.6.7.8'))
        );
    });

    it('buckets an attempt naming nobody by its address block, not one shared bucket', () => {
        // An unparsed multipart body is exactly this: nothing to read.
        const first = identityOf(requestWith({}, '1.2.3.4'));

        expect(first).toBe(identityOf(requestWith(undefined, '1.2.3.200')));
        expect(first).not.toBe(identityOf(requestWith({}, '9.9.9.9')));
    });
});

/** Reads `rate_limit_refusals_total` for one budget namespace. */
const refusalsOf = (namespace: string) =>
    rateLimitRefusalsTotal
        .get()
        .then(
            (metric) => metric.values.find((value) => value.labels.budget === namespace)?.value ?? 0
        );

/** A response stub that keeps what the envelope sent. */
const capturingResponse = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { response: asStub<Response>({ status }), status, json };
};

describe('refuseRateLimited', () => {
    it('counts every refusal against its budget, audited or not', async () => {
        const before = await refusalsOf('metric-test-global');
        const handler = refuseRateLimited({ namespace: 'metric-test-global', audited: false });

        handler(requestFor('GET', '/x'), capturingResponse().response);
        handler(requestFor('GET', '/x'), capturingResponse().response);

        expect(await refusalsOf('metric-test-global')).toBe(before + 2);
    });

    it("keeps one budget's refusals out of another's count", async () => {
        const before = await refusalsOf('metric-test-other');

        refuseRateLimited({ namespace: 'metric-test-global', audited: false })(
            requestFor('GET', '/x'),
            capturingResponse().response
        );

        expect(await refusalsOf('metric-test-other')).toBe(before);
    });
});

describe('identityOf — what a credential attempt names', () => {
    it('falls back to the address block for a non-string or blank email', () => {
        const fallback = identityOf(requestWith({}, '1.2.3.4'));

        expect(identityOf(requestWith({ email: 42 }, '1.2.3.4'))).toBe(fallback);
        expect(identityOf(requestWith({ email: '   ' }, '1.2.3.4'))).toBe(fallback);
        expect(fallback).toBe('anon:1.2.3.0/24');
    });

    it('keys on username when email is absent, folded the same way', () => {
        expect(identityOf(requestWith({ username: ' Ada@Example.com' }, '1.2.3.4'))).toBe(
            identityOf(requestWith({ email: 'ada@example.com' }, '9.9.9.9'))
        );
    });
});

/** A request on a route, for the audit metadata. */
const routeRequest = () =>
    asStub<Request>({ method: 'POST', path: '/upload', ip: '1.2.3.4', headers: {} });

describe('refuseRateLimited — the answer a caller and the audit trail see', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('records one failed SECURITY_RATE_LIMIT_HIT audit for an audited budget', () => {
        refuseRateLimited({ namespace: 'audited-test', audited: true })(
            routeRequest(),
            capturingResponse().response
        );

        expect(recordAudit).toHaveBeenCalledTimes(1);
        expect(recordAudit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                action: coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                outcome: 'failure',
                metadata: { route: '/upload', method: 'POST' }
            })
        );
    });

    it('records no audit for an unaudited budget, and still answers 429', () => {
        const { response, status } = capturingResponse();

        refuseRateLimited({ namespace: 'quiet-test', audited: false })(routeRequest(), response);

        expect(recordAudit).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(429);
    });

    it('answers the shared error envelope with the RATE_LIMITED code', () => {
        const { response, json } = capturingResponse();

        refuseRateLimited({ namespace: 'envelope-test', audited: false })(routeRequest(), response);

        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                status: 429,
                errors: [expect.objectContaining({ code: 'RATE_LIMITED' })]
            })
        );
    });

    it('logs the refusal even when it is not audited', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

        refuseRateLimited({ namespace: 'log-test', audited: false })(
            routeRequest(),
            capturingResponse().response
        );

        expect(warn).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ status_code: 429 })
        );
    });
});

/** The infrastructure budget with this `name`. */
const budgetNamed = (name: string) => {
    const found = INFRASTRUCTURE_RATE_LIMITS.find((budget) => budget.name === name);
    if (!found) throw new Error(`no budget named ${name}`);
    return found;
};

describe('the three budgets this file owns — what each one declares', () => {
    it.each([
        ['Browsing (global)', 'global', 'NODE_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX, false],
        [
            'Api-key requests',
            'api-key',
            'NODE_API_KEY_RATE_LIMIT_MAX',
            DEFAULT_API_KEY_RATE_LIMIT_MAX,
            true
        ],
        [
            'Image uploads',
            'uploads',
            'NODE_UPLOAD_RATE_LIMIT_MAX',
            DEFAULT_UPLOAD_RATE_LIMIT_MAX,
            true
        ]
    ])(
        '%s: namespace, variable, default, shared window, audit',
        (name, namespace, variable, max, audited) => {
            const budget = budgetNamed(name);

            expect(budget).toMatchObject({
                namespace,
                environmentVariable: variable,
                defaultMax: max,
                windowMs: 'shared',
                audited
            });
            expect(budget.bounds).toMatch(/\S/);
            expect(budget.keyedBy).toMatch(/\S/);
        }
    );

    it('lets only the global brake pass while its store is down', () => {
        expect(budgetNamed('Browsing (global)').onStoreError).toBe('pass');
        expect(budgetNamed('Api-key requests').onStoreError).toBeUndefined();
        expect(budgetNamed('Image uploads').onStoreError).toBeUndefined();
    });

    it('keys the global and upload budgets on the address, the api-key budget on its credential', () => {
        expect(budgetNamed('Browsing (global)').keyedBy).toBe(KEYED_BY_ADDRESS);
        expect(budgetNamed('Image uploads').keyedBy).toBe(KEYED_BY_ADDRESS);
        expect(budgetNamed('Api-key requests').keyedBy).toMatch(/credential/);
        expect(
            budgetNamed('Api-key requests').keyGenerator?.(
                asStub<Request>({ credentialId: 'key-1' })
            )
        ).toBe('key-1');
    });

    it('gives every keyedBy label words, and no two labels the same words', () => {
        const labels = [
            KEYED_BY_ADDRESS,
            KEYED_BY_ADDRESS_BLOCK,
            KEYED_BY_SUBMITTED_EMAIL,
            KEYED_BY_AUTHENTICATED_ACCOUNT,
            KEYED_BY_CHALLENGE
        ];

        for (const label of labels) expect(label).toMatch(/\S/);
        expect(new Set(labels).size).toBe(labels.length);
    });
});

describe('accountIdOf and readBodyField', () => {
    it("keys on the caller's authenticated account", () => {
        expect(accountIdOf(asStub<Request>({ authContext: { id: 'acc-1' } }))).toBe('acc-1');
    });

    it.each([[null], ['text'], [42], [undefined]])(
        'reads no field off a body that is %p',
        (body) => {
            expect(readBodyField(asStub<Request>({ body }), 'email')).toBeUndefined();
        }
    );

    it('reads a string field and ignores a non-string one', () => {
        const request = asStub<Request>({ body: { email: 'a@b.c', age: 3 } });

        expect(readBodyField(request, 'email')).toBe('a@b.c');
        expect(readBodyField(request, 'age')).toBeUndefined();
    });
});

describe('refuseRateLimited — what the refusal says', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('names the rate-limit rung in the log and sends the localised message', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        const { response, json } = capturingResponse();

        refuseRateLimited({ namespace: 'say-test', audited: false })(routeRequest(), response);

        expect(warn).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ rung: 'rate-limit' })
        );
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [expect.objectContaining({ message: t('generic.error-rate-limited') })]
            })
        );
        expect(t('generic.error-rate-limited')).toMatch(/\S/);
    });
});
