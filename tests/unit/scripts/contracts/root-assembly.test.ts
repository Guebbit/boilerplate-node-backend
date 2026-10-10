import { parse as parseYaml } from 'yaml';
import {
    assembleRoot,
    pathRefFor,
    type ModuleFragment
} from '../../../../scripts/contracts/root-assembly';

/** A root shaped like the real one: a system path, a comment, module refs in a chosen order, a tag list. */
const ROOT = `openapi: 3.1.0
tags:
    - name: Alpha
      description: keeps its description
paths:
    /:
        get:
            summary: the shell
    # ---------- alpha ----------
    /alpha:
        $ref: '${pathRefFor('alpha', '/alpha')}'
    # ---------- gone ----------
    /gone:
        $ref: '${pathRefFor('gone', '/gone')}'
    /alpha/{id}:
        $ref: '${pathRefFor('alpha', '/alpha/{id}')}'
`;

const alpha: ModuleFragment = {
    section: 'alpha',
    paths: ['/alpha', '/alpha/{id}'],
    tags: ['Alpha']
};
const widgets: ModuleFragment = {
    section: 'widgets',
    paths: ['/widgets', '/widgets/{id}'],
    tags: ['Widgets']
};

/** The assembled root, parsed. */
const assembled = (fragments: ModuleFragment[]) =>
    parseYaml(assembleRoot(ROOT, fragments)) as {
        tags: { name: string; description?: string }[];
        paths: Record<string, Record<string, unknown>>;
    };

describe('assembleRoot', () => {
    it('leaves a root that already matches its fragments as it was', () => {
        const fragments = [alpha];
        const withoutGone = ROOT.replace(/ {4}# -+ gone -+\n {4}\/gone:\n {8}\$ref: '[^']+'\n/, '');

        expect(assembleRoot(withoutGone, fragments)).toBe(withoutGone);
    });

    it('appends the paths and tags of a module the root has not heard of, after the existing ones', () => {
        const { paths, tags } = assembled([alpha, widgets]);

        expect(Object.keys(paths)).toEqual([
            '/',
            '/alpha',
            '/alpha/{id}',
            '/widgets',
            '/widgets/{id}'
        ]);
        expect(paths['/widgets']).toEqual({ $ref: pathRefFor('widgets', '/widgets') });
        expect(tags.map(({ name }) => name)).toEqual(['Alpha', 'Widgets']);
    });

    it('drops the refs of a module whose folder is gone, so deleting one edits nothing', () => {
        expect(Object.keys(assembled([alpha]).paths)).not.toContain('/gone');
    });

    it('keeps what the root declares itself, and a tag it already describes', () => {
        const { paths, tags } = assembled([alpha, widgets]);

        expect(paths['/']).toEqual({ get: { summary: 'the shell' } });
        expect(tags[0]).toEqual({ name: 'Alpha', description: 'keeps its description' });
    });

    it('keeps the root order of the paths it already lists', () => {
        // `/alpha/{id}` sits after the removed `/gone` in the root; it must not move ahead of `/alpha`.
        expect(Object.keys(assembled([alpha]).paths)).toEqual(['/', '/alpha', '/alpha/{id}']);
    });

    it('keeps the comments of the root', () => {
        expect(assembleRoot(ROOT, [alpha])).toContain('# ---------- alpha ----------');
    });

    it('escapes a path the way a JSON pointer does', () => {
        expect(pathRefFor('a', '/x~y/{id}')).toBe(
            '../../src/modules/a/openapi.yaml#/paths/~1x~0y~1{id}'
        );
    });

    it('refuses a root with no paths map', () => {
        expect(() => assembleRoot('openapi: 3.1.0\n', [alpha])).toThrow(/no `paths` map/);
    });

    it("declares a tag with the fragment's own description, and a used-only tag bare", () => {
        const described: ModuleFragment = {
            section: 'widgets',
            paths: ['/widgets'],
            tags: ['Widgets', 'Extras'],
            declaredTags: [{ name: 'Widgets', description: 'Small parts.' }]
        };

        expect(assembled([alpha, described]).tags).toEqual([
            { name: 'Alpha', description: 'keeps its description' },
            { name: 'Widgets', description: 'Small parts.' },
            { name: 'Extras' }
        ]);
    });

    it('lists a tag the fragment declares even when no operation uses it yet', () => {
        const declaresOnly: ModuleFragment = {
            section: 'widgets',
            paths: [],
            tags: [],
            declaredTags: [{ name: 'Widgets', description: 'Small parts.' }]
        };

        expect(assembled([declaresOnly]).tags.map(({ name }) => name)).toContain('Widgets');
    });
});
