/**
 * @module
 * The payment provider port's own error types — split out from `index.ts` so an implementation
 * (a real adapter, or the fake double) can throw one without importing the port interface file,
 * which imports the config and the registry an implementation is registered in.
 */

import type { RefundFailureReason } from '@types';

/**
 * A provider's refusal to cancel: the intent already succeeded or is still mid-flight there, so
 * there is nothing open left to close — only a refund could move that money back. Thrown by
 * `PaymentProvider.cancel`, and nowhere else in this port.
 */
export class PaymentInFlightError extends Error {
    /** @param message - what the provider said about the intent's state. */
    constructor(message: string) {
        super(message);
        this.name = 'PaymentInFlightError';
    }
}

/**
 * A provider refusing a refund, with the reason already classified. An adapter maps its own error
 * vocabulary onto {@link RefundFailureReason} and throws this; anything else an adapter throws is
 * stored as `unknown`. The message is the provider's own wording: it goes to the log, never the wire.
 */
export class PaymentProviderError extends Error {
    /**
     * @param code - the closed reason staff see
     * @param message - the provider's own wording, for the log
     */
    constructor(
        readonly code: RefundFailureReason,
        message: string
    ) {
        super(message);
        this.name = 'PaymentProviderError';
    }
}
