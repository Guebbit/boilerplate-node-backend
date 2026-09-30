/**
 * @module
 * The `account` end of the shared kernel, read side: named lookups over `userRepository`.
 */

import { userRepository } from '../repository';

/*
 * `account` end of the one shared-kernel relationship in this repo (`docs/theory/strategic-ddd.md`
 * §5): the User document it authenticates, resets, links to OAuth, and 2FA-protects. Read-only
 * lookups below are still thin pass-throughs to `userRepository`, named for the question they
 * answer. WRITES are not: a raw `save`/`build`/`create`/`findOneWithCredentials(where)` published
 * on the barrel is a write (or an arbitrary-filter read) handle any future sibling could import
 * and use for anything, not only `account`. Every write operation below enforces what the
 * document requires by construction instead — it takes only the fields its one caller actually
 * has, and does only the one mutation its name promises.
 */

/** An authenticatable account by id — `active`/soft-delete already excluded by the query. */
export const findAuthenticatableById = (id: string) => userRepository.findAuthenticatableById(id);

/** The hydrated document with every `select: false` field loaded (password, tokens, 2FA). */
export const findByIdWithCredentials = (id: string) => userRepository.findByIdWithCredentials(id);

/**
 * The credentialed account attempting an email/password login, `select: false` fields (the
 * password hash) included. Deactivated or soft-deleted accounts are already excluded by
 * `findAuthenticatableByEmail`'s own query, same clause `findAuthenticatableById` uses.
 */
export const findForLogin = (email: string) => userRepository.findAuthenticatableByEmail(email);

/**
 * The credentialed account already linked to this federated identity, if any — `select: false`
 * fields included because a caller may need to build a 2FA login challenge off
 * `user.twoFactorMethods` right after. `active: { $ne: false }`/`deletedAt: undefined`, same
 * clause `findForLogin` filters on: a deactivated or soft-deleted account must not walk straight
 * into a session through a provider it linked before either happened.
 */
export const findByOAuthIdentity = (provider: string, providerId: string) =>
    userRepository.findOneWithCredentials({
        'oauthAccounts.provider': provider,
        'oauthAccounts.providerId': providerId,
        active: { $ne: false },
        deletedAt: undefined
    });

/** The hydrated document with the pending-email-change field loaded. */
export const findByIdWithPendingEmail = (id: string) => userRepository.findByIdWithPendingEmail(id);

/** Whether `email` (or its pending-change counterpart) is already taken by another account. */
export const emailOrPendingEmailTaken = (email: string, excludingId: string) =>
    userRepository.emailOrPendingEmailTaken(email, excludingId);

/**
 * The account holding a token of this exact value and type — not filtered by expiry. A caller
 * that needs "live" (exists, right type, not expired) checks `entry.expiration` itself, same as
 * `account/services/tokens.ts`'s `findLiveTokenEntry`.
 */
export const findByToken = (
    token: string,
    type: Parameters<typeof userRepository.findByToken>[1]
) => userRepository.findByToken(token, type);

/** The account currently holding this exact token value, any type. */
export const findByTokenValue = (token: string) => userRepository.findByTokenValue(token);

/** Whether an account already exists for this email — signup's duplicate-email pre-check. */
export const emailTaken = (email: string): Promise<boolean> =>
    userRepository.findOne({ email }).then((user) => user !== null);
