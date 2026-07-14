import { z } from 'zod';
import { t } from 'i18next';
import { CreateUserBody, createUserBodyPasswordMin } from '@api/schemas.zod';

/**
 * Zod validation schema for user data.
 * Built on the orval-generated CreateUserBody (kept in sync with openapi.yaml)
 * so only fields needing custom i18n messages or looser rules are overridden.
 * imageUrl is a relative upload path (see resolveImageUrl), not an absolute
 * URL, so it can't use the generated `.url()` field as-is.
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
        .min(createUserBodyPasswordMin, { message: t('signup.user-field-password-min') as string }),

    imageUrl: z.string().nullish()
});
