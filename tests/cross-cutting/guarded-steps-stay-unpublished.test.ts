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
 * One program over the barrels, with the repo's own compiler options so `@modules/*` and the
 * other path aliases resolve. The TypeScript compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 */
const program = (() => {
    // `readConfigFile` parses tsconfig.json; `parseJsonConfigFileContent` resolves `extends` and paths.
    const { config } = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), (file) =>
        ts.sys.readFile(file)
    );
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
    return ts.createProgram(barrels, { ...options, noEmit: true });
})();

/** Resolves what each export names; created once, since it is lazy and caches. */
const checker = program.getTypeChecker();

/**
 * Whether a declaration carries TSDoc's `@internal`.
 * `getJSDocTags` walks up from a variable declaration to the statement its docblock sits on.
 * @param declaration - any declaration a symbol points at
 */
const isTaggedInternal = (declaration: ts.Declaration): boolean =>
    ts.getJSDocTags(declaration).some((tag) => tag.tagName.text === 'internal');

/**
 * Follow an import or re-export to the symbol it finally names.
 * @param symbol - an exported or imported symbol
 */
const target = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

/**
 * The symbols an object literal bundles by reference (`{ settlePayment }`, `{ run: settlePayment }`),
 * so a service object cannot carry a step out under another name.
 * @param declaration - a declaration that may be `const x = { … }`
 */
const bundledSymbols = (declaration: ts.Declaration): { name: string; symbol: ts.Symbol }[] => {
    if (!ts.isVariableDeclaration(declaration)) return [];
    const { initializer } = declaration;
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) return [];

    return initializer.properties.flatMap((property) => {
        const symbol = ts.isShorthandPropertyAssignment(property)
            ? checker.getShorthandAssignmentValueSymbol(property)
            : ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)
              ? checker.getSymbolAtLocation(property.initializer)
              : undefined;
        return symbol ? [{ name: property.name?.getText() ?? '?', symbol }] : [];
    });
};

/**
 * Every `@internal` declaration a barrel publishes, as `module: name` lines.
 * @param barrel - a module's `index.ts`
 */
const leaksOf = (barrel: string): string[] => {
    const source = program.getSourceFile(barrel);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`no module symbol for ${barrel}`);
    const module = path.relative(MODULES, barrel).split(/[/\\]/, 1)[0];

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
        expect(names).toContain('confirmPayment');
    });

    it('never leaves its module through the barrel', () => {
        expect(barrels.flatMap((barrel) => leaksOf(barrel))).toEqual([]);
    });
});
