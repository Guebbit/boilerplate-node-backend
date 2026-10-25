/**
 * @module
 * The `account` end of the shared kernel, read side: named lookups over `userRepository`.
 */

import { userRepository } from '../repository';

/*
 * `account` end of the one domain-primitives relationship in this repo (`docs/theory/strategic-ddd.md`
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
 * password hash) included. A deactivated or soft-deleted account is excluded by the query itself,
 * except an owner-scheduled deletion still inside its grace: that one is returned so the sign-in
 * can offer the restore, and the caller must tell the two apart (`isAuthenticatable`, `isRestorable`).
 */
export const findForLogin = (email: string) =>
    userRepository.findForSignInByEmail(email, new Date());

/**
 * The credentialed account already linked to this federated identity, if any — `select: false`
 * fields included because a caller may need to build a 2FA login challenge off
 * `user.twoFactorMethods` right after. Filtered like {@link findForLogin}: a deactivated or
 * soft-deleted account must not walk straight into a session through a provider it linked before
 * either happened, while an owner-scheduled deletion inside its grace is returned for the restore.
 */
export const findByOAuthIdentity = (provider: string, providerId: string) =>
    userRepository.findForSignInByOAuthIdentity(provider, providerId, new Date());

/** The hydrated document with the pending-email-change field loaded. */
export const findByIdWithPendingEmail = (id: string) => userRepository.findByIdWithPendingEmail(id);

/** Whether `email` (or its pending-change counterpart) is already taken by another account. */
export const emailOrPendingEmailTaken = (email: string, excludingId: string) =>
    userRepository.emailOrPendingEmailTaken(email, excludingId);

/** Whether an account already exists for this email — signup's duplicate-email pre-check. */
export const emailTaken = (email: string): Promise<boolean> => userRepository.emailTaken(email);
