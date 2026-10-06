import { createHash } from 'node:crypto';
import { assertCorpusDigest } from '../../../../scripts/ops/corpus-digest';

/** A small body and its real SHA-256, so the happy path proves the digest is computed over the bytes. */
const body = new TextEncoder().encode('123456\npassword\n');
const digest = createHash('sha256').update(body).digest('hex');

describe('assertCorpusDigest', () => {
    it('accepts bytes whose SHA-256 is the pinned one', () => {
        expect(() => {
            assertCorpusDigest(body, digest, 'corpus');
        }).not.toThrow();
    });

    it('refuses altered bytes and names the label and both digests', () => {
        const altered = new TextEncoder().encode('123456\npassword!\n');

        expect(() => {
            assertCorpusDigest(altered, digest, 'corpus');
        }).toThrow(
            /corpus: SHA-256 is [0-9a-f]{64}, expected [0-9a-f]{64}\. Refusing the corpus\./u
        );
    });

    it('refuses an empty body', () => {
        expect(() => {
            assertCorpusDigest(new Uint8Array(), digest, 'corpus');
        }).toThrow(/Refusing the corpus/u);
    });
});
