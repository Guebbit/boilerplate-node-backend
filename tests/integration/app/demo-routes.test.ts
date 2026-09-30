/**
 * `installDemo`'s two routes, mounted on a throwaway Express app rather than the real
 * `src/app.ts` — except for the mount-gate case below, which imports the real app instead.
 * `demo-outbox.test.ts`'s `isDemoMode` unit tests prove the boolean logic, refusing production
 * included; the mount-gate case here proves the HTTP behaviour a caller actually sees when the
 * flag is off, which a boolean assertion alone does not. What the rest of this file proves is the
 * route HANDLERS — the body validation and the status codes a caller sees once mounted.
 */

import express from 'express';
import request from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { installDemo } from '@app/demo';
import { installRequestParsing, installSecurity } from '@app/security';
import { installRequestContext } from '@app/request-context';
import { installRoutes } from '@app/routes';
import { installErrorHandling } from '@app/error-handling';
import { registerDemoClock, type DemoClock } from '@infrastructure/runtime/demo-clock';
import { productModel } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem, detachOrderUserId } from '@modules/orders/tests/factories';

/**
 * A one-shot switch: the next `emptyDatabase()` call rejects instead of doing its real work, then
 * un-arms itself. Named `mock*` — `jest.mock` below is hoisted above this file's imports and may
 * only close over identifiers with that prefix (see `tests/integration/two-factor.test.ts`).
 */
const mockFailNextEmptyDatabase = { armed: false };

jest.mock('@infrastructure/runtime/database-snapshot', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/runtime/database-snapshot')>(
        '@infrastructure/runtime/database-snapshot'
    );

    return {
        ...actual,
        emptyDatabase: () => {
            if (!mockFailNextEmptyDatabase.armed) return actual.emptyDatabase();
            mockFailNextEmptyDatabase.armed = false;
            return Promise.reject(new Error('emptyDatabase failed on purpose'));
        }
    };
});

setupTestDb();

// A `shop` build uploads a replacement product picture through the real route — the file is this test's to remove.
afterAll(emptyFileSandbox);

// The default (no `scenario` in the body) reseeds `shop`, whose products write translations
// through the same manifest a real write validates against. `@tests/http`'s `api` import (above)
// already pulls in the real `src/app.ts`, which registers every enabled module — including
// `products`' own `translatables` declaration — at import time, so nothing here builds that
// lookup by hand.

/**
 * A throwaway app carrying the demo surface and nothing else — enough for every case whose
 * subject is the route HANDLER: the body validation and the status codes a caller sees.
 */
const testApp = () => {
    const app = express();
    app.use(express.json());
    installDemo(app);
    return app;
};

/**
 * The same, plus the whole API behind it.
 *
 * Needed by exactly one case below, and the reason is what the demo profile now is: building
 * `shop` DRIVES the application — `POST /account/login`, `POST /cart/checkout` and two hundred
 * more — against the app `installDemo` was handed. An app carrying only `/__test/*` answers 404
 * to every one of them.
 */
const drivableApp = () => {
    const app = express();
    // The same installs `src/app.ts` makes, in the same order — `installRequestParsing` is what
    // parses a JSON body, so the flows' first login 500s without it.
    installSecurity(app);
    installRequestParsing(app);
    installRequestContext(app);
    installDemo(app);
    installRoutes(app);
    installErrorHandling(app);
    return app;
};

describe('the mount gate', () => {
    it('answers 404 when enableDemoProfile() was never called', async () => {
        // The real app, not `testApp()` above: `testApp()` calls `installDemo` directly, which
        // bypasses the gate this case exists to prove.
        const response = await api().post('/__test/restore');

        expect(response.status).toBe(404);
    });
});

describe('POST /__test/restore', () => {
    it('refuses a scenario name it does not know, with a 400', async () => {
        const response = await request(testApp())
            .post('/__test/restore')
            .send({ scenario: 'not-a-real-scenario' });

        expect(response.status).toBe(400);
    });

    it('defaults to the shop scenario on an empty body', async () => {
        const response = await request(drivableApp()).post('/__test/restore').send({});

        expect(response.status).toBe(204);
        await expect(productModel.countDocuments()).resolves.toBeGreaterThan(0);
        // Orders are not seeded by anything: their presence is what says the flows really ran.
        await expect(orderModel.countDocuments()).resolves.toBeGreaterThan(0);
    }, 120_000);

    it('answers 500 when the seed itself fails, and leaves the outbox untouched', async () => {
        mockFailNextEmptyDatabase.armed = true;
        const app = testApp();

        // 'blank' rather than 'shop': 'shop' is already cached by the test above, and a cached
        // restore never calls `emptyDatabase()` again — it would skip the failure this induces.
        const response = await request(app).post('/__test/restore').send({ scenario: 'blank' });

        expect(response.status).toBe(500);

        const emails = await request(app).get('/__test/emails');
        expect(emails.body).toEqual({ emails: [] });
    });
});

describe('POST /__test/jobs/:name', () => {
    it('refuses a job it does not carry, with a 404', async () => {
        const response = await request(testApp()).post('/__test/jobs/not-a-job');

        expect(response.status).toBe(404);
    });

    it('does not mistake an inherited property for a job', async () => {
        const response = await request(testApp()).post('/__test/jobs/constructor');

        expect(response.status).toBe(404);
    });

    it('reap-orders scrubs an order past its retention window and says how many', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await detachOrderUserId(String(user._id), new Date(Date.now() - 1000));

        const response = await request(testApp()).post('/__test/jobs/reap-orders');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ job: 'reap-orders', result: 1 });
        const scrubbed = await orderModel.findById(order._id);
        expect(scrubbed?.email).toBe('anonymized@deleted.invalid');
    });

    it('answers 0 when nothing is due', async () => {
        const response = await request(testApp()).post('/__test/jobs/reap-orders');

        expect(response.body).toEqual({ job: 'reap-orders', result: 0 });
    });
});

describe('GET /__test/emails', () => {
    it('answers the outbox as JSON, empty on a freshly reset one', async () => {
        const response = await request(testApp()).get('/__test/emails');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ emails: [] });
    });
});

/** A recording stand-in: the route's job is validation and plumbing, not time. */
const stubClock = (): DemoClock & { advanced: number[]; resets: number } => {
    const clock = {
        advanced: [] as number[],
        resets: 0,
        now: () => new Date('2030-01-01T00:00:00.000Z'),
        offsetMs: () => clock.advanced.reduce((total, ms) => total + ms, 0),
        advance: (ms: number) => {
            clock.advanced.push(ms);
        },
        reset: () => {
            clock.resets += 1;
        }
    };
    return clock;
};

describe('/__test/clock', () => {
    afterEach(() => {
        registerDemoClock(undefined);
    });

    it('answers 501 on both verbs when the process installed no clock', async () => {
        const app = testApp();

        await expect(request(app).get('/__test/clock')).resolves.toMatchObject({ status: 501 });
        await expect(
            request(app).post('/__test/clock').send({ advanceMs: 1000 })
        ).resolves.toMatchObject({ status: 501 });
    });

    it('reads the clock', async () => {
        registerDemoClock(stubClock());

        const response = await request(testApp()).get('/__test/clock');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ now: '2030-01-01T00:00:00.000Z', offsetMs: 0 });
    });

    it('moves it forward by advanceMs and reports the new offset', async () => {
        const clock = stubClock();
        registerDemoClock(clock);

        const response = await request(testApp()).post('/__test/clock').send({ advanceMs: 5000 });

        expect(response.status).toBe(200);
        expect(clock.advanced).toEqual([5000]);
        expect(response.body).toMatchObject({ offsetMs: 5000 });
    });

    it.each([
        ['a negative number', { advanceMs: -1 }],
        ['a string', { advanceMs: '5000' }],
        ['nothing', {}]
    ])('refuses %s, without touching the clock', async (_label, body) => {
        const clock = stubClock();
        registerDemoClock(clock);

        const response = await request(testApp()).post('/__test/clock').send(body);

        expect(response.status).toBe(400);
        expect(clock.advanced).toEqual([]);
    });

    it('is put back by a restore', async () => {
        const clock = stubClock();
        registerDemoClock(clock);

        await request(testApp()).post('/__test/restore').send({ scenario: 'blank' });

        expect(clock.resets).toBe(1);
    });
});
