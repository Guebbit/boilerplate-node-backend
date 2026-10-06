/**
 * @module
 * Reading a third party's answer without trusting its size. `response.json()` and `response.text()`
 * buffer whatever arrives: a provider that is compromised, misconfigured or redirected to a
 * hostile host can answer gigabytes, and the process holds all of it before the first parse. These
 * stop at a cap. Used wherever this app calls out and reads the answer (OAuth providers, the
 * breached-password range lookup, the antibot siteverify), always beside `redirect: 'error'`.
 */

/**
 * The cap every caller uses: 1 MiB. An OAuth token answer, a user record and a breached-password
 * range are all kilobytes; a megabyte leaves room and still stops a flood.
 */
export const DEFAULT_BODY_CAP_BYTES = 1_048_576;

/**
 * Read a response body as text, refusing one longer than `maxBytes`.
 *
 * @param response - the answer to read
 * @param maxBytes - the most bytes to accept; the stream is cancelled the moment it passes this
 * @returns the body as UTF-8 text
 * @throws {Error} when the body is longer than `maxBytes`
 */
export const readCappedText = async (response: Response, maxBytes: number): Promise<string> => {
    // A bodiless answer (204, HEAD) reads as empty rather than throwing on a null stream.
    if (!response.body) return '';

    const chunks: Uint8Array[] = [];
    let size = 0;
    // WHATWG streams: a fetch body is an async-iterable of byte chunks, read as they arrive.
    // https://developer.mozilla.org/docs/Web/API/ReadableStream#async_iteration
    for await (const chunk of response.body as AsyncIterable<unknown>) {
        // A fetch body only ever yields bytes; anything else is a broken stream, refused.
        if (!(chunk instanceof Uint8Array)) throw new TypeError('The response body is not bytes.');
        size += chunk.byteLength;
        if (size > maxBytes)
            throw new Error(`The response body is longer than ${String(maxBytes)} bytes.`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
};

/**
 * Read a response body as JSON, refusing one longer than `maxBytes`. The result is `unknown`:
 * what a provider sent is a claim, and the caller narrows it.
 *
 * @param response - the answer to read
 * @param maxBytes - the most bytes to accept
 * @throws {Error} when the body is too long or is not JSON
 */
export const readCappedJson = (response: Response, maxBytes: number): Promise<unknown> =>
    readCappedText(response, maxBytes).then((text) => JSON.parse(text) as unknown);
