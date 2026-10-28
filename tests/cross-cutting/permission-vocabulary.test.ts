/**
 * The permission vocabulary has ONE home: `shared/authorization-keys.yaml`.
 *
 * `api/permission-vocabulary.ts` is generated from it, and `kernel/permissions.ts` (and through it
 * the Zod schema that validates every key) imports the result. This holds the two ends of that
 * chain: each generated list is the yaml's, and every declared rule, set and tier is in them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import {
    AUTHORIZATION_SCOPES,
    PERMISSION_ACTIONS,
    PERMISSION_PAIRS,
    PERMISSION_RULE_IDS,
    PERMISSION_SET_NAMES,
    PERMISSION_SUBJECTS,
    STEP_UP_TIERS
} from '@api/permission-vocabulary';
import { holds } from '@kernel/ability';
import { PERMISSION_RULES, PERMISSION_SETS, anonymousCaller } from '@kernel/permissions';
import { requirePermission } from '@kernel/middlewares/authorizations';
import { REPO_ROOT } from '@tests/paths';

const yaml = parse(
    readFileSync(path.join(REPO_ROOT, 'shared', 'authorization-keys.yaml'), 'utf8')
) as {
    actions: string[];
    scopes: Record<string, string>;
    stepUp: Record<string, number>;
    rules: { action: string; subject: string }[];
    sets: { name: string }[];
};

describe('permission vocabulary', () => {
    it('lists exactly what the shared yaml declares', () => {
        expect([...PERMISSION_ACTIONS]).toEqual(yaml.actions);
        expect([...AUTHORIZATION_SCOPES]).toEqual(Object.keys(yaml.scopes));
        expect([...STEP_UP_TIERS]).toEqual(Object.keys(yaml.stepUp));
        expect([...PERMISSION_SET_NAMES]).toEqual(yaml.sets.map((set) => set.name));
        expect([...PERMISSION_RULE_IDS]).toEqual(
            yaml.rules.map((rule) => `${rule.action}:${rule.subject}`)
        );
        expect([...PERMISSION_SUBJECTS]).toEqual([...new Set(yaml.rules.map((r) => r.subject))]);
    });

    it('carries every rule, set and tier the kernel loaded', () => {
        expect(PERMISSION_RULES.map((rule) => rule.id)).toEqual([...PERMISSION_RULE_IDS]);
        expect(PERMISSION_SETS.map((set) => set.name)).toEqual([...PERMISSION_SET_NAMES]);
        for (const rule of PERMISSION_RULES) {
            expect(yaml.actions).toContain(rule.action);
            if (rule.stepUp !== undefined) expect(STEP_UP_TIERS).toContain(rule.stepUp);
        }
    });

    it('maps each subject to the actions of the rules declared on it', () => {
        for (const rule of PERMISSION_RULES)
            expect(PERMISSION_PAIRS[rule.subject]).toContain(rule.action);
        expect(Object.keys(PERMISSION_PAIRS)).toEqual([...PERMISSION_SUBJECTS]);
    });

    it('refuses an undeclared pair at compile time, and still answers false at run time', () => {
        // @ts-expect-error -- `checkout` is not an action any rule carries on `Order`
        const asked = holds(anonymousCaller(), 'checkout', 'Order');
        expect(asked).toBe(false);
        // @ts-expect-error -- `Ordr` is not a declared subject
        expect(() => requirePermission('read', 'Ordr')).toThrow(/declare/i);
    });
});
