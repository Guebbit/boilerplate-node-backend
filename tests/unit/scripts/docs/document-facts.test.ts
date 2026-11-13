/**
 * `scripts/docs/document-facts.ts` — which `npm run` claims a page makes and which of them fail.
 */
import { missingScripts, npmScriptsCited } from '../../../../scripts/docs/document-facts';

describe('npmScriptsCited', () => {
    it('reads inline and fenced commands, once each', () => {
        const text = 'Run `npm run check`.\n```sh\nnpm run gen:api -- --x\nnpm run check\n```';
        expect(npmScriptsCited(text)).toEqual(['check', 'gen:api']);
    });

    it('drops the colon of a prose wildcard', () => {
        expect(npmScriptsCited('the `npm run test:*` family')).toEqual(['test']);
    });
});

describe('missingScripts', () => {
    const pages = [{ path: 'docs/a.md', text: 'npm run here, npm run there, npm run gone' }];

    it('accepts a script defined in either repo and reports the rest', () => {
        expect(missingScripts(pages, new Set(['here', 'there']))).toEqual([
            { page: 'docs/a.md', problem: '`npm run gone` is not a script' }
        ]);
    });
});
