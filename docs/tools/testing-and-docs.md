# Testing & Docs

## Quality tools

| Tool                                                                                                                        | Why it is here                          |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [Jest](https://jestjs.io/) (+ [ts-jest](https://kulshekhar.github.io/ts-jest/))                                             | unit and integration tests              |
| [mongodb-memory-server](https://nodkz.github.io/mongodb-memory-server/)                                                     | in-memory MongoDB for tests             |
| [ESLint](https://eslint.org/)                                                                                               | code consistency and correctness checks |
| [Prettier](https://prettier.io/)                                                                                            | predictable formatting                  |
| [VitePress](https://vitepress.dev/)                                                                                         | documentation site                      |
| [Mermaid](https://mermaid.js.org/) + [vitepress-plugin-mermaid](https://emersonbottero.github.io/vitepress-plugin-mermaid/) | ADHD-friendly visual diagrams           |

## Maintenance flow

```mermaid
flowchart LR
    Change[Code or docs change] --> Build[npm run build]
    Build --> Test[npm run test]
    Test --> Docs[npm run docs:build]
    Docs --> Review[Review + keep docs linked]
```

## Documentation rule of thumb

- keep docs grouped by concept,
- prefer visual maps when they help,
- avoid a page for every tiny request/response,
- keep code comments brief and move long explanation here.

## Useful links

- [Jest CLI options](https://jestjs.io/docs/cli)
- [Jest matchers](https://jestjs.io/docs/expect)
- [ts-jest configuration](https://kulshekhar.github.io/ts-jest/docs/getting-started/options/)
- [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint rules](https://typescript-eslint.io/rules/)
- [Prettier configuration](https://prettier.io/docs/en/configuration.html)
- [VitePress configuration reference](https://vitepress.dev/reference/site-config)
- [Mermaid diagram syntax](https://mermaid.js.org/intro/syntax-reference.html)

## Related pages

- [Theory](../theory/)
- [API](../api/)
- Root file `AI_README.md` for agent-focused repo context
