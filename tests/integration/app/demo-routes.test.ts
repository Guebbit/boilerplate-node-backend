/**
 * `installDemo`'s two routes, mounted on a throwaway Express app rather than the real
 * `src/app.ts`. Whether they are MOUNTED is a one-line structural fact
 * (`if (isDemoMode()) installDemo(app)`) already covered by `demo-outbox.test.ts`'s `isDemoMode`
 * unit tests; what this file proves is the route HANDLERS — the body validation and the status
 * codes a caller actually sees.
 */

import express from 'express';
import request from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { installDemo } from '@app/demo';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { productModel } from '@modules/products/model';
import { enabledModules } from '../../../src/modules';

setupTestDb();

// The default (no `scenario` in the body) reseeds `shop`, whose products write translations
// through the same manifest a real write validates against — see `scenarios/apply.ts`'s
// identical call for why this has to be built from `enabledModules` and handed in by hand.
beforeAll(() => setTranslatables(resolveTranslatables(enabledModules)));
afterAll(() => setTranslatables({}));

const testApp = () => {
    const app = express();
    app.use(express.json());
    installDemo(app);
    return app;
};

describe('POST /__test/restore', () => {
    it('refuses a scenario name it does not know, with a 400', async () => {
        const response = await request(testApp())
            .post('/__test/restore')
            .send({ scenario: 'not-a-real-scenario' });

        expect(response.status).toBe(400);
    });

    it('defaults to the shop scenario on an empty body', async () => {
        const response = await request(testApp()).post('/__test/restore').send({});

        expect(response.status).toBe(204);
        await expect(productModel.countDocuments()).resolves.toBeGreaterThan(0);
    }, 30_000);
});

describe('GET /__test/emails', () => {
    it('answers the outbox as JSON, empty on a freshly reset one', async () => {
        const response = await request(testApp()).get('/__test/emails');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ emails: [] });
    });
});
