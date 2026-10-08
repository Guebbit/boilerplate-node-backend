/**
 * `buildRateLimiter` and `chargeBudget` — how a declared budget becomes a limiter. Driven through
 * the built middleware with hand-made request and response stubs and the in-process store (the
 * suite blanks the `limits` Redis URL). The refusal's body and audit are pinned in `rate-limit.test.ts`.
 */
import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { resetEnvironment, setEnvironment } from '@tests/environment';
import {
    buildRateLimiter,
    chargeBudget,
    rateLimitInfoOf
} from '@infrastructure/http/middlewares/rate-limit';
import { logger } from '@infrastructure/adapters/logger';
import { rateLimitConfig } from '@infrastructure/http/config';
import type { RateLimitBudget } from '@types';

/** A budget on its own namespace and variable, so no case sees another's counter or limit. */
let sequence = 0;

/** Declares a budget that allows `limit` hits per `windowMs`, with `overrides` on top. */
const budgetOf = (limit: number, overrides: Partial<RateLimitBudget> = {}): RateLimitBudget => {
    sequence += 1;
    const environmentVariable = `UNIT_BUILD_LIMIT_${String(sequence)}`;
    setEnvironment({ [environmentVariable]: String(limit) });
    return {
        name: `Unit ${String(sequence)}`,
        namespace: `unit-build-${String(sequence)}`,
        environmentVariable,
        defaultMax: limit,
        windowMs: 60_000,
        keyedBy: 'address',
        bounds: 'unit',
        audited: false,
        ...overrides
    };
};

/** What one pass through the limiter did. */
interface Outcome {
    passed: boolean;
    status: number | undefined;
    headers: Record<string, unknown>;
    request: Request;
}

/**
 * Sends one request through `limiter` and reports whether it reached `next` or was refused.
 * The response is a stub whose `status().json()` is what the refusal handler calls.
 */
const hit = async (
    limiter: ReturnType<typeof buildRateLimiter>,
    extra: Record<string, unknown> = {},
    statusCode = 200
): Promise<Outcome> => {
    const headers: Record<string, unknown> = {};
    let status: number | undefined;
    // The library listens for `finish`/`close` on the response to settle a skipped-success count.
    const listeners = new Map<string, (() => void)[]>();
    const addListener = (event: string, listener: () => void): void => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    };
    const response = asStub<Response>({
        statusCode,
        on: addListener,
        once: addListener,
        headersSent: false,
        setHeader: (name: string, value: unknown) => {
            headers[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => headers[name.toLowerCase()],
        status: (code: number) => {
            status = code;
            return { json: () => undefined };
        }
    });
    const request = asStub<Request>({
        ip: '203.0.113.9',
        method: 'GET',
        path: '/x',
        headers: {},
        app: { get: () => false },
        ...extra
    });
    const passed = await new Promise<boolean>((resolve) => {
        const next: NextFunction = () => {
            resolve(true);
        };
        // `status()` is only called by the refusal; resolve false when it does.
        const original = response.status.bind(response);
        response.status = (code: number) => {
            resolve(false);
            return original(code);
        };
        void limiter(request, response, next);
    });
    // A passed request finishes; the library counts it as successful or failed on `finish`.
    if (passed) for (const listener of listeners.get('finish') ?? []) listener();
    await new Promise((resolve) => setImmediate(resolve));
    return { passed, status, headers, request };
};

/** Whether one request got through `limiter`. */
const passes = (...arguments_: Parameters<typeof hit>): Promise<boolean> =>
    hit(...arguments_).then((outcome) => outcome.passed);

/** Whole seconds a charge says to wait. */
const waitOf = (budget: RateLimitBudget, key: string): Promise<number> =>
    chargeBudget(budget, key).then((charge) => charge.retryAfterSeconds);

/** Whether a charge fit the budget. */
const fits = (budget: RateLimitBudget, key: string): Promise<boolean> =>
    chargeBudget(budget, key).then((charge) => charge.allowed);

afterEach(() => {
    resetEnvironment();
});

describe('buildRateLimiter — the limit', () => {
    it('lets `limit` requests through and refuses the next with 429', async () => {
        const limiter = buildRateLimiter(budgetOf(2));

        expect(await passes(limiter)).toBe(true);
        expect(await passes(limiter)).toBe(true);
        const refused = await hit(limiter);

        expect(refused.passed).toBe(false);
        expect(refused.status).toBe(429);
    });

    it('reads the limit from the budget variable at build time', async () => {
        const limiter = buildRateLimiter(budgetOf(1));

        await hit(limiter);

        expect(await passes(limiter)).toBe(false);
    });

    it('sends draft-7 RateLimit headers and no X-RateLimit-* ones', async () => {
        const { headers } = await hit(buildRateLimiter(budgetOf(5)));

        expect(headers.ratelimit).toEqual(expect.stringContaining('limit=5'));
        expect(headers['x-ratelimit-limit']).toBeUndefined();
    });
});

describe('buildRateLimiter — the window', () => {
    it('takes a numeric window as given', async () => {
        const { headers } = await hit(buildRateLimiter(budgetOf(5, { windowMs: 90_000 })));

        expect(headers['ratelimit-policy']).toEqual(expect.stringContaining('w=90'));
    });

    it('takes the shared window from NODE_RATE_LIMIT_WINDOW_MS for `shared`', async () => {
        const { headers } = await hit(buildRateLimiter(budgetOf(5, { windowMs: 'shared' })));

        expect(headers['ratelimit-policy']).toEqual(
            expect.stringContaining(
                `w=${String(rateLimitConfig().NODE_RATE_LIMIT_WINDOW_MS / 1000)}`
            )
        );
    });
});

describe('buildRateLimiter — skipSuccessfulRequests', () => {
    it('refunds a successful request when on, so only failures spend the budget', async () => {
        const limiter = buildRateLimiter(budgetOf(1, { skipSuccessfulRequests: true }));

        await hit(limiter);
        await hit(limiter);

        expect(await passes(limiter)).toBe(true);
    });

    it('keeps a failed request spent when on', async () => {
        const limiter = buildRateLimiter(budgetOf(1, { skipSuccessfulRequests: true }));

        await hit(limiter, {}, 401);

        expect(await passes(limiter, {}, 401)).toBe(false);
    });

    it('spends the budget on a successful request by default', async () => {
        const limiter = buildRateLimiter(budgetOf(1));

        await hit(limiter);

        expect(await passes(limiter)).toBe(false);
    });
});

describe('buildRateLimiter — optional hooks', () => {
    it('buckets by the budget keyGenerator when given', async () => {
        const limiter = buildRateLimiter(budgetOf(1, { keyGenerator: (request) => request.path }));

        await hit(limiter, { path: '/a' });

        expect(await passes(limiter, { path: '/b' })).toBe(true);
        expect(await passes(limiter, { path: '/a' })).toBe(false);
    });

    it('buckets by address when no keyGenerator is given', async () => {
        const limiter = buildRateLimiter(budgetOf(1));

        await hit(limiter, { ip: '198.51.100.1' });

        expect(await passes(limiter, { ip: '198.51.100.2' })).toBe(true);
    });

    it('asks the budget requestWasSuccessful what counts as success', async () => {
        const limiter = buildRateLimiter(
            budgetOf(1, { skipSuccessfulRequests: true, requestWasSuccessful: () => false })
        );

        await hit(limiter);

        expect(await passes(limiter)).toBe(false);
    });

    it('stores the limiter info under requestPropertyName', async () => {
        const { request } = await hit(
            buildRateLimiter(budgetOf(3, { requestPropertyName: 'unitInfo' }))
        );

        expect(rateLimitInfoOf(request, 'unitInfo')).toEqual(
            expect.objectContaining({ limit: 3, used: 1 })
        );
    });

    it('lets a skipped request through without counting it', async () => {
        const limiter = buildRateLimiter(
            budgetOf(1, { skip: (request) => request.path === '/skip' })
        );

        await hit(limiter, { path: '/skip' });
        await hit(limiter, { path: '/skip' });

        expect(await passes(limiter)).toBe(true);
    });
});

describe('buildRateLimiter — escalation', () => {
    it('doubles the lockout window of a key that hits the cap again', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
        try {
            const limiter = buildRateLimiter(
                budgetOf(1, { windowMs: 1000, escalation: { doublings: 2 } })
            );
            await hit(limiter);
            expect(await passes(limiter)).toBe(false);

            // First lockout (1 s) ends; the key is let back in, and the next lockout is longer.
            jest.advanceTimersByTime(1001);
            expect(await passes(limiter)).toBe(true);
            expect(await passes(limiter)).toBe(false);
            jest.advanceTimersByTime(1001);
            expect(await passes(limiter)).toBe(false);
            jest.advanceTimersByTime(1000);
            expect(await passes(limiter)).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('buildRateLimiter — store errors', () => {
    it('counts in memory by default, so the limit still holds', async () => {
        const limiter = buildRateLimiter(budgetOf(1));

        await hit(limiter);

        expect(await passes(limiter)).toBe(false);
    });
});

describe('chargeBudget', () => {
    it('allows hits up to the limit and refuses past it', async () => {
        const budget = budgetOf(2);

        expect(await fits(budget, 'k')).toBe(true);
        expect(await fits(budget, 'k')).toBe(true);
        expect(await fits(budget, 'k')).toBe(false);
    });

    it('keeps one tally per key', async () => {
        const budget = budgetOf(1);

        await chargeBudget(budget, 'a');

        expect(await fits(budget, 'b')).toBe(true);
    });

    it('counts every door of one budget in the same store', async () => {
        const budget = budgetOf(1);

        await chargeBudget(budget, 'k');

        expect(await fits({ ...budget }, 'k')).toBe(false);
    });

    it('answers whole seconds until reset, rounded up', async () => {
        const budget = budgetOf(1, { windowMs: 30_000 });

        const retryAfterSeconds = await waitOf(budget, 'k');

        expect(retryAfterSeconds).toBe(30);
    });

    it('answers a shared window from NODE_RATE_LIMIT_WINDOW_MS', async () => {
        const budget = budgetOf(1, { windowMs: 'shared' });

        const retryAfterSeconds = await waitOf(budget, 'k');

        expect(retryAfterSeconds).toBe(rateLimitConfig().NODE_RATE_LIMIT_WINDOW_MS / 1000);
    });

    it('never answers less than 1 second', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
        try {
            const budget = budgetOf(1, { windowMs: 1000 });
            await chargeBudget(budget, 'k');
            jest.advanceTimersByTime(999);

            expect(await waitOf(budget, 'k')).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('buildRateLimiter — express-rate-limit warnings', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("routes the library's misconfiguration report to our logger", async () => {
        const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        // An X-Forwarded-For with `trust proxy` off is the library's headline misconfiguration.
        await hit(buildRateLimiter(budgetOf(5)), {
            headers: { 'x-forwarded-for': '198.51.100.7' }
        });

        expect(error).toHaveBeenCalledWith(
            'rate-limit: express-rate-limit reports a misconfiguration',
            expect.anything()
        );
    });
});
