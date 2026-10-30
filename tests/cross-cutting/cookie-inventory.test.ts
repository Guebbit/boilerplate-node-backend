/**
 * `shared/rules/cookies.yaml` against the places that must agree with it: the contract's
 * `cookieAuth` name, and the GDPR table generated from it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { cookieData } from '@infrastructure/http/cookies.generated';

/** The part of the root contract fragment this test reads. */
interface RootContract {
    components: { securitySchemes: { cookieAuth: { name: string } } };
}

describe('the cookie inventory', () => {
    it('holds exactly the ten cookies the backend sets', () => {
        // Pinned on purpose: a cookie added or dropped is a decision, and the count says so.
        expect(Object.keys(cookieData)).toHaveLength(10);
    });

    it("names the session cookie as the contract's cookieAuth does", () => {
        const contract = parse(
            readFileSync(path.join(REPO_ROOT, 'shared/contracts/openapi.root.yaml'), 'utf8')
        ) as RootContract;

        expect(cookieData.session.name).toBe(contract.components.securitySchemes.cookieAuth.name);
    });

    it('is printed in full in the data-protection page', () => {
        const page = readFileSync(path.join(REPO_ROOT, 'docs/theory/data-protection.md'), 'utf8');

        for (const cookie of Object.values(cookieData))
            expect(page).toContain(`\`${cookie.name}\``);
    });
});
