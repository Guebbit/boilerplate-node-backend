/**
 * @module
 * The schema of `shared/scenarios/personas.yaml`, and the one place that reads the file: the 13
 * demo login accounts, by the name the paired frontend's journeys use.
 *
 * Lives here, not under `src/infrastructure/`: infrastructure must not import `scenarios/`.
 * `scripts/contracts/generate-shared-rule-schemas.ts` exports it as JSON Schema.
 */

import { z } from 'zod';
import { loadSharedRules } from '../src/infrastructure/config/shared-rules/load';

/** The names a journey asks for. Order is the order the accounts are seeded in. */
export const PERSONA_NAMES = [
    'admin',
    'user',
    'editor',
    'moderator',
    'unverified',
    'twoFactor',
    'pendingEmail',
    'banned',
    'secondShopper',
    'manager',
    'warehouse',
    'support',
    'operator'
] as const;

/** One of the 13 account names. */
export type PersonaName = (typeof PERSONA_NAMES)[number];

/** What an account starts as; see the file's own header for each flag. */
const stateSchema = z.strictObject({
    verified: z.boolean(),
    active: z.boolean(),
    twoFactor: z.boolean(),
    authenticator: z.boolean(),
    pendingEmail: z.email().nullable(),
    analyticsConsent: z.boolean()
});

/** A role held in a scope; the role name is checked against the roles file by its own test. */
const membershipSchema = z.strictObject({
    scope: z.enum(['tenant', 'platform']),
    role: z.string().min(1)
});

/** One account. */
const accountSchema = z.strictObject({
    email: z.email(),
    username: z.string().min(1),
    defaultPassword: z.string().min(1),
    memberships: z.array(membershipSchema),
    state: stateSchema
});

/** Shape of `shared/scenarios/personas.yaml`: every named account, exactly once. */
export const personasSchema = z.strictObject({
    /** The base32 secret every authenticator-armed account is seeded with. */
    staffTotpSecret: z.string().min(1),
    accounts: z.strictObject(
        Object.fromEntries(PERSONA_NAMES.map((name) => [name, accountSchema])) as Record<
            PersonaName,
            typeof accountSchema
        >
    )
});

/** One account, as parsed. */
export type Persona = z.infer<typeof accountSchema>;

/** The parsed file. */
export const personas = loadSharedRules('personas', personasSchema, 'scenarios');
