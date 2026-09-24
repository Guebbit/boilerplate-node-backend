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
import { installDemo } from '@app/demo';
import { installRequestParsing, installSecurity } from '@app/security';
import { installRequestContext } from '@app/request-context';
import { installRoutes } from '@app/routes';
import { installErrorHandling } from '@app/error-handling';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { productModel } from '@modules/products/model';
import { orderModel } from '@modules/orders/model';
import { enabledModules } from '../../../src/modules';

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

// The default (no `scenario` in the body) reseeds `shop`, whose products write translations
// through the same manifest a real write validates against — see `scenarios/apply.ts`'s
// identical call for why this has to be built from `enabledModules` and handed in by hand.
beforeAll(() => setTranslatables(resolveTranslatables(enabledModules)));
afterAll(() => setTranslatables({}));

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

describe('GET /__test/emails', () => {
    it('answers the outbox as JSON, empty on a freshly reset one', async () => {
        const response = await request(testApp()).get('/__test/emails');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ emails: [] });
    });
});
