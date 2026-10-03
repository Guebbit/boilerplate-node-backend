/**
 * @module
 * The payment provider port's own error types — split out from `index.ts` so an implementation
 * (`fake.ts`, or a future real adapter) can throw one without importing the port interface file
 * that in turn imports every implementation, which is exactly the `no-circular` cycle that split
 * used to create.
 */

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
