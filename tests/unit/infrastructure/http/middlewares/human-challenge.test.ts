/**
 * `infrastructure/http/middlewares/human-challenge.ts` — the gate `signup`/`reset`/`contact`
 * mount for rung 4.
 *
 * Provider selection itself is `antibot-providers/index.test.ts`'s job; this suite owns the HTTP
 * shape around it — which header is read, what a refusal answers with, and the one property the
 * plan requires of every rung: OFF costs nothing, not even a header read.
 */

import { asStub } from '@tests/stub';
import type { Request } from 'express';
import { makeResponseStub } from '@tests/express';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';

const ORIGINAL = process.env.NODE_ANTIBOT_PROVIDER;

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
    else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL;
    delete process.env.NODE_ANTIBOT_TURNSTILE_SECRET;
    jest.restoreAllMocks();
});

/** A request whose only interesting property is whether it carries the provider token. */
const makeRequest = (token?: string) =>
    asStub<Request>({
        method: 'POST',
        path: '/contact',
        ip: '203.0.113.10',
        header: (name: string) => (name === 'x-antibot-challenge-token' ? token : undefined)
    });

describe('humanChallengeGate', () => {
    it('is off by default — calls next() without reading a header', () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;
        const next = jest.fn();
        const header = jest.fn();

        humanChallengeGate(asStub<Request>({ header }), makeResponseStub(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(header).not.toHaveBeenCalled();
    });

    it('refuses with 401 when a provider is selected and no token is sent', () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        const response = makeResponseStub();
        const next = jest.fn();

        humanChallengeGate(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('calls next() when the provider vouches for the token', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        process.env.NODE_ANTIBOT_TURNSTILE_SECRET = 'secret';
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: true }));
        const next = jest.fn();

        humanChallengeGate(makeRequest('a-token'), makeResponseStub(), next);
        await new Promise(process.nextTick);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('refuses when the provider throws rather than answering — never a pass', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        process.env.NODE_ANTIBOT_TURNSTILE_SECRET = 'secret';
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
        const response = makeResponseStub();
        const next = jest.fn();

        humanChallengeGate(makeRequest('a-token'), response, next);
        await new Promise(process.nextTick);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });
});
