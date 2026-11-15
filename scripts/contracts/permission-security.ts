/**
 * @module
 * The permission an operation asks for, as the contract states it, and the 403 / 401 codes that
 * permission makes.
 *
 * A guarded operation names its permission in the standard OpenAPI slot, the scopes list of a
 * security requirement (OAS 3.1 allows role names there for non-OAuth schemes):
 *
 *     security:
 *         - bearerAuth: ['display:Payment']
 *         - apiKeyAuth: ['display:Payment']
 *
 * The bundler reads those names and writes the codes into `x-error-codes`, so no fragment lists
 * them by hand:
 *
 *   - 403: the rule's `deniedCode` (default `FORBIDDEN`);
 *   - 403: `SECOND_FACTOR_ENROLLMENT_REQUIRED`, where a staff role withheld for want of an
 *     authenticator app would hold the rule once enrolled (the pair `wouldHoldOnceEnrolled` asks);
 *   - 401: `REAUTH_REQUIRED`, where the rule carries a `stepUp` tier.
 *
 * Reads the rules through the kernel, never a copy: the question is the guard's own.
 *
 * @see docs/build/contract-fragmentation.md#the-permission-on-an-operation
 */

import {
    PRESET_ROLES,
    callerForSubject,
    findRule,
    staffRoleWithheld,
    type PermissionSubject
} from '@kernel/permissions';
import { holds } from '@kernel/ability';
import type { AuthContext } from '@types';
import type { Operation, Step } from './openapi-document';
import { operationsOf } from './openapi-document';

/** The schemes whose scopes slot carries a permission name. */
const PERMISSION_SCHEMES = ['bearerAuth', 'apiKeyAuth'] as const;

/** The 403 an unenrolled staff member gets where their role would have held the rule. */
const ENROLLMENT = 'SECOND_FACTOR_ENROLLMENT_REQUIRED';

/** The generic refusal, used where a rule names no `deniedCode`. */
const FORBIDDEN = 'FORBIDDEN';

/** The 401 a step-up rule answers. */
const REAUTH = 'REAUTH_REQUIRED';

/**
 * Every permission name an operation's security requirements carry, in first-seen order and
 * without repeats.
 *
 * @param operation - one bundled operation
 * @returns `['display:Payment', ...]`; empty for an operation that asks for none
 */
export const permissionNamesOf = (operation: Pick<Operation, 'security'>): string[] => [
    ...new Set(
        (operation.security ?? []).flatMap((requirement) =>
            PERMISSION_SCHEMES.flatMap((scheme) => requirement[scheme] ?? [])
        )
    )
];

/**
 * Whether a withheld staff role would hold the rule once its authenticator app is armed, and does
 * not hold it now. The same pair as `wouldHoldOnceEnrolled`, through the kernel's exported
 * helpers so `IMPLIED_BY` is honoured exactly as the guard honours it.
 *
 * @param name - the permission name, `<action>:<Subject>`
 */
const sendsEnrollment = (name: string): boolean => {
    const rule = findRule(name);
    if (rule === undefined) return false;
    const { action, subject } = rule;

    return PRESET_ROLES.some((role) =>
        [true, false].some((verified) => {
            // Only id, roles and the armed flag decide the answer; the rest is neutral filler.
            const context: AuthContext = {
                id: 'bundle',
                email: 'bundle@example.test',
                username: 'bundle',
                tenantId: 'bundle',
                verified,
                authTime: 0,
                amr: [],
                twoFactorArmed: false,
                authenticatorArmed: false,
                roles: {
                    tenant: role.scope === 'tenant' ? role.name : null,
                    platform: role.scope === 'platform' ? role.name : null
                }
            };
            const enrolled = { ...context, authenticatorArmed: true };

            return (
                staffRoleWithheld(context) &&
                // Widened to the whole subject union: the rule's own action/subject pair is valid
                // by construction, but the generic cannot correlate two runtime values.
                holds<PermissionSubject>(callerForSubject(enrolled, subject), action, subject) &&
                !holds<PermissionSubject>(callerForSubject(context, subject), action, subject)
            );
        })
    );
};

/**
 * The codes one permission obliges its operation to list, by status.
 *
 * @param name - the permission name, `<action>:<Subject>`
 * @param where - what to name in the error: `GET /payments`
 * @throws Error when no rule declares the name
 */
const codesOfPermission = (name: string, where: string): Record<string, string[]> => {
    const rule = findRule(name);
    if (rule === undefined)
        throw new Error(`[openapi] ${where}: security names "${name}", which no rule declares.`);

    return {
        '403': [rule.deniedCode ?? FORBIDDEN, ...(sendsEnrollment(name) ? [ENROLLMENT] : [])],
        ...(rule.stepUp ? { '401': [REAUTH] } : {})
    };
};

/**
 * Merges the codes every named permission makes into each operation's `x-error-codes`, sorted
 * within a status. Runs before the unknown-code check, so a code it writes is checked too.
 *
 * @throws Error when an operation names a permission no rule declares
 */
export const withPermissionErrorCodes: Step = (document_) => {
    for (const { route, method, operation } of operationsOf(document_)) {
        const where = `${method.toUpperCase()} ${route}`;
        const merged: Record<string, string[]> = { ...operation['x-error-codes'] };

        for (const name of permissionNamesOf(operation))
            for (const [status, codes] of Object.entries(codesOfPermission(name, where)))
                merged[status] = [...new Set([...(merged[status] ?? []), ...codes])].toSorted();

        if (Object.keys(merged).length > 0) operation['x-error-codes'] = merged;
    }
};
