import { z } from 'zod';
import { t } from 'i18next';
import { CreateUserBody, createUserBodyPasswordMin } from '@api/schemas.zod';

/**
 * Zod validation schema for user data.
 * Built on the orval-generated CreateUserBody (kept in sync with openapi.yaml)
 * so only fields needing custom i18n messages are overridden — `admin`, `active`
 * and `imageUrl` are inherited from the generated schema and validated with it.
 *
 * `imageUrl` used to be overridden to a plain string because the contract declared it
 * `format: uri` while the field actually holds a relative upload path (see resolveImageUrl).
 * The contract now says `uri-reference`, which is what it always meant, so the override is gone
 * and the two agree at the source instead of being reconciled here.
 */
export const zodUserSchema = CreateUserBody.extend({
    email: z
        .string()
        .min(1, { message: t('signup.user-field-email-required') as string })
        .email({ message: t('signup.user-field-email-invalid') as string }),

    username: z
        .string()
        .min(1, { message: t('signup.user-field-username-required') as string })
        .min(3, { message: t('signup.user-field-username-min') as string }),

    password: z
        .string()
        .min(1, { message: t('signup.user-field-password-required') as string })
        .min(createUserBodyPasswordMin, { message: t('signup.user-field-password-min') as string })
});
