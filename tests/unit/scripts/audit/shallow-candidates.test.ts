/**
 * `scripts/audit/code-shape/scripts/shallow-candidates.ts` — the counts the `code-shape` audit
 * judges by. Each case builds a tiny in-memory program, so a count is checked against code small
 * enough to count by eye.
 */
import ts from 'typescript';
import {
    findShallowCandidates,
    type ShallowReport
} from '../../../../scripts/audit/code-shape/scripts/shallow-candidates';

/** The virtual repo root every file below lives under. */
const ROOT = '/repo';

/**
 * Builds a program over in-memory files and lists its candidates.
 * TypeScript compiler host: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 *
 * @param files - repo-relative path → source text
 * @param scope - the scope to analyse, `src` by default
 * @returns the report
 */
const analyse = (files: Record<string, string>, scope: string[] = ['src']): ShallowReport => {
    const sources = new Map(Object.entries(files).map(([file, text]) => [`${ROOT}/${file}`, text]));
    // `noLib`: skip the standard library; resolving names between these files needs none of it.
    const options: ts.CompilerOptions = {
        noLib: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler
    };
    const host: ts.CompilerHost = {
        // `createSourceFile(…, true)`: set parent pointers, which the analysis walks up through.
        getSourceFile: (fileName) => {
            const text = sources.get(fileName);
            return text === undefined
                ? undefined
                : ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
        },
        fileExists: (fileName) => sources.has(fileName),
        readFile: (fileName) => sources.get(fileName),
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => undefined,
        getCurrentDirectory: () => ROOT,
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n'
    };
    // `createProgram`: type-checks the files together, so an import resolves to its declaration.
    const program = ts.createProgram({ rootNames: [...sources.keys()], options, host });
    return findShallowCandidates(program, ROOT, scope);
};

/**
 * The names in one candidate list.
 *
 * @param entries - a candidate list
 * @returns their names, or file paths for a file list
 */
const namesOf = (entries: ({ name: string } | { file: string })[]): string[] =>
    entries.map((entry) => ('name' in entry ? entry.name : entry.file));

describe('smallAndRare', () => {
    it('lists a one-line function with a single caller, and where the caller is', () => {
        const report = analyse({
            'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
            'src/use.ts': "import { add } from './math';\nexport const total = add(1, 2);"
        });

        expect(report.smallAndRare).toEqual([
            expect.objectContaining({
                name: 'add',
                file: 'src/math.ts',
                line: 1,
                bodyLines: 1,
                references: 1
            })
        ]);
        expect(report.smallAndRare[0]?.referencedFrom).toEqual(['src/use.ts']);
    });

    it('counts a renamed import and a shorthand property as uses of the same function', () => {
        const report = analyse({
            'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
            'src/use.ts':
                "import { add as plus } from './math';\nimport { add } from './math';\nexport const both = { plus, add };"
        });

        expect(report.smallAndRare.find((fn) => fn.name === 'add')?.references).toBe(2);
    });

    it('leaves out a function with more than two users', () => {
        const report = analyse({
            'src/math.ts':
                'const add = (a: number, b: number) => a + b;\nexport const all = [add(1, 2), add(3, 4), add(5, 6)];'
        });

        expect(namesOf(report.smallAndRare)).not.toContain('add');
    });

    it('leaves out a function nothing uses — dead code is knip’s to report', () => {
        const report = analyse({
            'src/math.ts': 'export const add = (a: number, b: number) => a + b;'
        });

        expect(report.smallAndRare).toEqual([]);
    });

    it('leaves out a body longer than three lines, however few statements it has', () => {
        const report = analyse({
            'src/chain.ts':
                'const long = (x: number) =>\n    [x]\n        .map((y) => y + 1)\n        .map((y) => y * 2)\n        .map((y) => y - 3);\nexport const value = long(1);'
        });

        expect(namesOf(report.smallAndRare)).not.toContain('long');
    });

    it('counts a test as a user without listing anything in it', () => {
        const report = analyse(
            {
                'src/math.ts': 'export function add(a: number, b: number) { return a + b; }',
                'tests/math.test.ts':
                    "import { add } from '../src/math';\nconst helper = () => add(1, 2);\nexport const result = helper();"
            },
            ['src']
        );

        expect(namesOf(report.smallAndRare)).toEqual(['add']);
        expect(report.smallAndRare[0]?.referencedFrom).toEqual(['tests/math.test.ts']);
    });

    it('never lists a function inside a module’s own tests folder', () => {
        const report = analyse({
            'src/modules/shop/tests/helpers.ts':
                'const make = () => 1;\nexport const made = make();'
        });

        expect(report.smallAndRare).toEqual([]);
    });
});

describe('passThroughs', () => {
    it('names the callee of a body that only forwards its own parameters', () => {
        const report = analyse({
            'src/repo.ts': 'export const repo = { find: (id: string) => id };',
            'src/service.ts':
                "import { repo } from './repo';\nexport const find = async (id: string) => await repo.find(id);\nexport const rest = (...ids: string[]) => Math.max(...ids);"
        });

        expect(report.passThroughs.map((fn) => [fn.name, fn.forwardsTo])).toEqual([
            ['find', 'repo.find'],
            ['rest', 'Math.max']
        ]);
    });

    it('does not call a partial application or a reordering a pass-through', () => {
        const report = analyse({
            'src/wrap.ts':
                'const g = (a: number, b: number) => a - b;\nexport const partial = (a: number) => g(a, 1);\nexport const swapped = (a: number, b: number) => g(b, a);'
        });

        expect(namesOf(report.passThroughs)).toEqual([]);
    });

    it('does not call a block body that does more than one thing a pass-through', () => {
        const report = analyse({
            'src/wrap.ts':
                'const g = (a: number) => a;\nexport const logged = (a: number) => {\n    void a;\n    return g(a);\n};'
        });

        expect(namesOf(report.passThroughs)).toEqual([]);
    });
});

describe('optionalNeverPassed', () => {
    it('lists an optional parameter no call site supplies', () => {
        const report = analyse({
            'src/clock.ts':
                'const at = (day: number, now?: number) => day + (now ?? 0);\nexport const today = at(1);'
        });

        expect(report.optionalNeverPassed.map((fn) => fn.optionalNeverPassed)).toEqual([['now']]);
    });

    it('leaves it out once any caller passes it', () => {
        const report = analyse({
            'src/clock.ts':
                'const at = (day: number, now = 0) => day + now;\nexport const days = [at(1), at(2, 5)];'
        });

        expect(report.optionalNeverPassed).toEqual([]);
    });

    it('leaves it out when the function is also handed over as a callback', () => {
        const report = analyse({
            'src/clock.ts':
                'const at = (day: number, now?: number) => day + (now ?? 0);\nexport const today = at(1);\nexport const later = [1].map(at);'
        });

        expect(report.optionalNeverPassed).toEqual([]);
    });
});

describe('lazyFiles', () => {
    it('lists a file with one export and one importer', () => {
        const report = analyse({
            'src/tiny.ts': 'export const one = 1;',
            'src/use.ts':
                "import { one } from './tiny';\nexport const two = one + 1;\nexport const three = 3;\nexport const four = 4;"
        });

        expect(report.lazyFiles).toEqual([
            { file: 'src/tiny.ts', exports: 1, importedBy: ['src/use.ts'], published: false }
        ]);
    });

    it('leaves out a file with more than two exports', () => {
        const report = analyse({
            'src/many.ts': 'export const a = 1;\nexport const b = 2;\nexport const c = 3;',
            'src/use.ts':
                "import { a } from './many';\nexport const x = a;\nexport const y = 1;\nexport const z = 2;"
        });

        expect(namesOf(report.lazyFiles)).not.toContain('src/many.ts');
    });

    it('leaves out the files the module layout asks for', () => {
        const report = analyse({
            'src/modules/shop/routes.ts': 'export const routes = 1;',
            'src/modules/shop/controllers/get-shop.ts': 'export const getShop = 1;',
            'src/modules/shop/module.ts':
                "import { routes } from './routes';\nimport { getShop } from './controllers/get-shop';\nexport const a = routes;\nexport const b = getShop;\nexport const c = 3;"
        });

        expect(report.lazyFiles).toEqual([]);
    });
});

describe('published', () => {
    it('marks what a module barrel re-exports, through an intermediate index', () => {
        const report = analyse({
            'src/modules/shop/index.ts': "export * from './services/index';",
            'src/modules/shop/services/index.ts': "export * from './price';",
            'src/modules/shop/services/price.ts':
                'export const price = (n: number) => n * 2;\nconst local = () => price(1);\nexport const x = local();',
            'src/use.ts': "import { price } from './modules/shop';\nexport const p = price(3);"
        });

        expect(report.smallAndRare.map((fn) => [fn.name, fn.published])).toEqual([
            ['local', false],
            ['price', true]
        ]);
        expect(
            report.lazyFiles.find((entry) => entry.file === 'src/modules/shop/services/price.ts')
                ?.published
        ).toBe(true);
    });
});
