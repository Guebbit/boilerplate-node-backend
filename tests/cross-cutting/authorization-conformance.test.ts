/**
 * The cases the PHP twin must answer identically — `shared/cases/authorization.cases.yaml`, run
 * against this repository's own evaluator.
 *
 * The file is committed with identical bytes in both backends and nothing copies it between them,
 * the same arrangement the Spectral rulesets have. Each side runs it against its own
 * implementation: CASL here, Laravel's Gate and Policies there. The twins are twins exactly as
 * far as this file says they are, which is why it holds the DENY cases — a widened scope does not
 * fail a test that only checks the right thing is allowed.
 *
 * The floors below are the point, and they are the same guard `check-references.ts` uses. A suite
 * that silently reads zero cases reports a clean model forever, which is worse than no suite. The
 * allow/deny split is floored separately because an evaluator that refuses everything passes
 * every deny case in the file.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { subject } from '@casl/ability';
import type { Caller } from '@types';
import { buildAbility } from '@kernel/ability';
import { AUDIENCE_ROLES, assembleCaller, permissionsOfRole } from '@kernel/permissions';
import type { AudienceName } from '@kernel/permissions';
import { isDeployed } from '@tests/paths';

/**
 * A caller as the YAML writes it. `role` and `audience` are expanded from the roles file; raw
 * `permissions` stays for cases about the model itself.
 */
interface CaseCaller {
    /** The caller's account id; `null` for an anonymous one. */
    id: string | null;
    /** Whether the caller acts for the platform or a tenant. */
    scope: Caller['scope'];
    /** The tenant the caller belongs to; `null` outside one. */
    tenantId: string | null;
    /** Raw permission keys, for a case about the model itself. */
    permissions?: string[];
    /** A role name from the roles file, expanded to its permissions. */
    role?: string;
    /** An audience from the roles file, expanded the same way. */
    audience?: AudienceName;
}

/** One row of the shared cases file. */
interface ConformanceCase {
    /** The case's title in the YAML. */
    name: string;
    /** Who asks. */
    caller: CaseCaller;
    /** What they ask to do. */
    action: string;
    /** What they ask to do it to. */
    subject: string;
    /** The row's fields the rule may look at (owner, tenant, ...). */
    resource: Record<string, unknown>;
    /** The answer both backends must give. */
    expect: 'allow' | 'deny';
}

/** The shared authorization cases both backends must answer the same. */
const { cases } = parse(
    readFileSync(
        path.join(__dirname, '..', '..', 'shared', 'cases', 'authorization.cases.yaml'),
        'utf8'
    )
) as { cases: ConformanceCase[] };

/**
 * The rules a case's caller holds: its role's expansion, its audience's, and any raw list, so a
 * role change in the roles file reaches every case that names it.
 */
const callerOf = (declared: CaseCaller): Caller =>
    assembleCaller(declared.id, declared.tenantId, declared.scope, [
        ...new Set([
            ...(declared.role === undefined ? [] : permissionsOfRole(declared.role)),
            ...(declared.audience === undefined
                ? []
                : AUDIENCE_ROLES[declared.audience].permissions),
            ...(declared.permissions ?? [])
        ])
    ]);

/**
 * The shop's cases are more than half the file. A checkout without the shop (`demo:remove` drops
 * them with the modules) is held to the floors the foundation cases alone clear, so the guard
 * against a silently empty file stays real in both.
 */
const shopDeployed = isDeployed('orders');
/** Floor on how many cases the file holds, so an emptied file cannot pass. */
const MIN_CASES = shopDeployed ? 30 : 20;
/** Floor on how many deny cases the file holds. */
const MIN_DENY = shopDeployed ? 20 : 12;
/** Floor on how many allow cases the file holds. */
const MIN_ALLOW = shopDeployed ? 10 : 6;

describe('the shared conformance suite', () => {
    it('reads enough cases to be worth running', () => {
        expect(cases.length).toBeGreaterThanOrEqual(MIN_CASES);
        expect(cases.filter((one) => one.expect === 'deny').length).toBeGreaterThanOrEqual(
            MIN_DENY
        );
        expect(cases.filter((one) => one.expect === 'allow').length).toBeGreaterThanOrEqual(
            MIN_ALLOW
        );
    });

    it.each(cases.map((one) => [one.expect, one.name, one] as const))(
        '%s: %s',
        (expected, _name, one) => {
            /**
             * `subject()` names the type of a plain object. The resource arrives as attributes
             * from a YAML file with no class behind it, which is the shape a rule is actually
             * about and the shape a query filter takes — these cases describe rows, not
             * instances.
             */
            const allowed = buildAbility(callerOf(one.caller)).can(
                one.action,
                subject(one.subject, { ...one.resource })
            );

            expect(allowed ? 'allow' : 'deny').toBe(expected);
        }
    );
});
