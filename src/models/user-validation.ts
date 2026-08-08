import { z } from 'zod';
import { t } from '@core/i18n';
import { CreateUserBody, createUserBodyPasswordMin } from '@api/schemas.zod';

/**
 * Zod validation schema for user data.
 * Built on the orval-generated CreateUserBody (kept in sync with openapi.yaml)
 * so only fields needing custom i18n messages are overridden — `admin`, `active`
 * and `imageUrl` are inherited from the generated schema and validated with it.
 *
 * `imageUrl` needs no override: the contract declares it `uri-reference`, which is what a
 * relative upload path is (see resolveImageUrl), so the two agree at the source.
 *
 * Every message is a THUNK — `error: () => t('…')`, never `error: t('…')`. This module is
 * evaluated at import time, which ES module semantics guarantee happens before `i18next.init()`
 * in `app.ts`'s body; an eagerly-called `t()` returns `undefined` there and Zod silently reads
 * that as "no custom message" and falls back to its own English. A thunk is called by Zod at
 * parse time instead, when i18n is up and the request's locale is known (see `@core/i18n`).
 */
export const zodUserSchema = CreateUserBody.extend({
    email: z
        .string()
        .min(1, { error: () => t('signup.user-field-email-required') })
        .email({ error: () => t('signup.user-field-email-invalid') }),

    username: z
        .string()
        .min(1, { error: () => t('signup.user-field-username-required') })
        .min(3, { error: () => t('signup.user-field-username-min') }),

    password: z
        .string()
        .min(1, { error: () => t('signup.user-field-password-required') })
        .min(createUserBodyPasswordMin, { error: () => t('signup.user-field-password-min') })
});
