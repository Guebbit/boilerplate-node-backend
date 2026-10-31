/**
 * @module
 * The callback's error codes in code and in the contract are one list: the redirect the browser
 * follows is the only place a client learns why the round trip failed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { OAUTH_CALLBACK_ERRORS } from '../../oauth/callback-errors';

/** The slice of the account fragment this test reads. */
interface AccountFragment {
    paths: Record<
        string,
        {
            get?: {
                responses?: Record<
                    string,
                    { 'x-redirect-query'?: { error?: { enum?: string[] } } }
                >;
            };
        }
    >;
}

/** The codes the contract lists on the callback's `302`. */
const declaredCodes = (): string[] | undefined => {
    const fragment = parse(
        readFileSync(path.join(process.cwd(), 'src/modules/account/openapi.yaml'), 'utf8')
    ) as AccountFragment;
    return fragment.paths['/account/oauth/{provider}/callback']?.get?.responses?.['302']?.[
        'x-redirect-query'
    ]?.error?.enum;
};

describe('the OAuth callback error codes', () => {
    it('are exactly the ones the contract lists on the 302, in the same order', () => {
        expect(declaredCodes()).toEqual([...OAUTH_CALLBACK_ERRORS]);
    });
});
