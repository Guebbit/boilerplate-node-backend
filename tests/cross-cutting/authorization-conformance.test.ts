/**
 * The cases the PHP twin must answer identically — `shared/authorization-conformance.yaml`, run
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
import { isDeployed } from '@tests/paths';

interface ConformanceCase {
    name: string;
    caller: Caller;
    action: string;
    subject: string;
    resource: Record<string, unknown>;
    expect: 'allow' | 'deny';
}

const { cases } = parse(
    readFileSync(
        path.join(__dirname, '..', '..', 'shared', 'authorization-conformance.yaml'),
        'utf8'
    )
) as { cases: ConformanceCase[] };

/**
 * The shop's cases are more than half the file. A checkout without the shop (`demo:remove` drops
 * them with the modules) is held to the floors the foundation cases alone clear, so the guard
 * against a silently empty file stays real in both.
 */
const shopDeployed = isDeployed('orders');
const MIN_CASES = shopDeployed ? 30 : 20;
const MIN_DENY = shopDeployed ? 20 : 12;
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
            /*
             * `subject()` names the type of a plain object. The resource arrives as attributes
             * from a YAML file with no class behind it, which is the shape a rule is actually
             * about and the shape a query filter takes — these cases describe rows, not
             * instances.
             */
            const allowed = buildAbility(one.caller).can(
                one.action,
                subject(one.subject, { ...one.resource })
            );

            expect(allowed ? 'allow' : 'deny').toBe(expected);
        }
    );
});
