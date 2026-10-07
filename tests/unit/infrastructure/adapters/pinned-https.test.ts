/**
 * The options `pinnedHttpsRequest` builds, and the order it works in: guard first, then a request
 * to the ORIGINAL host with the guard's pinned lookup. `node:https` and the guard are the seams, so
 * no socket opens.
 */
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough } from 'node:stream';
import { pinnedHttpsRequest } from '@infrastructure/adapters/pinned-https';
import { resolveSafeOutboundTarget, SsrfRefusedError } from '@infrastructure/adapters/ssrf-guard';
import { asStub } from '../../../support/stub';

jest.mock('node:https', () => ({ request: jest.fn() }));

jest.mock('@infrastructure/adapters/ssrf-guard', () => ({
    ...jest.requireActual<object>('@infrastructure/adapters/ssrf-guard'),
    resolveSafeOutboundTarget: jest.fn()
}));

/** The guard's pin, recognisable by identity in the request options. */
const pinnedLookup = jest.fn();

/** The response the fake server answers with. */
const response = asStub<IncomingMessage>({ statusCode: 204 });

/** The request object `https.request` returns, recording what was written. */
let outgoing: PassThrough & { end: jest.Mock };

beforeEach(() => {
    jest.mocked(resolveSafeOutboundTarget).mockResolvedValue({
        hostname: 'hooks.example.test',
        resolvedAddress: '203.0.113.9',
        lookup: pinnedLookup
    });
    outgoing = Object.assign(new PassThrough(), { end: jest.fn() });
    jest.mocked(httpsRequest).mockImplementation((_options, onResponse) => {
        // Answer when the request is ended, as a real server does.
        outgoing.end.mockImplementation(() => {
            (onResponse as (r: IncomingMessage) => void)(response);
        });
        return asStub<ReturnType<typeof httpsRequest>>(outgoing);
    });
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('pinnedHttpsRequest()', () => {
    it('requests the original host on the pinned lookup, defaulting the port to 443', async () => {
        const signal = AbortSignal.timeout(5000);

        await pinnedHttpsRequest('https://hooks.example.test/a/b?x=1', { method: 'GET', signal });

        expect(resolveSafeOutboundTarget).toHaveBeenCalledWith(
            'https://hooks.example.test/a/b?x=1',
            signal
        );
        expect(httpsRequest).toHaveBeenCalledWith(
            {
                hostname: 'hooks.example.test',
                port: 443,
                path: '/a/b?x=1',
                method: 'GET',
                headers: undefined,
                lookup: pinnedLookup,
                signal
            },
            expect.any(Function)
        );
    });

    it('uses the url`s own port when it names one', async () => {
        await pinnedHttpsRequest('https://hooks.example.test:8443/', {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });

        expect(jest.mocked(httpsRequest).mock.calls[0][0]).toMatchObject({ port: 8443 });
    });

    it('sends the headers and writes the body when ending the request', async () => {
        await pinnedHttpsRequest('https://hooks.example.test/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"a":1}',
            signal: AbortSignal.timeout(5000)
        });

        expect(jest.mocked(httpsRequest).mock.calls[0][0]).toMatchObject({
            method: 'POST',
            headers: { 'content-type': 'application/json' }
        });
        expect(outgoing.end).toHaveBeenCalledWith('{"a":1}');
    });

    it('resolves with the response, without reading it', async () => {
        await expect(
            pinnedHttpsRequest('https://hooks.example.test/', {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            })
        ).resolves.toBe(response);
    });

    it('rejects when the request errors', async () => {
        jest.mocked(httpsRequest).mockImplementation(() => {
            const failing = Object.assign(new PassThrough(), {
                end: () => failing.emit('error', new Error('ECONNRESET'))
            });
            return asStub<ReturnType<typeof httpsRequest>>(failing);
        });

        await expect(
            pinnedHttpsRequest('https://hooks.example.test/', {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            })
        ).rejects.toThrow('ECONNRESET');
    });

    it('never opens a request when the guard refuses the url', async () => {
        jest.mocked(resolveSafeOutboundTarget).mockRejectedValue(
            new SsrfRefusedError('unsafe-address', 'resolves to a private range')
        );

        await expect(
            pinnedHttpsRequest('https://10.0.0.1/', {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            })
        ).rejects.toBeInstanceOf(SsrfRefusedError);
        expect(httpsRequest).not.toHaveBeenCalled();
    });
});
