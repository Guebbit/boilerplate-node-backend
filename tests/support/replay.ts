/**
 * @module
 * Sending one keyed request twice, the way a client retries after a lost answer. The ledger marks
 * an attempt done without being awaited, so a retry that lands in that gap answers 409 while the
 * first is "still running"; the second send repeats until that clears.
 */

import type { Response } from 'supertest';

/**
 * The first answer, and what the retry of the very same request got.
 *
 * @param send - one attempt, carrying the same `Idempotency-Key` and body every time
 * @returns both answers, in order
 */
export const sendTwice = async (
    send: () => PromiseLike<Response>
): Promise<{ first: Response; retry: Response }> => {
    const first = await send();
    let retry = await send();
    for (let attempt = 0; attempt < 40 && retry.status === 409; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        retry = await send();
    }
    return { first, retry };
};
