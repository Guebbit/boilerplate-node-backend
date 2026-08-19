/**
 * `eslint/rules/controller-chain-must-catch` — the promise-chain rule scoped to controllers.
 *
 * Exercised through ESLint's own `RuleTester`, so what is asserted is exactly what a lint run
 * does: the rule receives a parsed AST, not a string. The cases mirror the rule's documented
 * carve-outs — chains inside promise handlers, private helpers that delegate to their caller —
 * because those carve-outs are where an AST-walking rule regresses first.
 *
 * `tester.run` sits at the top level: RuleTester emits its own describe/it blocks, and jest
 * refuses describes nested inside a test.
 */
import { RuleTester } from 'eslint';
import { controllerChainMustCatch } from '../../../eslint/rules/controller-chain-must-catch';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('controller-chain-must-catch', controllerChainMustCatch as never, {
    valid: [
        // The happy path: an exported handler whose chain ends in .catch().
        `export const getThings = (request, response) => {
            service.list().then((data) => response.json(data)).catch(() => response.status(500).end());
        };`,
        // .finally after .catch does not un-catch the chain.
        `export const getThings = (request, response) => {
            service.list().then((d) => response.json(d)).catch(() => {}).finally(() => done());
        };`,
        // A chain INSIDE a .catch handler rejects into the chain that owns the callback.
        `export const upload = (request, response) => {
            save().then(() => response.end()).catch(() => cleanup().then(() => response.status(500).end()));
        };`,
        // A private helper returning its chain delegates the .catch to its caller.
        `const helper = () => service.list().then((d) => transform(d));`,
        // A chain with no .then at all is not a chain this rule judges.
        `export const ping = (request, response) => { response.json({ ok: true }); };`
    ],
    invalid: [
        {
            // An exported handler with a .then and no .catch: the exact bug the rule exists for.
            code: `export const getThings = (request, response) => {
                service.list().then((data) => response.json(data));
            };`,
            errors: [{ messageId: 'missing' }]
        },
        {
            // Exported via a function declaration rather than an arrow.
            code: `export default function handler(request, response) {
                service.list().then((data) => response.json(data));
            }`,
            errors: [{ messageId: 'missing' }]
        }
    ]
});
