import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { PERSONA_NAMES, personas } from '@scenarios/personas-schema';

/** The roles `shared/authorization-roles.yaml` defines, as `scope:name`. */
const definedRoles = new Set(
    (
        parse(
            readFileSync(path.join(process.cwd(), 'shared', 'authorization-roles.yaml'), 'utf8')
        ) as { roles: { name: string; scope: string }[] }
    ).roles.map(({ scope, name }) => `${scope}:${name}`)
);

/** Every membership of every account, as `scope:role`. */
const memberships = PERSONA_NAMES.flatMap((name) =>
    personas.accounts[name].memberships.map(({ scope, role }) => `${scope}:${role}`)
);

describe('shared/scenarios/personas.yaml', () => {
    it('only grants roles the roles file defines', () => {
        for (const membership of memberships) expect(definedRoles.has(membership)).toBe(true);
    });

    it('arms an authenticator on exactly the accounts that hold a staff role', () => {
        const armed = PERSONA_NAMES.filter((name) => personas.accounts[name].state.authenticator);
        const staff = PERSONA_NAMES.filter(
            (name) => personas.accounts[name].memberships.length > 0
        );
        expect(armed).toEqual(staff);
    });

    it('gives every account its own address and username', () => {
        const accounts = PERSONA_NAMES.map((name) => personas.accounts[name]);
        expect(new Set(accounts.map(({ email }) => email)).size).toBe(accounts.length);
        expect(new Set(accounts.map(({ username }) => username)).size).toBe(accounts.length);
    });
});
