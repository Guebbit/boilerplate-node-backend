/**
 * `require-enabled.ts` — the gate every `/webhooks` route sits behind. Owns the one property the
 * toggle promises: on, it passes straight through; off, it refuses with 403 and the
 * `WEBHOOKS_DISABLED` code — a switched-off feature, never a 404.
 */

import type { Request } from 'express';
import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import { requireWebhooksEnabled } from '@modules/webhooks/require-enabled';

/** Saved so each case's flag does not leak into another suite. */
const ORIGINAL = process.env.NODE_WEBHOOKS_ENABLED;

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NODE_WEBHOOKS_ENABLED;
    else process.env.NODE_WEBHOOKS_ENABLED = ORIGINAL;
});

describe('requireWebhooksEnabled', () => {
    it('passes through when the feature is on — the default with the var unset', () => {
        delete process.env.NODE_WEBHOOKS_ENABLED;
        const next = jest.fn();
        const response = makeResponseStub();

        requireWebhooksEnabled(asStub<Request>({}), response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('refuses with 403 and WEBHOOKS_DISABLED when the feature is off', () => {
        process.env.NODE_WEBHOOKS_ENABLED = 'false';
        const next = jest.fn();
        const response = makeResponseStub();

        requireWebhooksEnabled(asStub<Request>({}), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                errors: expect.arrayContaining([
                    expect.objectContaining({ code: 'WEBHOOKS_DISABLED' })
                ])
            })
        );
    });
});
