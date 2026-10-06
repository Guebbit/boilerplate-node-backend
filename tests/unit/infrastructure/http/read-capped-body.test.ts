/**
 * `read-capped-body` — a third party's answer read up to a cap, never past it: text and JSON under
 * the cap come back whole, one over it is refused (and its stream cancelled, not drained), and a
 * body that is not what it claims reads as an error, not as empty.
 */
import { readCappedJson, readCappedText } from '@infrastructure/http/read-capped-body';

/** A response whose body arrives as the given chunks, one per read. */
const chunked = (...chunks: string[]): Response =>
    new Response(
        new ReadableStream<Uint8Array>({
            start: (controller) => {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                controller.close();
            }
        })
    );

describe('readCappedText', () => {
    it('returns a body under the cap, however many chunks it came in', async () => {
        expect(await readCappedText(chunked('hel', 'lo ', 'world'), 100)).toBe('hello world');
    });

    it('returns a body of exactly the cap', async () => {
        expect(await readCappedText(chunked('12345'), 5)).toBe('12345');
    });

    it('refuses a body one byte over the cap', async () => {
        await expect(readCappedText(chunked('123456'), 5)).rejects.toThrow(/longer than 5 bytes/);
    });

    it('refuses a body that crosses the cap across chunks, without reading the rest', async () => {
        let pulled = 0;
        const response = new Response(
            new ReadableStream<Uint8Array>({
                pull: (controller) => {
                    pulled += 1;
                    controller.enqueue(new TextEncoder().encode('xxxxxxxxxx'));
                    if (pulled > 50) controller.close();
                }
            })
        );

        await expect(readCappedText(response, 25)).rejects.toThrow(/longer than 25 bytes/);
        // Cancelled at the cap: nowhere near the fifty chunks an unbounded read would have drawn.
        expect(pulled).toBeLessThan(10);
    });

    it('counts multi-byte characters by bytes, not by characters', async () => {
        // Three characters, nine bytes.
        await expect(readCappedText(chunked('日本語'), 8)).rejects.toThrow();
        expect(await readCappedText(chunked('日本語'), 9)).toBe('日本語');
    });

    it('reads a bodiless answer as empty', async () => {
        expect(await readCappedText(new Response(null, { status: 204 }), 10)).toBe('');
    });
});

describe('readCappedJson', () => {
    it('parses a body under the cap', async () => {
        expect(await readCappedJson(chunked('{"a":', '1}'), 100)).toEqual({ a: 1 });
    });

    it('refuses a body over the cap before parsing it', async () => {
        await expect(readCappedJson(chunked('{"a":12345}'), 4)).rejects.toThrow(/longer than/);
    });

    it('rejects a body that is not JSON', async () => {
        await expect(readCappedJson(chunked('<html>'), 100)).rejects.toThrow();
    });
});
