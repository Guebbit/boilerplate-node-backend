/**
 * `infrastructure/http/middlewares/human-challenge.ts` — the gate `signup`/`reset`/`contact`
 * mount for rung 3.
 *
 * Provider selection itself is `antibot-providers/index.test.ts`'s job; this suite owns the HTTP
 * shape around it — which header is read, what a refusal answers with, and the one property every
 * rung must hold: OFF costs nothing, not even a header read.
 */

import { asStub } from '@tests/stub';
import type { Request } from 'express';
import { makeResponseStub } from '@tests/express';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { setEnvironment } from '@tests/environment';

/** Saved so the provider each case selects is restored for every other suite. */

afterEach(() => {
    setEnvironment({ NODE_ANTIBOT_TURNSTILE_SECRET: undefined });
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
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });
        const next = jest.fn();
        const header = jest.fn();

        humanChallengeGate(asStub<Request>({ header }), makeResponseStub(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(header).not.toHaveBeenCalled();
    });

    it('refuses with 401 when a provider is selected and no token is sent', () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        const response = makeResponseStub();
        const next = jest.fn();

        humanChallengeGate(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('calls next() when the provider vouches for the token', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        setEnvironment({ NODE_ANTIBOT_TURNSTILE_SECRET: 'secret' });
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: true }));
        const next = jest.fn();

        humanChallengeGate(makeRequest('a-token'), makeResponseStub(), next);
        await new Promise(process.nextTick);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('asks Cloudflare without following a redirect, and refuses an oversized answer', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        setEnvironment({ NODE_ANTIBOT_TURNSTILE_SECRET: 'secret' });
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response(`{"success":true,"pad":"${'x'.repeat(1_048_577)}"}`));
        const response = makeResponseStub();
        const next = jest.fn();

        humanChallengeGate(makeRequest('a-token'), response, next);
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
        // Too long to read: a refusal, never a pass — even though the body said `success: true`.
        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('refuses when the provider throws rather than answering — never a pass', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        setEnvironment({ NODE_ANTIBOT_TURNSTILE_SECRET: 'secret' });
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
        const response = makeResponseStub();
        const next = jest.fn();

        humanChallengeGate(makeRequest('a-token'), response, next);
        await new Promise(process.nextTick);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });
});
