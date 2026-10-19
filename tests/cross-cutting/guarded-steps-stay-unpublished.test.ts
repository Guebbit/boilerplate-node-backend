/**
 * A step beneath a guarded door never leaves its module's barrel.
 *
 * Some functions do the write only after another function has checked scope, ownership or state:
 * `settlePayment` runs behind `confirmPayment` and its siblings, `applyTransition` behind every
 * named stock move. Published, the step lets a sibling module write past the checks.
 *
 * No tool can tell a step from a door by its shape, so a person marks it: TSDoc's `@internal`
 * on the declaration. This suite then holds the line wherever the barrel reaches, through
 * `export *` chains, renamed re-exports and object literals that bundle functions.
 * Finding an untagged step is `scripts/audit/reachability/SKILL.md`'s job. See
 * `docs/theory/strategic-ddd.md` §5.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isDeployed } from '@tests/paths';

/** The repo root, so paths in a failure read as the reader's own. */
const ROOT = path.resolve(__dirname, '../..');

/** Where every module lives, one folder each. */
const MODULES = path.join(ROOT, 'src/modules');

/** Every module's barrel. */
const barrels = readdirSync(MODULES)
    .map((name) => path.join(MODULES, name, 'index.ts'))
    .filter((file) => existsSync(file));

/**
 * The repo's own compiler options, so `@modules/*` and the other path aliases resolve.
 * The TypeScript compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 */
const compilerOptions = (() => {
    // `readConfigFile` parses tsconfig.json; `parseJsonConfigFileContent` resolves `extends` and paths.
    const { config } = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), (file) =>
        ts.sys.readFile(file)
    );
    return { ...ts.parseJsonConfigFileContent(config, ts.sys, ROOT).options, noEmit: true };
})();

/**
 * Whether a declaration carries TSDoc's `@internal`.
 * `getJSDocTags` walks up from a variable declaration to the statement its docblock sits on.
 * @param declaration - any declaration a symbol points at
 */
const isTaggedInternal = (declaration: ts.Declaration): boolean =>
    ts.getJSDocTags(declaration).some((tag) => tag.tagName.text === 'internal');

/**
 * The guard over one program: what each barrel publishes, and which published symbols are steps.
 * A function of the program so the same rules run over the real barrels and over the small
 * fixture the canaries below plant, one for each way a step can be carried out.
 * @param program - the compiled files, barrels included
 */
const guardOver = (program: ts.Program) => {
    /** Resolves what each export names; created once, since it is lazy and caches. */
    const checker = program.getTypeChecker();

    /**
     * Follow an import or re-export to the symbol it finally names.
     * @param symbol - an exported or imported symbol
     */
    const target = (symbol: ts.Symbol): ts.Symbol =>
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

    /**
     * The symbol a bundled value points at, whichever of the shapes it is written in: an
     * identifier (`{ x: step }`), a member (`{ x: steps.step }`) or a function that only forwards
     * (`{ x: (a) => step(a) }`, or the same with a braced `return step(a)`).
     * A wrapper that does anything else is a door that guards a step, which is what a step is
     * for, so it is not followed.
     * @param value - the right-hand side of a property
     */
    const referencedSymbol = (value: ts.Expression): ts.Symbol | undefined => {
        if (ts.isIdentifier(value)) return checker.getSymbolAtLocation(value);
        if (ts.isPropertyAccessExpression(value)) return checker.getSymbolAtLocation(value.name);
        if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value)) return undefined;

        const only = ts.isBlock(value.body)
            ? value.body.statements.length === 1 && ts.isReturnStatement(value.body.statements[0])
                ? value.body.statements[0].expression
                : undefined
            : value.body;
        return only && ts.isCallExpression(only) ? referencedSymbol(only.expression) : undefined;
    };

    /**
     * What `...spread` brings into an object: the exports of a namespace import, or the members of
     * an object.
     * @param spread - the expression after the dots
     */
    const spreadSymbols = (spread: ts.Expression): ts.Symbol[] => {
        const symbol = checker.getSymbolAtLocation(spread);
        const resolved = symbol && target(symbol);
        return resolved && resolved.flags & ts.SymbolFlags.Module
            ? checker.getExportsOfModule(resolved)
            : checker.getTypeAtLocation(spread).getProperties();
    };

    /**
     * The symbols an object literal bundles by reference (`{ settlePayment }`,
     * `{ run: settlePayment }`, `{ run: steps.settlePayment }`, `{ run: (a) => settlePayment(a) }`,
     * `{ ...steps }`), so a service object cannot carry a step out under another name.
     * @param declaration - a declaration that may be `const x = { … }`
     */
    const bundledSymbols = (declaration: ts.Declaration): { name: string; symbol: ts.Symbol }[] => {
        if (!ts.isVariableDeclaration(declaration)) return [];
        const { initializer } = declaration;
        if (!initializer || !ts.isObjectLiteralExpression(initializer)) return [];

        return initializer.properties.flatMap((property) => {
            if (ts.isSpreadAssignment(property))
                return spreadSymbols(property.expression).map((symbol) => ({
                    name: symbol.name,
                    symbol
                }));

            const symbol = ts.isShorthandPropertyAssignment(property)
                ? checker.getShorthandAssignmentValueSymbol(property)
                : ts.isPropertyAssignment(property)
                  ? referencedSymbol(property.initializer)
                  : undefined;
            return symbol ? [{ name: property.name?.getText() ?? '?', symbol }] : [];
        });
    };

    /**
     * Every `@internal` declaration a barrel publishes, as `module: name` lines.
     * @param barrel - a module's `index.ts`
     * @param module - the module's name, for the line
     */
    const leaksOf = (barrel: string, module: string): string[] => {
        const source = program.getSourceFile(barrel);
        const moduleSymbol = source && checker.getSymbolAtLocation(source);
        if (!moduleSymbol) throw new Error(`no module symbol for ${barrel}`);

        return checker.getExportsOfModule(moduleSymbol).flatMap((exported) => {
            const declarations = target(exported).declarations ?? [];
            const direct = declarations.some((tagged) => isTaggedInternal(tagged))
                ? [`${module}: ${exported.name}`]
                : [];
            const bundled = declarations
                .flatMap((bundler) => bundledSymbols(bundler))
                .filter(({ symbol }) =>
                    (target(symbol).declarations ?? []).some((tagged) => isTaggedInternal(tagged))
                )
                .map(({ name }) => `${module}: ${exported.name}.${name}`);
            return [...direct, ...bundled];
        });
    };

    return { checker, target, leaksOf };
};

/** One program over the real barrels. */
const program = ts.createProgram(barrels, compilerOptions);

/** The guard over the real barrels. */
const { checker, leaksOf } = guardOver(program);

/**
 * The steps the codebase names in its own docs, while their module is deployed; the canary below
 * proves the tag is still read. Every one is the shop's, so a stripped checkout has none.
 */
const KNOWN_STEPS = [
    ['inventory', 'applyTransition'],
    ['payments', 'performRefund'],
    ['payments', 'settlePayment']
]
    .filter(([module]) => isDeployed(module))
    .map(([, name]) => name);

/**
 * Every `@internal` top-level declaration under `src/modules`, by name.
 */
const taggedSteps = (): string[] =>
    program
        .getSourceFiles()
        .filter((file) => file.fileName.startsWith(MODULES))
        .flatMap((file) => [...file.statements])
        .flatMap((statement): (ts.VariableDeclaration | ts.FunctionDeclaration)[] =>
            ts.isVariableStatement(statement)
                ? [...statement.declarationList.declarations]
                : ts.isFunctionDeclaration(statement)
                  ? [statement]
                  : []
        )
        .filter((tagged) => isTaggedInternal(tagged))
        .map((declaration) => declaration.name?.getText() ?? '?');

/**
 * A two-file barrel held in memory, one export for each way a step can be carried out under
 * another name, and one wrapper that is a door and must not be flagged.
 */
const FIXTURE: Record<string, string> = {
    '/fixture/steps.ts': `
        /** @internal The write beneath a door. */
        export const step = (id: string): string => id;
    `,
    '/fixture/index.ts': `
        import * as steps from './steps';
        import { step } from './steps';
        export const byName = { step };
        export const byMember = { run: steps.step };
        export const byForwarder = { run: (id: string) => step(id) };
        export const byBracedForwarder = { run: (id: string) => { return step(id); } };
        export const bySpread = { ...steps };
        export const aGuardedDoor = {
            run: (id: string) => Promise.resolve(id).then((checked) => step(checked))
        };
    `
};

/** The fixture compiled with the repo's options, its files served from memory. */
const fixtureGuard = (() => {
    const host = ts.createCompilerHost(compilerOptions);
    const { getSourceFile, fileExists, readFile, directoryExists } = host;
    // Module resolution skips a directory the host says is not there.
    host.directoryExists = (directory) =>
        directory === '/fixture' || !!directoryExists?.(directory);
    host.fileExists = (file) => file in FIXTURE || fileExists(file);
    host.readFile = (file) => FIXTURE[file] ?? readFile(file);
    host.getSourceFile = (file, ...rest) =>
        file in FIXTURE
            ? ts.createSourceFile(file, FIXTURE[file], ts.ScriptTarget.ES2022, true)
            : getSourceFile(file, ...rest);
    return guardOver(ts.createProgram(['/fixture/index.ts'], compilerOptions, host));
})();

describe('a step beneath a guarded door', () => {
    it('is found where the codebase says it is (canary: the tag is read)', () => {
        expect(taggedSteps()).toEqual(expect.arrayContaining(KNOWN_STEPS));
    });

    it('is followed through the barrels (canary: a known door resolves)', () => {
        if (!isDeployed('payments')) return;
        const payments = barrels.find((file) => file.includes(path.join('modules', 'payments')));
        const source = payments && program.getSourceFile(payments);
        const symbol = source && checker.getSymbolAtLocation(source);
        const names = symbol ? checker.getExportsOfModule(symbol).map(({ name }) => name) : [];
        expect(names).toContain('paymentService');
    });

    it('is caught in every shape a service object can carry it out (canary: the fixture)', () => {
        expect(fixtureGuard.leaksOf('/fixture/index.ts', 'fixture').toSorted()).toEqual([
            'fixture: byBracedForwarder.run',
            'fixture: byForwarder.run',
            'fixture: byMember.run',
            'fixture: byName.step',
            'fixture: bySpread.step'
        ]);
    });

    it('never leaves its module through the barrel', () => {
        expect(
            barrels.flatMap((barrel) =>
                leaksOf(barrel, path.relative(MODULES, barrel).split(/[/\\]/, 1)[0])
            )
        ).toEqual([]);
    });
});
