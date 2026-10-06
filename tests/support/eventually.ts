/**
 * @module
 * Waiting for a side effect the code under test deliberately does not await — a detached mail
 * enqueue, a fire-and-forget notice. Polls rather than sleeping a fixed time: it returns as soon as
 * the condition holds, so a fast machine pays nothing and a slow one has the whole window.
 */

/**
 * Poll `done` until it is true or the window closes. Never throws: the assertion that follows is
 * what should fail, with its own message, not an opaque timeout here.
 *
 * @param done - the condition to wait for
 * @param windowMs - how long to keep trying
 */
export const eventually = async (done: () => boolean, windowMs = 2000): Promise<void> => {
    const deadline = Date.now() + windowMs;
    while (!done() && Date.now() < deadline)
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
};
