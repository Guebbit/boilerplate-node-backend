/**
 * @module
 * Signup — `POST /account/signup`: validate, gate (breach corpus, anti-automation), then create the
 * account and its starting role in one transaction. Logging in is `./login`.
 */

import { z } from 'zod';
import { getCurrentLocale, t } from '@infrastructure/i18n';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { SignupBody } from '@api/schemas.zod';
import { userService, type UserDocument } from '@modules/users';
import { parseFormBoolean } from '@infrastructure/http/request';
import type { CallerContext } from '@types';
import { optionalBooleanSchema } from '@infrastructure/http/schemas';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { analyticsAnswer, termsAcceptance } from '../consent-record';

/**
 * Everything `POST /account/signup` collects. One object rather than a positional list because
 * some of these are optional and two are booleans — an argument order nothing but a comment
 * would keep honest. No image: signup takes none, so the new account has none.
 */
export interface SignupInput {
    /** The submitted address; `SignupBody` owns its shape. */
    email: string;

    /** The submitted display name. */
    username: string;

    /** The submitted password, in the clear; hashed on the way to the document. */
    password: string;

    /** The repeat, compared against `password` and never stored. */
    passwordConfirm: string;

    /**
     * Optional like `UpdateAccountRequest`'s, but with no "leave it alone" reading — there is no
     * prior value at signup, so absent and `false` mean the same thing here.
     */
    analyticsConsent: boolean | undefined;

    /**
     * The checkbox itself. `signup`'s schema rejects anything but `true`; what is stored is the
     * moment and the text version (`termsAcceptance`), not this boolean.
     */
    termsAccepted: boolean;
}

/**
 * Rejects a password found in a breach corpus. Checked ahead of the email-policy check and the
 * database lookup below: a breached password fails signup on its own, so there's nothing to gain
 * from checking anything else first.
 * @returns the 422 reject, or `undefined` to let signup continue
 */
const guardBreachedPassword = (password: string): Promise<ResponseReject | undefined> =>
    assertPasswordNotBreached(password).then((breachErrors) =>
        breachErrors.length > 0 ? generateReject(422, breachErrors) : undefined
    );

/**
 * Rung 2 of the anti-automation ladder — off by default, see `adapters/antibot`. A refused
 * verdict answers exactly like a genuine signup, from a document this call never persists — a
 * script gets nothing to iterate on. The unsaved-document check is how the audit trail and the
 * upload cleanup still tell the two apart.
 * @returns the decoy success, or `undefined` to let signup continue
 */
const guardEmailPolicy = (input: SignupInput): Promise<ResponseSuccess<UserDocument> | undefined> =>
    checkEmailPolicy(input.email).then((verdict) =>
        verdict === 'refused'
            ? generateSuccess<UserDocument>(
                  userService.buildSignupDecoy({
                      email: input.email,
                      username: input.username,
                      ...analyticsAnswer(input.analyticsConsent),
                      ...termsAcceptance()
                  })
              )
            : undefined
    );

/**
 * The one database round trip signup can't skip: an email already on an account refuses here,
 * everything else creates one — one `.catch` for both, since a taken email is answered from the
 * same lookup a database error would also throw from.
 */
const createAccountIfEmailFree = (
    input: SignupInput
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userService
        .emailTaken(input.email)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((taken) => {
            if (taken) return generateReject(409, [t('account.signup.email-already-used')]);
            return userService
                .registerSelfService({
                    username: input.username,
                    email: input.email,
                    password: input.password,
                    ...analyticsAnswer(input.analyticsConsent),
                    ...termsAcceptance(),
                    // The language they signed up in, kept for work that happens later without a
                    // request to read `Accept-Language` from — a queued email, a nightly job.
                    // Editable afterwards from the user endpoints.
                    locale: getCurrentLocale()
                })
                .then((createdUser) =>
                    userService
                        .enqueueIfPending(createdUser)
                        .then((user) => generateSuccess<UserDocument>(user))
                );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Register new user.
 *
 * @param input - the submitted fields and the server-derived image paths
 * @param callerContext - the request's context, for the audit and analytics records
 */
export const signup = (
    input: SignupInput,
    callerContext: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const { email, username, password, passwordConfirm, analyticsConsent, termsAccepted } = input;

    const parseResult = SignupBody.extend({
        // Shared with `PUT/PATCH /account`'s: both decode the same multipart-string trap
        // (`optionalBooleanSchema`'s own doc covers it), signup just narrows it to
        // non-optional-by-intent (absent lands as `undefined`, stored as `false`).
        analyticsConsent: optionalBooleanSchema,
        // Not `optionalBooleanSchema`'s shape: signup needs the multipart decode
        // (`parseFormBoolean`) but a literal-true requirement, not an optional one.
        termsAccepted: z.preprocess(
            parseFormBoolean,
            z.literal(true, { error: () => t('account.signup.terms-not-accepted') })
        )
    })
        .superRefine(({ passwordConfirm, password }, refinementContext) => {
            if (passwordConfirm !== password)
                refinementContext.addIssue({
                    code: 'custom',
                    message: t('account.signup.password-dont-match'),
                    path: ['passwordConfirm']
                });
        })
        .safeParse({
            email,
            username,
            password,
            passwordConfirm,
            analyticsConsent,
            termsAccepted
        });

    // One gate per line: a breached password, then the antibot decoy, then the email-taken
    // lookup that creates the account — the first one to answer is what signup returns.
    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> = parseResult.success
        ? guardBreachedPassword(password)
              .then<ResponseReject | ResponseSuccess<UserDocument> | undefined>(
                  (rejected) => rejected ?? guardEmailPolicy(input)
              )
              .then<ResponseReject | ResponseSuccess<UserDocument>>(
                  (settled) => settled ?? createAccountIfEmailFree(input)
              )
        : Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return outcome.then((result) => {
        // The audit trail must not name an account rung 2 refused, or record it as anything other
        // than the refusal it was.
        // `Document#isNew` stays true until `.save()`, and the rung-2 refusal path is the only
        // one that returns a document never saved — so it reads backwards here: true means NO
        // account was created. https://mongoosejs.com/docs/api/document.html#Document.prototype.isNew
        if (!result.success || result.data.isNew) {
            recordAudit(callerContext, {
                action: accountAuditActions.AUTH_SIGNED_UP,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                outcome: 'failure'
            });
            return result;
        }

        const newUserId = result.data.id;
        recordAudit(callerContext, {
            action: accountAuditActions.AUTH_SIGNED_UP,
            actorUserId: newUserId,
            actorRole: 'user',
            outcome: 'success'
        });
        emitAnalyticsEvent({
            ...buildAnalyticsBase(callerContext),
            distinctId: newUserId,
            event: accountAnalyticsEvents.USER_SIGNED_UP
        });
        return result;
    });
};
