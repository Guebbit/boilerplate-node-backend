/**
 * `shared/rules/cookies.yaml` against the places that must agree with it: the contract's
 * `cookieAuth` name.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { cookieData } from '@infrastructure/http/cookies.generated';

/** The part of the root contract fragment this test reads. */
interface RootContract {
    /** The spec's reusable parts; only the cookie auth scheme is read. */
    components: { securitySchemes: { cookieAuth: { name: string } } };
}

describe('the cookie inventory', () => {
    it("names the session cookie as the contract's cookieAuth does", () => {
        const contract = parse(
            readFileSync(path.join(REPO_ROOT, 'shared/contracts/openapi.root.yaml'), 'utf8')
        ) as RootContract;

        expect(cookieData.session.name).toBe(contract.components.securitySchemes.cookieAuth.name);
    });
});
