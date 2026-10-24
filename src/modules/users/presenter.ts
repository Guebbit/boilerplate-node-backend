/**
 * @module
 * The one place a stored account becomes the `Account` or `User` contract — `account`'s own
 * controllers reach this through `userService.toAccount`, never `./model` directly (the
 * persistence wall): a controller may not reach a module's model layer, so the shaping helper it
 * needs rides through the service. Pure: the lookups and the `actions` rules sit in `./services`.
 */

import type { Account, User, UserActions } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { decryptPii } from '@infrastructure/security/pii-encryption';
import { phoneAad, type UserWire } from './model';
import { activeHoldOf } from './services/purchase-hold';

/**
 * The `purchaseHold` field while a hold is in force, or nothing: an expired or lifted hold is left
 * out, and who set it never reaches the wire (the audit row names them).
 *
 * @param document - the account
 */
const presentPurchaseHold = (document: UserWire): Pick<Account, 'purchaseHold'> => {
    const hold = activeHoldOf(document, new Date());
    return hold === undefined
        ? {}
        : {
              purchaseHold: {
                  until: hold.until.toISOString(),
                  reason: hold.reason,
                  ...(hold.note === undefined ? {} : { note: hold.note }),
                  setAt: hold.setAt.toISOString()
              }
          };
};

/**
 * The fields `Account` and `User` share, ISO-stringifying the four {@link UserWire} redeclares as
 * `Date`. Takes {@link UserWire} rather than {@link UserDocument}: a hydrated document satisfies it
 * too (a superset), and `search()`'s already-normalized rows — which never carry
 * `password`/`tokens`/2FA credential material to begin with — need no document methods this only
 * ever reads plain fields off anyway.
 *
 * @param document - the account
 * @param role - the caller's CURRENT tenant role, read from the membership store by whoever calls
 *   this — never off the document, which holds no role of its own. `null` prints as absent, the
 *   same as every other optional field below.
 */
const sharedFields = (document: UserWire, role: string | null): Account => ({
    id: document.id,
    email: document.email,
    username: document.username,
    ...(role === null ? {} : { role }),
    ...(document.active === undefined ? {} : { active: document.active }),
    ...(document.verifiedAt ? { verifiedAt: document.verifiedAt.toISOString() } : {}),
    ...(document.pendingEmail === undefined ? {} : { pendingEmail: document.pendingEmail }),
    ...(document.imageUrl === undefined ? {} : { imageUrl: document.imageUrl }),
    ...(document.thumbnailUrl === undefined ? {} : { thumbnailUrl: document.thumbnailUrl }),
    ...(document.locale === undefined ? {} : { locale: document.locale }),
    // Stored encrypted (`./services/update`, under `NODE_PII_ENCRYPTION_KEY`) — this is the
    // one place a document's `phone` reaches the wire, hydrated or lean/searched alike, so it's
    // the one place that decrypts it.
    ...(document.phone === undefined
        ? {}
        : { phone: decryptPii(document.phone, phoneAad(document.id), 'user phone') }),
    ...(document.website === undefined ? {} : { website: document.website }),
    ...(document.analyticsConsent === undefined
        ? {}
        : { analyticsConsent: document.analyticsConsent }),
    ...(document.analyticsConsentAt
        ? { analyticsConsentAt: document.analyticsConsentAt.toISOString() }
        : {}),
    ...(document.termsAcceptedAt
        ? { termsAcceptedAt: document.termsAcceptedAt.toISOString() }
        : {}),
    ...(document.termsVersion === undefined ? {} : { termsVersion: document.termsVersion }),
    ...(document.twoFactorEnabledAt
        ? { twoFactorEnabledAt: document.twoFactorEnabledAt.toISOString() }
        : {}),
    ...(document.createdAt ? { createdAt: document.createdAt.toISOString() } : {}),
    ...(document.updatedAt ? { updatedAt: document.updatedAt.toISOString() } : {}),
    ...(document.deletedAt ? { deletedAt: document.deletedAt.toISOString() } : {}),
    ...presentPurchaseHold(document)
});

/**
 * An account as its own holder sees it (`/account`, the signup answer): no `actions`, and not the
 * shop's flag for staff.
 *
 * @param document - the account
 * @param role - the account's CURRENT tenant role, `null` for none
 */
export const presentAccount = (document: UserWire, role: string | null): Account =>
    carryVersion(document, sharedFields(document, role));

/**
 * An account as staff see it on the `/users` reads and writes: every shared field, the finished
 * `actions` block ({@link userActionsFor}, assembled by the caller) and the review flag. Only maps;
 * the rules behind `actions` live in `./services/actions`.
 *
 * @param document - the account
 * @param role - the account's CURRENT tenant role, `null` for none
 * @param actions - what the requesting caller may do to this account
 */
export const presentUser = (document: UserWire, role: string | null, actions: UserActions): User =>
    carryVersion(document, {
        ...sharedFields(document, role),
        actions,
        ...(document.purgeAt ? { purgeAt: document.purgeAt.toISOString() } : {}),
        ...(document.purchaseHoldFlaggedAt === undefined
            ? {}
            : { purchaseHoldFlaggedAt: document.purchaseHoldFlaggedAt.toISOString() })
    });
