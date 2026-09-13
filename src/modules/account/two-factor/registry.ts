/**
 * @module
 * The set of second factors this deployment knows how to run, and the interface each one
 * satisfies. Everything above this file — services, controllers, the contract — deals in a
 * `method` string and a handler looked up from it, so gaining a channel means adding a handler
 * here rather than a branch in the login flow.
 */

import type { CallerContext } from '@infrastructure/http/request';
import type { TwoFactorMethodRecord, UserDocument } from '@modules/users';
import type { TwoFactorDelivery, TwoFactorSetup } from '@types';
import { totpMethod } from './methods/totp';
import { emailMethod } from './methods/email';

/** Whether one account may add one method right now, and the sentence to show when it may not. */
export interface MethodEligibility {
    /** Whether enrollment would be accepted. */
    enrollable: boolean;
    /** Translated reason, present only when `enrollable` is false. */
    reason?: string;
}

/**
 * One second factor's behaviour. Handlers mutate the method entry they are handed and never
 * touch the database — persisting is the calling service's job, so that one save covers the
 * factor, the backup codes and the account flag together.
 */
export interface TwoFactorMethodHandler {
    /** Wire name — what the contract carries and what the entry stores. */
    readonly name: string;

    /**
     * Whether the server sends this method's code, or the caller reads it off their own device.
     * Delivered methods get a cooldown, an expiry and an attempt ceiling; device methods get a
     * replay guard instead.
     */
    readonly delivers: boolean;

    /** Whether this deployment can run the method at all — an unreachable channel is offered to nobody. */
    available(): boolean;

    /** Whether this ACCOUNT may enroll it — a verified address, a verified phone. */
    eligibility(user: UserDocument): MethodEligibility;

    /** Masked destination for a delivered method, so no client has to redact one. `undefined` for device methods. */
    target(user: UserDocument): string | undefined;

    /**
     * Begin enrollment: arm whatever the caller needs to produce a first code.
     * @returns the payload for `POST /account/2fa/methods/{method}/setup`
     */
    setup(
        user: UserDocument,
        entry: TwoFactorMethodRecord,
        context: CallerContext
    ): Promise<TwoFactorSetup>;

    /** Check a typed code against this entry, advancing its replay guard or burning its code in flight. */
    verify(user: UserDocument, entry: TwoFactorMethodRecord, code: string): Promise<boolean>;

    /** Deliver a fresh code. Present exactly when {@link delivers} is true. */
    send?(
        user: UserDocument,
        entry: TwoFactorMethodRecord,
        context: CallerContext
    ): Promise<TwoFactorDelivery>;
}

/**
 * Every handler, in the order a client should offer them: a device method first, because it
 * costs the user no round-trip and no mailbox. `defaultMethod` on a login challenge is the first
 * of these the account has armed.
 */
const HANDLERS: readonly TwoFactorMethodHandler[] = [totpMethod, emailMethod];

/** The handlers this deployment can actually run. */
export const availableTwoFactorMethods = (): TwoFactorMethodHandler[] =>
    HANDLERS.filter((handler) => handler.available());

/**
 * Look one handler up by wire name.
 *
 * @param name - a `method` from the contract, or anything a caller put in the path
 * @returns the handler, or `undefined` for an unknown or unavailable method — the two are one
 *   answer on purpose, since a caller learns nothing from being told a channel exists but is off
 */
export const twoFactorMethod = (name: string): TwoFactorMethodHandler | undefined =>
    availableTwoFactorMethods().find((handler) => handler.name === name);

/**
 * Order a user's stored entries the way {@link HANDLERS} declares, so the client's first offer is
 * the cheapest method rather than whichever one happened to be enrolled first.
 *
 * @param entries - the account's `twoFactorMethods`
 * @returns the entries paired with their handler, unknown methods dropped
 */
export const orderedEntries = (
    entries: readonly TwoFactorMethodRecord[]
): { entry: TwoFactorMethodRecord; handler: TwoFactorMethodHandler }[] =>
    availableTwoFactorMethods().flatMap((handler) => {
        const entry = entries.find((candidate) => candidate.method === handler.name);
        return entry ? [{ entry, handler }] : [];
    });
