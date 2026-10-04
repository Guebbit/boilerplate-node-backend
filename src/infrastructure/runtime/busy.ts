/**
 * @module
 * The one error for "the server is working at its limit and will not queue this": a bounded queue
 * that is full. Answered as a 503 with a `Retry-After` hint, the same answer as an unreachable
 * dependency (`http/errors.ts#isInfrastructureError`): the SERVER is temporarily unable, the
 * request is not refused (RFC 9110 §15.6.4).
 *
 * Lives under `runtime/` so an adapter can throw it and the HTTP layer can recognise it without
 * either importing the other.
 */

/** A bounded queue was full: nothing was started, and the same request may succeed shortly. */
export class ServiceBusyError extends Error {
    /** @param message - names what was full, for the log line */
    constructor(message: string) {
        super(message);
        this.name = 'ServiceBusyError';
    }
}
