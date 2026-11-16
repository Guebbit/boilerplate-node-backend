/**
 * `scripts/docs/code-citations.ts` — the `docs/…` links cited outside `docs/`, run through the
 * same function `check-references.ts` calls, against a scratch repo whose files git tracks.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { anchorlessSeeTags, deadCodeCitations } from '../../../../scripts/docs/code-citations';
import { gitEnvironment } from '../../../../scripts/docs/repo-references';

/** `execFile` without blocking the event loop. */
const run = promisify(execFile);

describe('deadCodeCitations', () => {
    /** A scratch repo, so the case controls exactly which pages and citing files exist. */
    let root: string;

    /** Writes `files` into the scratch repo and stages them (`ls-files` reads the index). */
    const track = async (files: Record<string, string>): Promise<string[]> => {
        for (const [file, text] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(root, file)), { recursive: true });
            await writeFile(path.join(root, file), text);
        }
        await run('git', ['add', '.'], { cwd: root, env: gitEnvironment() });
        const { stdout } = await run('git', ['ls-files'], { cwd: root, env: gitEnvironment() });
        return stdout.split('\n').filter(Boolean);
    };

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), 'code-citations-'));
        await run('git', ['init', '--quiet'], { cwd: root, env: gitEnvironment() });
    });

    afterEach(() => rm(root, { recursive: true, force: true }));

    it('accepts a cited page and a cited anchor that is one of its headings', async () => {
        const files = await track({
            'docs/modules/orders.md': '# orders\n\n## Cancel — the rules\n',
            'src/a.ts': '// See: docs/modules/orders.md#cancel-—-the-rules\n',
            '.env-example': '# docs/modules/orders.md\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([]);
    });

    it('reports an anchor that no heading of the page answers to', async () => {
        const files = await track({
            'docs/modules/orders.md': '# orders\n\n## Cancel\n',
            'src/a.ts': '// See: docs/modules/orders.md#renamed-heading\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([
            'src/a.ts: docs/modules/orders.md#renamed-heading'
        ]);
    });

    it('reports a page that is not tracked, in contract YAML too', async () => {
        const files = await track({
            'docs/modules/orders.md': '# orders\n',
            'src/modules/orders/openapi.yaml': 'description: see docs/modules/gone.md#x.\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([
            'src/modules/orders/openapi.yaml: docs/modules/gone.md#x'
        ]);
    });

    it('leaves a URL and a peer repo page alone', async () => {
        const files = await track({
            'src/a.ts': '// https://example.com/docs/nope.md\n// peer-repo/docs/tools/other.md#x\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([]);
    });

    it('ends an anchor at a template-literal `$`, `{` or `}`', async () => {
        const files = await track({
            'docs/modules/orders.md': '# orders\n\n## Cancel\n',
            'src/a.ts':
                '// `docs/modules/orders.md#cancel${suffix}` and docs/modules/orders.md#cancel}\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([]);
    });

    it('sweeps a test file and a `./docs/…` link in the README', async () => {
        const files = await track({
            'docs/modules/orders.md': '# orders\n',
            'tests/x.test.ts': '// docs/modules/gone.md\n',
            'README.md': '[x](./docs/modules/orders.md) [y](./docs/modules/missing.md)\n'
        });

        expect(deadCodeCitations(root, files)).toEqual([
            'README.md: docs/modules/missing.md',
            'tests/x.test.ts: docs/modules/gone.md'
        ]);
    });

    it('does not report a dead string under a fixture path', async () => {
        const files = await track({
            'tests/unit/scripts/docs/case.test.ts': "const page = 'docs/modules/gone.md';\n"
        });

        expect(deadCodeCitations(root, files)).toEqual([]);
    });
});

describe('anchorlessSeeTags', () => {
    /** A scratch repo, so the case controls exactly which files exist. */
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), 'anchorless-see-'));
        await mkdir(path.join(root, 'src'), { recursive: true });
    });

    afterEach(() => rm(root, { recursive: true, force: true }));

    it('names a docblock @see that has no anchor, and leaves an anchored one and a YAML See: alone', async () => {
        await writeFile(
            path.join(root, 'src/a.ts'),
            [
                '/**',
                ' * A thing.',
                ' * @see docs/modules/orders.md',
                ' * @see docs/modules/orders.md#cancel',
                ' * @see docs/modules/orders.md and what it says about carts',
                ' */',
                'export const a = 1;'
            ].join('\n')
        );
        await writeFile(path.join(root, 'src/b.yaml'), '# See: docs/modules/orders.md\n');

        expect(anchorlessSeeTags(root, ['src/a.ts', 'src/b.yaml'])).toEqual([
            'src/a.ts:3: docs/modules/orders.md',
            'src/a.ts:5: docs/modules/orders.md'
        ]);
    });
});
