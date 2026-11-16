// citation-fixture: the docs/… strings in this file are checker inputs, not citations
/**
 * `scripts/docs/document-facts.ts` — which `npm run` claims a page makes and which of them fail.
 */
import {
    missingFrontMatter,
    missingScripts,
    npmScriptsCited
} from '../../../../scripts/docs/document-facts';

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

/** A page of the given markdown, under `docs/build` unless a path is given. */
const page = (text: string, path = 'docs/build/a.md') => ({ path, text });

describe('missingFrontMatter', () => {
    it('accepts a page with a known type and a non-empty known audience', () => {
        const text = '---\ntype: task\naudience: [developer, operator]\n---\n\n# A\n';
        expect(missingFrontMatter([page(text)])).toEqual([]);
    });

    it('reports a page with no block at all', () => {
        expect(missingFrontMatter([page('# A\n')])).toEqual([
            { page: 'docs/build/a.md', problem: 'no front-matter block (type, audience)' }
        ]);
    });

    it('reports an unknown type', () => {
        const findings = missingFrontMatter([page('---\ntype: essay\naudience: [anyone]\n---\n')]);
        expect(findings.map((finding) => finding.problem)).toEqual([
            expect.stringContaining('`type` must be one of')
        ]);
    });

    it('reports a missing, empty or unknown audience', () => {
        const texts = [
            '---\ntype: task\n---\n',
            '---\ntype: task\naudience: []\n---\n',
            '---\ntype: task\naudience: [dev]\n---\n'
        ];
        for (const text of texts)
            expect(missingFrontMatter([page(text)]).map((finding) => finding.problem)).toEqual([
                expect.stringContaining('`audience` must be a non-empty list')
            ]);
    });

    it('leaves the home page alone', () => {
        expect(missingFrontMatter([page('---\nlayout: home\n---\n', 'docs/index.md')])).toEqual([]);
    });
});
