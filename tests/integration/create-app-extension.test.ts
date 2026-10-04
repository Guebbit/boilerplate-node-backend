/**
 * `createApp({ extension })` — what a process may bolt on: extra routes, mounted before the 404
 * catch-all. The demo profile's control surface is the only user; the property that matters for
 * production is the other direction, that an app built with none carries nothing extra. The step
 * between boot and listening (`afterBoot`) is the demo's first scenario build, covered by
 * `scenarios/demo-restore.test.ts`.
 */
import request from 'supertest';
import { createApp } from '../../src/app';

describe('createApp({ extension })', () => {
    it('mounts the extension’s routes ahead of the 404 catch-all', async () => {
        const { app } = createApp({
            extension: {
                install: (extended) => {
                    extended.get('/__extension', (_request, response) => {
                        response.json({ mounted: true });
                    });
                }
            }
        });

        const response = await request(app).get('/__extension');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mounted: true });
    });

    it('mounts nothing when no extension is passed', async () => {
        const { app } = createApp();

        const response = await request(app).get('/__extension');

        expect(response.status).toBe(404);
    });
});
