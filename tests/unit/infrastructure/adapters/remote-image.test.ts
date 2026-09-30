/**
 * Re-hosting a remote picture is best-effort: every refusal or failure answers `undefined`, never
 * a rejection, so a signup never fails over an avatar.
 *
 * The network and the digest pipeline are the seams: `node:https`, the SSRF guard and the image
 * pipeline are replaced, so the download-then-digest wiring is asserted without a socket.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { digestQuarantinedImage } from '@infrastructure/adapters/image.worker';
import { imageStore } from '@infrastructure/adapters/image-store';
import { rehostRemoteImage } from '@infrastructure/adapters/remote-image';
import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';
import { asStub } from '../../../support/stub';

jest.mock('node:https', () => ({ request: jest.fn() }));

jest.mock('@infrastructure/adapters/ssrf-guard', () => ({
    ...jest.requireActual<object>('@infrastructure/adapters/ssrf-guard'),
    resolveSafeOutboundTarget: jest.fn()
}));

jest.mock('@infrastructure/adapters/image.worker', () => ({
    digestQuarantinedImage: jest.fn()
}));

jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: { quarantine: jest.fn(), removeQuarantined: jest.fn() }
}));

/** Where the staged bytes land, so the test never writes into the real staging directory. */
const staging = mkdtempSync(path.join(tmpdir(), 'remote-image-'));

/** The digest pipeline's answer for a stored picture. */
const STORED = { imageUrl: '/img/a.webp', thumbnailUrl: '/img/a-thumb.webp' };

/**
 * Make the mocked `https.request` answer with a response of the given status and body chunks.
 *
 * @param statusCode - the HTTP status the fake server answers
 * @param chunks - the body, delivered in order
 */
const serveResponse = (statusCode: number, chunks: Buffer[]) => {
    jest.mocked(httpsRequest).mockImplementation((_options, onResponse) => {
        // A real stream: `destroy(error)` surfaces the error exactly as `IncomingMessage` does.
        const body = Object.assign(new PassThrough(), { statusCode });
        const response = asStub<IncomingMessage>(body);
        const outgoing = Object.assign(new PassThrough(), {
            // Answering on `end()` mirrors the real request: the response follows the request.
            end: () => {
                (onResponse as (r: IncomingMessage) => void)(response);
                for (const chunk of chunks) body.write(chunk);
                body.end();
            }
        });
        return asStub<ReturnType<typeof httpsRequest>>(outgoing);
    });
};

beforeEach(() => {
    process.env.NODE_UPLOAD_STAGING_PATH = staging;
    jest.mocked(resolveSafeOutboundTarget).mockResolvedValue({
        hostname: 'avatars.example.test',
        resolvedAddress: '203.0.113.9',
        lookup: jest.fn()
    });
    jest.mocked(imageStore.quarantine).mockResolvedValue('quarantine-key.img');
    jest.mocked(imageStore.removeQuarantined).mockResolvedValue(true);
    jest.mocked(digestQuarantinedImage).mockResolvedValue(STORED);
});

afterEach(() => {
    jest.clearAllMocks();
});

afterAll(() => {
    delete process.env.NODE_UPLOAD_STAGING_PATH;
    rmSync(staging, { recursive: true, force: true });
});

describe('rehostRemoteImage', () => {
    it('has nothing to fetch for an absent url', async () => {
        await expect(rehostRemoteImage(undefined)).resolves.toBeUndefined();
    });

    it.each([
        ['a plaintext url', 'http://avatars.example.test/a.png'],
        ['a url with credentials', 'https://user:pw@avatars.example.test/a.png'],
        ['a loopback literal', 'https://127.0.0.1/a.png'],
        ['a private literal', 'https://10.0.0.5/a.png'],
        ['not a url at all', 'not a url']
    ])('refuses %s without rejecting', async (_label, url) => {
        // The real guard, not the stub: these urls are refused before any DNS lookup.
        jest.mocked(resolveSafeOutboundTarget).mockImplementation(
            jest.requireActual<typeof import('@infrastructure/adapters/ssrf-guard')>(
                '@infrastructure/adapters/ssrf-guard'
            ).resolveSafeOutboundTarget
        );
        await expect(rehostRemoteImage(url)).resolves.toBeUndefined();
    });

    it('downloads the picture, digests it and returns the two local urls', async () => {
        serveResponse(200, [Buffer.from('abc'), Buffer.from('def')]);

        await expect(rehostRemoteImage('https://avatars.example.test/u/1?s=64')).resolves.toEqual(
            STORED
        );

        // The connection is pinned to the guard's address and asks for the url's own path + query.
        expect(httpsRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                hostname: 'avatars.example.test',
                port: 443,
                path: '/u/1?s=64',
                method: 'GET'
            }),
            expect.any(Function)
        );
        expect(imageStore.quarantine).toHaveBeenCalledTimes(1);
        expect(digestQuarantinedImage).toHaveBeenCalledWith('quarantine-key.img', 'quarantine-key');
        // The quarantined copy never outlives the digest.
        expect(imageStore.removeQuarantined).toHaveBeenCalledWith('quarantine-key.img');
    });

    it('answers undefined when the remote does not answer 200', async () => {
        serveResponse(302, []);

        await expect(
            rehostRemoteImage('https://avatars.example.test/u/1')
        ).resolves.toBeUndefined();
        expect(digestQuarantinedImage).not.toHaveBeenCalled();
    });

    it('answers undefined when the body crosses the size cap', async () => {
        serveResponse(200, [Buffer.alloc(5 * 1024 * 1024 + 1)]);

        await expect(
            rehostRemoteImage('https://avatars.example.test/u/1')
        ).resolves.toBeUndefined();
        expect(imageStore.quarantine).not.toHaveBeenCalled();
    });

    it('answers undefined, and removes the quarantined copy, when the digest fails', async () => {
        serveResponse(200, [Buffer.from('not an image')]);
        jest.mocked(digestQuarantinedImage).mockRejectedValue(new Error('unsupported format'));

        await expect(
            rehostRemoteImage('https://avatars.example.test/u/1')
        ).resolves.toBeUndefined();
        expect(imageStore.removeQuarantined).toHaveBeenCalledWith('quarantine-key.img');
    });
});
