/**
 * `scripts/eslint/max-depth-through-closures`: what counts as a level, what a callback carries,
 * and what restarts the count.
 *
 * The snippets are the PHP twin's `Nesting` fixtures (Reds, Greens, FileLevel,
 * ProductionLimits) in JavaScript, so both backends answer the same for the same shape.
 */
import { RuleTester } from 'eslint';
import { maxDepthThroughClosures } from '../../../../scripts/eslint/max-depth-through-closures';

/** Runs the rule against its valid and invalid snippets. */
const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

/** Production's limit: three levels. */
const PROD = [{ max: 3 }];

/** A test file's limit: four levels. */
const SPEC = [{ max: 4 }];

tester.run('max-depth-through-closures', maxDepthThroughClosures as never, {
    valid: [
        {
            // A shallow block inside a callback inside a loop.
            options: PROD,
            code: `function shallow(items) {
                for (const item of items) {
                    items.forEach((other) => {
                        if (other) return;
                    });
                }
            }`
        },
        {
            // A class method restarts at zero: four levels inside it, within a spec's four,
            // although the loop that holds the class would make it five if it carried.
            options: SPEC,
            code: `function anonymousClass(items) {
                for (const item of items) {
                    const run = () => class {
                        deep(xs) {
                            for (const a of xs) {
                                for (const b of xs) {
                                    if (a) { if (b) return; }
                                }
                            }
                        }
                    };
                }
            }`
        },
        {
            // An object-literal method is a member too: it restarts.
            options: PROD,
            code: `function holder(items) {
                for (const item of items) {
                    if (item) {
                        if (item) {
                            const handlers = {
                                run(xs) { for (const a of xs) { if (a) { if (a) return; } } }
                            };
                        }
                    }
                }
            }`
        },
        {
            // An `else if` chain opens no level of its own: the inner `if` is the third level.
            options: PROD,
            code: `function elseChain(n) {
                for (const a of [1]) {
                    if (n === 1) {
                        return;
                    } else if (n === 4) {
                        if (n === 5) return;
                    } else {
                        return;
                    }
                }
            }`
        },
        {
            // A file-level callback (a spec's `it`) starts at zero.
            options: SPEC,
            code: `it('nests four deep', () => {
                for (const a of [1]) {
                    for (const b of [1]) {
                        if (a) {
                            if (b) return;
                        }
                    }
                }
            });`
        },
        {
            // Four blocks: past production's three, within a spec's four.
            options: SPEC,
            code: `function fourBlocks(n) {
                for (const a of [1]) { if (n) { if (n) { if (n) { return; } } } }
            }`
        },
        {
            // A loop header sits on the OUTER level: three levels in its callback stay at three,
            // where counting the header would make the third `if` the fourth.
            options: PROD,
            code: `function loopHeader(items) {
                for (const a of items.filter((x) => { if (x) { if (x) { if (x) { return true; } } } return false; })) {
                    if (a) { return; }
                }
            }`
        },
        {
            // A `switch` discriminant sits on the outer level too.
            options: PROD,
            code: `function discriminant(items) {
                switch (items.find((x) => { if (x) { if (x) { if (x) { return 1; } } } return 0; })) {
                    default:
                        return;
                }
            }`
        },
        {
            // An `else if` condition sits on the outer level too, not one deeper.
            options: PROD,
            code: `function elseIfCondition(items, n) {
                if (n) {
                    return;
                } else if (items.some((x) => { if (x) { if (x) { if (x) { return true; } } } return false; })) {
                    return;
                }
            }`
        },
        {
            // No option given: the default is production's three.
            code: `function three(n) { if (n) { if (n) { if (n) return; } } }`
        }
    ],
    invalid: [
        {
            // Production, four blocks: the fourth is the one reported, once.
            options: PROD,
            code: `function fourBlocks(n) {
                for (const a of [1]) {
                    if (n) {
                        if (n) {
                            if (n) {
                                if (n) { return; }
                            }
                        }
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 5, data: { level: 4, max: 3 } }]
        },
        {
            // The count carries through a callback (`max-depth` alone would restart there):
            // the callback's `if` is the third level, one past a limit of two.
            options: [{ max: 2 }],
            code: `function throughClosure(items) {
                for (const item of items) {
                    if (item) {
                        items.forEach((other) => {
                            if (other) { return; }
                        });
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 5, data: { level: 3, max: 2 } }]
        },
        {
            // The fifth level, reached through a callback.
            options: SPEC,
            code: `function throughClosure(items) {
                for (const item of items) {
                    if (item) {
                        items.forEach((other) => {
                            if (other) {
                                for (const deep of items) {
                                    if (deep) { return; }
                                }
                            }
                        });
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 7 }]
        },
        {
            // The depth carries through an arrow into the function expression it returns.
            options: SPEC,
            code: `function throughArrow(items) {
                for (const item of items) {
                    if (item) {
                        if (item) {
                            if (item) {
                                const run = () => (function () {
                                    if (item) { return; }
                                })();
                            }
                        }
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 7 }]
        },
        {
            // Nested callbacks add up.
            options: SPEC,
            code: `function nestedClosures(items) {
                for (const item of items) {
                    for (const other of items) {
                        const a = () => {
                            if (item) {
                                if (other) {
                                    const b = () => {
                                        if (item) { return; }
                                    };
                                }
                            }
                        };
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 8 }]
        },
        {
            // A callback in a condition stays at the current level: the loop in it is the second.
            options: SPEC,
            code: `function inCondition(items) {
                for (const item of items) {
                    if (items.filter((x) => {
                        for (const y of x) {
                            if (y) {
                                for (const z of y) {
                                    if (z) { return true; }
                                }
                            }
                        }
                        return false;
                    }).length) {
                        return;
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 7 }]
        },
        {
            // A `switch` discriminant sits on the outer level: the fourth block in its callback
            // (line 6) is the fourth level. Counting the switch would report the third (line 5).
            options: PROD,
            code: `function discriminant(items) {
                switch (items.find((x) => {
                    if (x) {
                        if (x) {
                            if (x) {
                                if (x) { return 1; }
                            }
                        }
                    }
                    return 0;
                })) {
                    default:
                        return;
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 6, data: { level: 4, max: 3 } }]
        },
        {
            // An `else if` condition, same: the fourth block in its callback (line 8) is the
            // fourth level. Counting the head `if` would report the third (line 7).
            options: PROD,
            code: `function elseIfCondition(items, n) {
                if (n) {
                    return;
                } else if (items.some((x) => {
                    if (x) {
                        if (x) {
                            if (x) {
                                if (x) { return true; }
                            }
                        }
                    }
                    return false;
                })) {
                    return;
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 8, data: { level: 4, max: 3 } }]
        },
        {
            // The `catch` clause is one level deeper than the `try` that owns it.
            options: PROD,
            code: `function inCatch(n) {
                try {
                    return;
                } catch (error) {
                    if (n) {
                        if (n) {
                            if (n) { return; }
                        }
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 7, data: { level: 4, max: 3 } }]
        },
        {
            // So is `finally`.
            options: PROD,
            code: `function inFinally(n) {
                try {
                    return;
                } finally {
                    if (n) {
                        if (n) {
                            if (n) { n = 0; }
                        }
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 7, data: { level: 4, max: 3 } }]
        },
        {
            // `switch`, `try` and `while` each open a level; the case body is one deeper.
            options: PROD,
            code: `function mixed(n) {
                while (n) {
                    switch (n) {
                        case 1:
                            try {
                                if (n) { return; }
                            } finally {
                                n = 0;
                            }
                    }
                }
            }`,
            errors: [{ messageId: 'tooDeep', line: 6 }]
        }
    ]
});
