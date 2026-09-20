/**
 * `src/infrastructure/adapters/mail-spool.ts` — the Claim Check store for an email attachment.
 *
 * `resolveSpooled` is the security-relevant half: a queue message carries a `key` a producer
 * chose, and this is the only place that key becomes a filesystem path. A key shaped like a
 * traversal (`../../etc/passwd`) or an absolute path must resolve to `undefined`, never to a path
 * outside the spool root — the same reasoning `orders/services/invoice.ts`'s `ORDER_ID_PATTERN`
 * and `image-store.ts`'s `resolveUnderPublicRoot` already hold for their own stores.
 */

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    discardSpooled,
    resolveSpooled,
    spoolAttachment
} from '@infrastructure/adapters/mail-spool';

let spoolRoot: string;
const originalSpoolPath = process.env.NODE_MAIL_SPOOL_PATH;

beforeEach(async () => {
    spoolRoot = await mkdtemp(path.join(tmpdir(), 'mail-spool-test-'));
    process.env.NODE_MAIL_SPOOL_PATH = spoolRoot;
});

afterEach(async () => {
    await rm(spoolRoot, { recursive: true, force: true });
    if (originalSpoolPath === undefined) delete process.env.NODE_MAIL_SPOOL_PATH;
    else process.env.NODE_MAIL_SPOOL_PATH = originalSpoolPath;
});

describe('spoolAttachment', () => {
    it('writes the bytes under the spool root and returns a key naming them', async () => {
        const key = await spoolAttachment(Buffer.from('pdf-bytes'), 'pdf');

        expect(key).toMatch(/^[\da-f]{32}\.pdf$/);
        await expect(readFile(path.join(spoolRoot, key))).resolves.toEqual(
            Buffer.from('pdf-bytes')
        );
    });

    it('creates the spool directory on demand', async () => {
        await rm(spoolRoot, { recursive: true, force: true });

        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await expect(stat(path.join(spoolRoot, key))).resolves.toBeDefined();
    });

    it('mints a distinct key per call, even for identical bytes', async () => {
        const first = await spoolAttachment(Buffer.from('same'), 'pdf');
        const second = await spoolAttachment(Buffer.from('same'), 'pdf');

        expect(first).not.toBe(second);
    });
});

describe('resolveSpooled', () => {
    it('resolves a key shaped like one spoolAttachment mints', async () => {
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        expect(resolveSpooled(key)).toBe(path.join(spoolRoot, key));
    });

    it.each([
        ['a traversal segment', '../../etc/passwd.pdf'],
        ['an absolute path', '/etc/passwd.pdf'],
        ['no extension at all', 'abc123'],
        ['a slash inside the name', 'abc/123.pdf'],
        ['an uppercase extension', 'abc123.PDF']
    ])('refuses %s, resolving to undefined', (_label, key) => {
        expect(resolveSpooled(key)).toBeUndefined();
    });
});

describe('discardSpooled', () => {
    it('deletes the spooled file', async () => {
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await discardSpooled(key);

        await expect(stat(path.join(spoolRoot, key))).rejects.toThrow();
    });

    it('never rejects for a key that names nothing on disk', async () => {
        await expect(discardSpooled('never-spooled.pdf')).resolves.toBeUndefined();
    });

    it('never rejects for a key that fails to resolve at all', async () => {
        await expect(discardSpooled('../../etc/passwd.pdf')).resolves.toBeUndefined();
    });

    // Proof the traversal refusal is load-bearing, not just a type check: a file genuinely
    // sitting outside the spool root survives a discard call naming it via `..`.
    it('leaves a file outside the spool root untouched even when a key tries to name it', async () => {
        const outside = await mkdtemp(path.join(tmpdir(), 'mail-spool-outside-'));
        const precious = path.join(outside, 'keep.pdf');
        await writeFile(precious, Buffer.from('keep-me'));

        await discardSpooled(`../${path.basename(outside)}/keep.pdf`);

        await expect(readFile(precious)).resolves.toEqual(Buffer.from('keep-me'));
        await rm(outside, { recursive: true, force: true });
    });
});
