/**
 * @module
 * Counts the facts the `code-shape` audit judges shallow code by: small functions with one or two
 * users, pure forwarders, optional parameters no caller passes, files with one or two importers.
 *
 * Counts only — every verdict is the audit's, see `scripts/audit/code-shape/SKILL.md`.
 * Built on the TypeScript checker rather than a text search: an import alias, a re-export or a
 * shorthand property still resolves to the one function it names.
 */
import path from 'node:path';
import ts from 'typescript';

/**
 * A function body spanning at most this many lines counts as small.
 * Lines, not statements: one statement can be a thirty-line promise chain.
 */
export const SMALL_BODY_LINES = 3;

/** A function or a file with at most this many users counts as rarely used. */
export const FEW_USERS = 2;

/** A file with at most this many exports can be a lazy file. */
export const FEW_EXPORTS = 2;

/** A module barrel — published surface, `CLAUDE.md` § Module barrels. */
const BARREL = /^src\/modules\/[^/]+\/index\.ts$/;

/** Never a candidate: module tests and generated code. Still counted as users. */
const NEVER_A_CANDIDATE = /^src\/modules\/[^/]+\/tests\/|\.generated\.ts$|^api\//;

/**
 * Files the module layout itself asks for, one per role or per route — never a lazy file.
 * The layout: `docs/theory/modules.md#what-a-module-contains`.
 */
const LAID_OUT_FILE = /^src\/modules\/[^/]+\/([^/]+\.ts|controllers\/.+)$/;

/**
 * One named function and how it is used.
 */
export interface FunctionFacts {
    /** Repo-relative path, forward slashes. */
    file: string;
    /** 1-based line of the name. */
    line: number;
    name: string;
    /** Lines the body spans, braces included. */
    bodyLines: number;
    /** Uses anywhere in the program, its own declaration and import/export plumbing excluded. */
    references: number;
    /** The files those uses are in. */
    referencedFrom: string[];
    /** The callee, when the body only calls it with the function's own parameters, in order. */
    forwardsTo?: string;
    /** Optional parameters no call site supplies — reported only when every use is a direct call. */
    optionalNeverPassed: string[];
    /** Exported from a file a module barrel re-exports. */
    published: boolean;
}

/**
 * One file and who imports it.
 */
export interface FileFacts {
    /** Repo-relative path, forward slashes. */
    file: string;
    /** Exported names, types included. */
    exports: number;
    /** Files that import or re-export it, dynamic `import()` included. */
    importedBy: string[];
    /** Re-exported, directly or through another file, by a module barrel. */
    published: boolean;
}

/**
 * The candidate lists, one per smell the audit hands to its own agent.
 */
export interface ShallowReport {
    /** Small body and one or two users — Fowler's Lazy Element. */
    smallAndRare: FunctionFacts[];
    /** Bodies that only forward — Fowler's Middle Man, Ousterhout's pass-through method. */
    passThroughs: FunctionFacts[];
    /** Optional parameters no caller passes — Fowler's Speculative Generality. */
    optionalNeverPassed: FunctionFacts[];
    /** Few exports and one or two importers — Ousterhout's classitis, at file level. */
    lazyFiles: FileFacts[];
}

/**
 * How one function symbol is used across the program.
 */
interface Usage {
    references: number;
    files: Set<string>;
    /** Argument count per direct call; `Infinity` for a call that spreads its arguments. */
    callArguments: number[];
}

/**
 * A named function: a declaration with a body, or a variable holding an arrow or function expression.
 */
interface NamedFunction {
    declaration: ts.FunctionDeclaration | ts.VariableDeclaration;
    name: ts.Identifier;
    body: ts.ConciseBody;
    parameters: ts.NodeArray<ts.ParameterDeclaration>;
}

/**
 * Identifiers that are import/export plumbing rather than a use.
 */
const PLUMBING = new Set([
    ts.SyntaxKind.ImportSpecifier,
    ts.SyntaxKind.ImportClause,
    ts.SyntaxKind.NamespaceImport,
    ts.SyntaxKind.ImportEqualsDeclaration,
    ts.SyntaxKind.ExportSpecifier
]);

/**
 * The symbol an identifier ultimately names, seen through import aliases and shorthand properties.
 * Checker API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 *
 * @param checker - the program's type checker
 * @param identifier - the identifier to resolve
 * @returns the target symbol, or `undefined` for a name the checker cannot resolve
 */
const targetOf = (checker: ts.TypeChecker, identifier: ts.Identifier): ts.Symbol | undefined => {
    // `{ name }` resolves to the property; the value it reads is the function we count.
    const symbol = ts.isShorthandPropertyAssignment(identifier.parent)
        ? checker.getShorthandAssignmentValueSymbol(identifier.parent)
        : checker.getSymbolAtLocation(identifier);
    // An imported name is an alias symbol; `getAliasedSymbol` follows it to the declaration.
    return symbol && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
};

/**
 * Argument count of the call an identifier is the callee of, or `undefined` when it is not one.
 *
 * @param identifier - the identifier in use position
 * @returns the count, `Infinity` for a spread
 */
const callArgumentsOf = (identifier: ts.Identifier): number | undefined => {
    const call = identifier.parent;
    if (!ts.isCallExpression(call) || call.expression !== identifier) return undefined;
    return call.arguments.some((argument) => ts.isSpreadElement(argument))
        ? Infinity
        : call.arguments.length;
};

/**
 * The program's own files: no declaration files, nothing from `node_modules`.
 *
 * @param program - the program
 * @returns its project source files
 */
const projectFiles = (program: ts.Program): ts.SourceFile[] =>
    program
        .getSourceFiles()
        .filter(
            (sourceFile) =>
                !sourceFile.isDeclarationFile &&
                !program.isSourceFileFromExternalLibrary(sourceFile)
        );

/**
 * Walks every identifier in the program once and records each use against the symbol it names.
 *
 * @param program - the program to walk
 * @param relativeOf - maps an absolute file name to its repo-relative path
 * @returns usage per resolved symbol
 */
const collectUsage = (
    program: ts.Program,
    relativeOf: (fileName: string) => string
): Map<ts.Symbol, Usage> => {
    const checker = program.getTypeChecker();
    const usage = new Map<ts.Symbol, Usage>();
    const record = (identifier: ts.Identifier, file: string): void => {
        if (PLUMBING.has(identifier.parent.kind)) return;
        const symbol = targetOf(checker, identifier);
        // `getNameOfDeclaration`: the name node a declaration introduces — the declaration is not a use.
        if (
            !symbol ||
            symbol.declarations?.some(
                (declaration) => ts.getNameOfDeclaration(declaration) === identifier
            )
        )
            return;
        const entry = usage.get(symbol) ?? {
            references: 0,
            files: new Set<string>(),
            callArguments: []
        };
        entry.references += 1;
        entry.files.add(file);
        const argumentCount = callArgumentsOf(identifier);
        if (argumentCount !== undefined) entry.callArguments.push(argumentCount);
        usage.set(symbol, entry);
    };
    for (const sourceFile of projectFiles(program)) {
        const file = relativeOf(sourceFile.fileName);
        // `forEachChild`: visits a node's direct children; the recursion reaches every identifier.
        const visit = (node: ts.Node): void => {
            if (ts.isIdentifier(node)) record(node, file);
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    return usage;
};

/**
 * The function a node declares, if it declares one.
 *
 * @param node - any node
 * @returns its name, body and parameters, or `undefined`
 */
const namedFunctionOf = (node: ts.Node): NamedFunction | undefined => {
    // An overload signature has no body, and nothing to judge.
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
        return { declaration: node, name: node.name, body: node.body, parameters: node.parameters };
    if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
        return {
            declaration: node,
            name: node.name,
            body: node.initializer.body,
            parameters: node.initializer.parameters
        };
    return undefined;
};

/**
 * Strips the wrappers that do not change what a forwarding body does: parentheses and `await`.
 *
 * @param expression - the expression to unwrap
 * @returns the expression underneath
 */
const unwrap = (expression: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(expression) || ts.isAwaitExpression(expression)
        ? unwrap(expression.expression)
        : expression;

/**
 * The one call a body consists of: `=> f(x)`, `{ return f(x); }` or `{ f(x); }`.
 *
 * @param body - a function body
 * @returns that call, or `undefined` when the body does anything else
 */
const soleCall = (body: ts.ConciseBody): ts.CallExpression | undefined => {
    let expression: ts.Expression | undefined = ts.isBlock(body) ? undefined : body;
    if (ts.isBlock(body) && body.statements.length === 1) {
        const [only] = body.statements;
        if (ts.isReturnStatement(only) || ts.isExpressionStatement(only))
            expression = only.expression;
    }
    const call = expression && unwrap(expression);
    return call && ts.isCallExpression(call) ? call : undefined;
};

/**
 * The callee a function only forwards to, with its own parameters in the same order.
 *
 * @param declared - the function
 * @returns the callee as written, or `undefined` when the function does more than forward
 */
const forwardTarget = (declared: NamedFunction): string | undefined => {
    const call = soleCall(declared.body);
    if (!call) return undefined;
    // `...rest` on both sides is still forwarding, so a spread keeps its marker.
    const own = declared.parameters.map((parameter) =>
        ts.isIdentifier(parameter.name)
            ? `${parameter.dotDotDotToken ? '...' : ''}${parameter.name.text}`
            : '?'
    );
    const passed = call.arguments.map((argument) => {
        if (ts.isIdentifier(argument)) return argument.text;
        return ts.isSpreadElement(argument) && ts.isIdentifier(argument.expression)
            ? `...${argument.expression.text}`
            : '!';
    });
    return own.join(',') === passed.join(',') ? call.expression.getText() : undefined;
};

/**
 * Optional parameters at or past the most arguments any call passes.
 * Only meaningful when every use is a direct call — a callback's caller may pass anything.
 *
 * @param declared - the function
 * @param use - how it is used
 * @returns the names of the optional parameters nobody supplies
 */
const optionalNeverPassed = (declared: NamedFunction, use: Usage): string[] => {
    if (use.callArguments.length === 0 || use.callArguments.length !== use.references) return [];
    const most = Math.max(...use.callArguments);
    return declared.parameters
        .filter(
            (parameter, index) =>
                index >= most &&
                !parameter.dotDotDotToken &&
                Boolean(parameter.questionToken ?? parameter.initializer)
        )
        .map((parameter) => parameter.name.getText());
};

/**
 * The file a module specifier resolves to, if it resolves to one in the program.
 *
 * @param checker - the program's type checker
 * @param node - a string literal that may be a module specifier
 * @returns that file, or `undefined`
 */
const moduleFileOf = (
    checker: ts.TypeChecker,
    node: ts.StringLiteralLike
): ts.SourceFile | undefined => {
    // On a module specifier the checker answers with the module's own symbol, declared by its file.
    const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
    return declaration && ts.isSourceFile(declaration) ? declaration : undefined;
};

/**
 * Who imports each file, and which files each one re-exports.
 *
 * @param program - the program
 * @param relativeOf - maps an absolute file name to its repo-relative path
 * @returns importers per file, and the re-export edges barrels are followed along
 */
const collectImports = (
    program: ts.Program,
    relativeOf: (fileName: string) => string
): { importers: Map<string, Set<string>>; reExports: Map<string, Set<string>> } => {
    const checker = program.getTypeChecker();
    const importers = new Map<string, Set<string>>();
    const reExports = new Map<string, Set<string>>();
    const link = (edges: Map<string, Set<string>>, from: string, to: string): void => {
        edges.set(from, (edges.get(from) ?? new Set<string>()).add(to));
    };
    for (const sourceFile of projectFiles(program)) {
        const file = relativeOf(sourceFile.fileName);
        const visit = (node: ts.Node): void => {
            const target = ts.isStringLiteralLike(node) ? moduleFileOf(checker, node) : undefined;
            if (target) {
                const imported = relativeOf(target.fileName);
                link(importers, imported, file);
                if (ts.isExportDeclaration(node.parent)) link(reExports, file, imported);
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    return { importers, reExports };
};

/**
 * Every file a module barrel re-exports, directly or through an intermediate `index.ts`.
 *
 * @param reExports - re-export edges, file → files it re-exports
 * @returns the published files
 */
const publishedFiles = (reExports: Map<string, Set<string>>): Set<string> => {
    const published = new Set<string>();
    const queue = [...reExports.keys()].filter((file) => BARREL.test(file));
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        for (const next of reExports.get(file) ?? []) {
            if (published.has(next)) continue;
            published.add(next);
            queue.push(next);
        }
    }
    return published;
};

/**
 * Whether a declaration is exported — on itself, or on the `const` statement holding it.
 *
 * @param node - the declaration
 * @returns `true` when exported
 */
const isExported = (node: ts.Declaration): boolean =>
    // `getCombinedModifierFlags` walks from a variable declaration up to its statement's modifiers.
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

/**
 * The facts reported for one function.
 *
 * @param declared - the function
 * @param use - how it is used, `undefined` when nothing uses it
 * @param file - its repo-relative file
 * @param publishedFile - whether a barrel re-exports its file
 * @returns its facts
 */
const factsOf = (
    declared: NamedFunction,
    use: Usage | undefined,
    file: string,
    publishedFile: boolean
): FunctionFacts => {
    const sourceFile = declared.name.getSourceFile();
    return {
        file,
        // `getLineAndCharacterOfPosition` is 0-based; editors and `file:line` citations are 1-based.
        line: sourceFile.getLineAndCharacterOfPosition(declared.name.getStart()).line + 1,
        name: declared.name.text,
        bodyLines:
            sourceFile.getLineAndCharacterOfPosition(declared.body.getEnd()).line -
            sourceFile.getLineAndCharacterOfPosition(declared.body.getStart()).line +
            1,
        references: use?.references ?? 0,
        referencedFrom: [...(use?.files ?? [])].toSorted(),
        forwardsTo: forwardTarget(declared),
        optionalNeverPassed: use ? optionalNeverPassed(declared, use) : [],
        published: publishedFile && isExported(declared.declaration)
    };
};

/**
 * Whether a count of users is one or two — zero is dead code, knip's to report.
 *
 * @param count - uses or importers
 * @returns `true` for a rarely used candidate
 */
const isRare = (count: number): boolean => count >= 1 && count <= FEW_USERS;

/**
 * Lists the shallow-code candidates in scope. Uses are counted across the WHOLE program, tests
 * included: a helper only a test calls has one user, not zero.
 *
 * @param program - the program, normally built from `tsconfig.json`
 * @param root - the repo root every reported path is relative to
 * @param scope - repo-relative path prefixes a candidate must live under
 * @returns one candidate list per smell, smallest and least used first
 */
export const findShallowCandidates = (
    program: ts.Program,
    root: string,
    scope: string[]
): ShallowReport => {
    const relativeOf = (fileName: string): string =>
        path.relative(root, fileName).split(path.sep).join('/');
    const inScope = (file: string): boolean =>
        !NEVER_A_CANDIDATE.test(file) &&
        scope.some((prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/, '')}/`));
    const checker = program.getTypeChecker();
    const usage = collectUsage(program, relativeOf);
    const { importers, reExports } = collectImports(program, relativeOf);
    const published = publishedFiles(reExports);
    const functions: FunctionFacts[] = [];
    const files: FileFacts[] = [];

    for (const sourceFile of projectFiles(program)) {
        const file = relativeOf(sourceFile.fileName);
        if (!inScope(file)) continue;
        const visit = (node: ts.Node): void => {
            const declared = namedFunctionOf(node);
            const symbol = declared && checker.getSymbolAtLocation(declared.name);
            if (declared && symbol)
                functions.push(factsOf(declared, usage.get(symbol), file, published.has(file)));
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
        files.push({
            file,
            exports: moduleSymbol ? checker.getExportsOfModule(moduleSymbol).length : 0,
            importedBy: [...(importers.get(file) ?? [])].toSorted(),
            published: published.has(file)
        });
    }

    const bySize = (a: FunctionFacts, b: FunctionFacts): number =>
        a.bodyLines - b.bodyLines || a.references - b.references || a.file.localeCompare(b.file);
    return {
        smallAndRare: functions
            .filter((facts) => facts.bodyLines <= SMALL_BODY_LINES && isRare(facts.references))
            .toSorted(bySize),
        passThroughs: functions.filter((facts) => facts.forwardsTo !== undefined).toSorted(bySize),
        optionalNeverPassed: functions
            .filter((facts) => facts.optionalNeverPassed.length > 0)
            .toSorted(bySize),
        lazyFiles: files
            .filter(
                (entry) =>
                    !LAID_OUT_FILE.test(entry.file) &&
                    entry.exports <= FEW_EXPORTS &&
                    isRare(entry.importedBy.length)
            )
            .toSorted(
                (a, b) => a.importedBy.length - b.importedBy.length || a.file.localeCompare(b.file)
            )
    };
};
