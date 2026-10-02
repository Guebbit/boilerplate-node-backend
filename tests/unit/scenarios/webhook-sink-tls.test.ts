/**
 * @module
 * `scenarios/support/tls/` — the demo webhook sink's committed test CA and leaf.
 *
 * Asserted two ways: the chain itself (who signed it, what it covers, how long it lasts), and a
 * real handshake — a server on the leaf, a client trusting only the CA, the way
 * `NODE_EXTRA_CA_CERTS` makes the demo backend trust it. The remake recipe is
 * `scenarios/tools/generate-webhook-sink-tls.ts`.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { X509Certificate } from 'node:crypto';

/** Where the committed fixtures live. */
const TLS_DIRECTORY = path.join(__dirname, '../../../scenarios/support/tls');

/** The CA's path, as `NODE_EXTRA_CA_CERTS` is given it. */
const CA_PATH = path.join(TLS_DIRECTORY, 'webhook-sink-ca.pem');

/** The three committed files, read once. */
const ca = readFileSync(CA_PATH);
const cert = readFileSync(path.join(TLS_DIRECTORY, 'webhook-sink-cert.pem'));
const key = readFileSync(path.join(TLS_DIRECTORY, 'webhook-sink-key.pem'));

/** A month, in milliseconds: how early the expiry warning fires, so a remake is never an emergency. */
const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Everything the child process below needs to call a sink, as one `-e` script. */
const CLIENT_SCRIPT = `
fetch(process.argv[1]).then(
    (response) => { process.stdout.write(String(response.status)); },
    (error) => { process.stdout.write('refused:' + (error.cause?.code ?? error.message)); }
);`;

/** A sink on the committed leaf, answering 200 to everything, on a free loopback port. */
const startSink = (): Promise<{ server: Server; url: string }> =>
    new Promise((resolve) => {
        const server = createServer({ cert, key }, (_request, response) => {
            response.writeHead(200).end('{}');
        });
        server.listen(0, '127.0.0.1', () =>
            resolve({
                server,
                url: `https://127.0.0.1:${String((server.address() as AddressInfo).port)}/`
            })
        );
    });

/** Stop a sink and free its port. */
const stopSink = (server: Server): Promise<void> =>
    new Promise((resolve) => {
        server.close(() => resolve());
    });

/**
 * Run `fetch(url)` in a fresh Node process, so the process-start-only `NODE_EXTRA_CA_CERTS` is
 * honoured exactly as it is for the demo backend.
 *
 * @param url - the sink to call
 * @param environment - extra environment for the child
 * @returns the status it saw, or `refused:<code>` when TLS failed
 */
const callFromFreshProcess = (url: string, environment: Record<string, string>): Promise<string> =>
    promisify(execFile)(process.execPath, ['-e', CLIENT_SCRIPT, url], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: '', ...environment }
    }).then(({ stdout }) => stdout);

describe('the demo webhook sink fixtures', () => {
    const caCertificate = new X509Certificate(ca);
    const leaf = new X509Certificate(cert);

    it('chain: the leaf is signed by the CA, which is a CA that signs nothing below a leaf', () => {
        expect(leaf.verify(caCertificate.publicKey)).toBe(true);
        expect(leaf.checkIssued(caCertificate)).toBe(true);
        expect(caCertificate.ca).toBe(true);
        expect(leaf.ca).toBe(false);
    });

    it('covers loopback and the compose proxy name, and nothing outside them', () => {
        expect(leaf.checkIP('127.0.0.1')).toBe('127.0.0.1');
        expect(leaf.checkHost('localhost')).toBe('localhost');
        expect(leaf.checkHost('webhook-tester-tls')).toBe('webhook-tester-tls');
        expect(leaf.checkHost('example.com')).toBeUndefined();
    });

    it('is valid for at least another month: a remake is due before it lapses', () => {
        const renewalDeadline = new Date(Date.now() + RENEWAL_WINDOW_MS);
        expect(new Date(leaf.validTo).getTime()).toBeGreaterThan(renewalDeadline.getTime());
        expect(new Date(caCertificate.validTo).getTime()).toBeGreaterThan(
            renewalDeadline.getTime()
        );
    });

    it('is trusted through NODE_EXTRA_CA_CERTS, and refused without it', async () => {
        const { server, url } = await startSink();
        try {
            await expect(callFromFreshProcess(url, { NODE_EXTRA_CA_CERTS: CA_PATH })).resolves.toBe(
                '200'
            );
            await expect(callFromFreshProcess(url, {})).resolves.toMatch(/^refused:/);
        } finally {
            await stopSink(server);
        }
    });
});
