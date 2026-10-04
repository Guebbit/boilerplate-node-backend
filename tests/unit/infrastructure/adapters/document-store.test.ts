/**
 * The document store: a private directory of finished PDFs. What matters is observable on disk:
 * a name that is not the one shape the store writes never touches a path, a write is atomic, and
 * the reaper deletes by age and nothing else.
 */

import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setEnvironment } from '@tests/environment';
import {
    reapDocuments,
    readDocument,
    writeDocument
} from '@infrastructure/adapters/document-store';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'document-store-'));
    setEnvironment({ NODE_DOCUMENT_STORE_PATH: root });
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe('readDocument and writeDocument', () => {
    it('round-trips the bytes', async () => {
        await writeDocument('invoice-1.pdf', Buffer.from('%PDF-1'));

        await expect(readDocument('invoice-1.pdf')).resolves.toEqual(Buffer.from('%PDF-1'));
    });

    it('answers undefined for a document that was never stored', async () => {
        await expect(readDocument('invoice-none.pdf')).resolves.toBeUndefined();
    });

    it('creates the directory on first write, so a fresh volume needs no setup', async () => {
        await rm(root, { recursive: true });

        await writeDocument('invoice-1.pdf', Buffer.from('x'));

        await expect(readDocument('invoice-1.pdf')).resolves.toBeDefined();
    });

    it('leaves no temporary file behind, and writes whole files over a concurrent pair', async () => {
        await Promise.all([
            writeDocument('invoice-1.pdf', Buffer.from('same bytes')),
            writeDocument('invoice-1.pdf', Buffer.from('same bytes'))
        ]);

        expect(await readdir(root)).toEqual(['invoice-1.pdf']);
        await expect(readDocument('invoice-1.pdf')).resolves.toEqual(Buffer.from('same bytes'));
    });

    // The name is never joined onto a path unless it has the one shape this store writes.
    it.each(['../etc/passwd', 'a/b.pdf', 'invoice.txt', '', 'x'.repeat(90) + '.pdf', '..%2f.pdf'])(
        'refuses the name %j: nothing read, nothing written',
        async (name) => {
            await expect(readDocument(name)).resolves.toBeUndefined();
            await expect(writeDocument(name, Buffer.from('x'))).rejects.toThrow('Not a storable');
            expect(await readdir(root)).toEqual([]);
        }
    );
});

/** Backdate a stored file's modification time. */
const age = (name: string, days: number): Promise<void> => {
    const old = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return utimes(path.join(root, name), old, old);
};

describe('reapDocuments', () => {
    it('deletes what is past the window and keeps what is inside it, by modification time', async () => {
        await writeFile(path.join(root, 'invoice-old.pdf'), 'x');
        await writeFile(path.join(root, 'invoice-new.pdf'), 'x');
        await age('invoice-old.pdf', 31);
        await age('invoice-new.pdf', 29);

        const result = await reapDocuments(30 * 24 * 60 * 60 * 1000);

        expect(result).toEqual({ checked: 2, reaped: 1 });
        expect(await readdir(root)).toEqual(['invoice-new.pdf']);
    });

    it('is a no-op on a store that was never written', async () => {
        await rm(root, { recursive: true });

        await expect(reapDocuments(1000)).resolves.toEqual({ checked: 0, reaped: 0 });
    });
});
