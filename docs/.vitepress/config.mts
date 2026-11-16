import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { moduleSidebar, readCatalog } from '../../scripts/docs/module-catalog';

/** The docs site configuration: the sidebar, the nav and the Mermaid wrapper. */
export default withMermaid(
    defineConfig({
        title: 'Boilerplate Node Backend',
        description: 'ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate',
        lastUpdated: true,
        themeConfig: {
            search: {
                provider: 'local'
            },
            nav: [
                { text: 'Home', link: '/' },
                { text: 'Use the Shop', link: '/use-the-shop/start' },
                { text: 'Understand', link: '/understand/start' },
                { text: 'Build', link: '/build/start' },
                { text: 'Modules', link: '/modules/start' },
                { text: 'Operate', link: '/operate/start' },
                { text: 'Reference', link: '/reference/start' }
            ],
            sidebar: {
                '/use-the-shop/': [
                    {
                        text: 'Start',
                        items: [{ text: 'Overview', link: '/use-the-shop/start' }]
                    },
                    {
                        text: 'The shop',
                        items: [
                            { text: 'Test it yourself', link: '/use-the-shop/test-me' },
                            { text: 'The customer', link: '/use-the-shop/shopper' },
                            { text: 'The shop manager', link: '/use-the-shop/manager' },
                            { text: 'The warehouse', link: '/use-the-shop/warehouse' },
                            { text: 'The support desk', link: '/use-the-shop/support' },
                            { text: 'The editor', link: '/use-the-shop/editor' },
                            { text: 'The moderator', link: '/use-the-shop/moderator' },
                            {
                                text: 'When something goes wrong',
                                link: '/use-the-shop/when-something-goes-wrong',
                                items: [
                                    {
                                        text: 'Refunds',
                                        link: '/use-the-shop/when-something-goes-wrong-refunds'
                                    },
                                    {
                                        text: 'Returns',
                                        link: '/use-the-shop/when-something-goes-wrong-returns'
                                    },
                                    {
                                        text: 'Orders and delivery',
                                        link: '/use-the-shop/when-something-goes-wrong-orders-and-delivery'
                                    }
                                ]
                            },
                            { text: 'What this demo models', link: '/use-the-shop/scope' },
                            {
                                text: 'Before you sell for real',
                                link: '/use-the-shop/before-you-sell'
                            }
                        ]
                    }
                ],
                '/understand/': [
                    {
                        text: 'Start',
                        items: [{ text: 'Overview', link: '/understand/start' }]
                    },
                    {
                        text: 'The shape',
                        items: [
                            { text: 'Reading Path', link: '/understand/reading-path' },
                            { text: 'Architecture', link: '/understand/architecture' },
                            {
                                text: 'Layers',
                                link: '/understand/layers',
                                collapsed: true,
                                items: [{ text: 'Quick map', link: '/understand/layers-quick-map' }]
                            },
                            {
                                text: 'Modules',
                                link: '/understand/modules',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'The dependency graph and boot order',
                                        link: '/understand/modules-graph'
                                    },
                                    {
                                        text: 'The template and the manifest',
                                        link: '/understand/modules-template'
                                    },
                                    { text: 'The four tiers', link: '/understand/modules-tiers' }
                                ]
                            },
                            {
                                text: 'Domain layer & DDD',
                                link: '/understand/domain-layer',
                                collapsed: true,
                                items: [
                                    { text: 'The folder', link: '/understand/domain-layer-folder' }
                                ]
                            },
                            {
                                text: 'Strategic DDD',
                                link: '/understand/strategic-ddd',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'The barrel',
                                        link: '/understand/strategic-ddd-barrel'
                                    },
                                    {
                                        text: 'Subdomains',
                                        link: '/understand/strategic-ddd-subdomains'
                                    }
                                ]
                            },
                            {
                                text: 'Tactical DDD',
                                link: '/understand/tactical-ddd',
                                collapsed: true,
                                items: [
                                    { text: 'Money', link: '/understand/tactical-ddd-money' },
                                    {
                                        text: 'The order lifecycle',
                                        link: '/understand/tactical-ddd-order-lifecycle'
                                    }
                                ]
                            },
                            {
                                text: 'Request Flow',
                                link: '/understand/request-flow',
                                collapsed: true,
                                items: [
                                    { text: 'Errors', link: '/understand/request-flow-errors' },
                                    {
                                        text: 'Cross-cutting strategies',
                                        link: '/understand/request-flow-strategies'
                                    }
                                ]
                            },
                            { text: 'Request Input', link: '/understand/request-input' },
                            { text: 'API Standards', link: '/understand/api-standards' },
                            {
                                text: 'Write Methods: POST, PUT, PATCH',
                                link: '/understand/write-methods',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Conditional writes',
                                        link: '/understand/write-methods-conditional'
                                    },
                                    { text: 'Refusals', link: '/understand/write-methods-errors' },
                                    { text: 'POST', link: '/understand/write-methods-post' }
                                ]
                            },
                            {
                                text: 'Clustering & Graceful Shutdown',
                                link: '/understand/clustering'
                            },
                            { text: 'Shared rules', link: '/understand/shared-rules' }
                        ]
                    },
                    {
                        text: 'Access',
                        items: [
                            {
                                text: 'Authorization',
                                link: '/understand/authorization',
                                collapsed: true,
                                items: [
                                    { text: 'The model', link: '/understand/authorization-model' },
                                    {
                                        text: 'Protecting people',
                                        link: '/understand/authorization-people'
                                    }
                                ]
                            },
                            { text: 'Two ways to stay signed in', link: '/understand/sessions' },
                            { text: 'Tenancy', link: '/understand/tenancy' },
                            {
                                text: 'Security',
                                link: '/understand/security',
                                collapsed: true,
                                items: [
                                    { text: 'Authentication', link: '/understand/security-auth' },
                                    {
                                        text: 'Smaller decisions',
                                        link: '/understand/security-decisions'
                                    },
                                    {
                                        text: 'Machine-to-machine credentials',
                                        link: '/understand/security-m2m'
                                    },
                                    {
                                        text: 'Key and credential rotation',
                                        link: '/understand/security-rotation'
                                    },
                                    {
                                        text: 'Two-factor authentication',
                                        link: '/understand/security-two-factor'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        text: 'Mechanisms',
                        items: [
                            { text: 'Transactional Outbox', link: '/understand/outbox' },
                            { text: 'Idempotency', link: '/understand/idempotency' },
                            {
                                text: 'Redis Cache',
                                link: '/understand/redis-cache',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Keys, size and headers',
                                        link: '/understand/redis-cache-keys'
                                    },
                                    {
                                        text: 'Refresh-ahead',
                                        link: '/understand/redis-cache-refresh'
                                    },
                                    { text: 'The workers', link: '/understand/redis-cache-workers' }
                                ]
                            },
                            { text: 'Internationalisation', link: '/understand/i18n' },
                            {
                                text: 'RabbitMQ',
                                link: '/understand/rabbitmq',
                                collapsed: true,
                                items: [{ text: 'Usage', link: '/understand/rabbitmq-usage' }]
                            },
                            { text: 'MongoDB & Mongoose', link: '/understand/mongodb-mongoose' },
                            {
                                text: 'Email & PDF Rendering',
                                link: '/understand/email-and-rendering'
                            },
                            { text: 'Image processing', link: '/understand/image-processing' },
                            { text: 'Product Analytics', link: '/understand/analytics' },
                            { text: 'Events & Logging', link: '/understand/events-and-logging' },
                            {
                                text: 'The Observability Layer',
                                link: '/understand/observability-layer'
                            },
                            { text: 'External Services', link: '/understand/external-services' },
                            { text: 'Runtime', link: '/understand/runtime' },
                            {
                                text: 'Tools Explained',
                                link: '/understand/tools-explained',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Core and data',
                                        link: '/understand/tools-explained-core'
                                    },
                                    {
                                        text: 'Observability',
                                        link: '/understand/tools-explained-observability'
                                    }
                                ]
                            },
                            { text: 'Tools', link: '/understand/tool-map' }
                        ]
                    },
                    {
                        text: 'Data & privacy',
                        items: [
                            { text: 'Data Protection', link: '/understand/data-protection' },
                            {
                                text: 'Data Retention',
                                link: '/understand/data-retention',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Accounts',
                                        link: '/understand/data-retention-accounts'
                                    },
                                    {
                                        text: 'Free text and holds',
                                        link: '/understand/data-retention-holds'
                                    },
                                    {
                                        text: 'Orders and invoices',
                                        link: '/understand/data-retention-orders'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        text: 'Web attacks & defences',
                        items: [
                            {
                                text: 'Web Attacks & Defences',
                                link: '/understand/defences/',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Every attack, A to Z',
                                        link: '/understand/defences/a-to-z'
                                    },
                                    { text: 'Injection', link: '/understand/defences/injection' },
                                    {
                                        text: 'Client-side',
                                        link: '/understand/defences/client-side'
                                    },
                                    {
                                        text: 'Authentication',
                                        link: '/understand/defences/authentication'
                                    },
                                    {
                                        text: 'Authorization',
                                        link: '/understand/defences/authorization'
                                    },
                                    {
                                        text: 'Business logic & payments',
                                        link: '/understand/defences/business-logic'
                                    },
                                    {
                                        text: 'Files & uploads',
                                        link: '/understand/defences/files-and-uploads'
                                    },
                                    { text: 'SSRF', link: '/understand/defences/ssrf' },
                                    {
                                        text: 'HTTP, proxies & caches',
                                        link: '/understand/defences/http-and-caches'
                                    },
                                    {
                                        text: 'Cryptography & secrets',
                                        link: '/understand/defences/crypto-and-secrets'
                                    },
                                    {
                                        text: 'Information disclosure',
                                        link: '/understand/defences/disclosure'
                                    },
                                    {
                                        text: 'Denial of service',
                                        link: '/understand/defences/denial-of-service'
                                    },
                                    { text: 'Data layer', link: '/understand/defences/data-layer' },
                                    {
                                        text: 'Infrastructure',
                                        link: '/understand/defences/infrastructure'
                                    },
                                    {
                                        text: 'Supply chain',
                                        link: '/understand/defences/supply-chain'
                                    },
                                    {
                                        text: 'API surface',
                                        link: '/understand/defences/api-surface'
                                    },
                                    { text: 'Real-time', link: '/understand/defences/real-time' },
                                    { text: 'Email', link: '/understand/defences/email' },
                                    {
                                        text: 'Human & social',
                                        link: '/understand/defences/human-and-social'
                                    },
                                    { text: 'Runtime', link: '/understand/defences/runtime' },
                                    {
                                        text: 'Automation & abuse',
                                        link: '/understand/defences/automation-and-abuse'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                '/build/': [
                    {
                        text: 'Start',
                        items: [{ text: 'Overview', link: '/build/start' }]
                    },
                    {
                        text: 'Run it',
                        items: [
                            { text: 'Getting Started', link: '/build/run-locally' },
                            { text: 'Start a New Project', link: '/build/new-project' },
                            { text: 'Docker & Podman', link: '/build/docker-and-podman' },
                            {
                                text: 'Containers: reference',
                                link: '/build/docker-and-podman-reference'
                            },
                            { text: 'Containers: Podman', link: '/build/docker-and-podman-podman' },
                            { text: 'Pairing & Ports', link: '/build/pairing-and-ports' },
                            { text: 'The demo profile', link: '/build/demo-profile' },
                            { text: 'The flow runner', link: '/build/flow-runner' }
                        ]
                    },
                    {
                        text: 'Change it',
                        items: [
                            { text: 'Adding & removing a module', link: '/build/module-lifecycle' },
                            { text: 'Removing a module', link: '/build/module-removal' },
                            { text: 'The module registry', link: '/build/module-registry' },
                            { text: 'Module scaffolder', link: '/build/module-scaffolder' },
                            { text: 'API', link: '/build/api-contracts' },
                            { text: 'OpenAPI Workflow', link: '/build/openapi-workflow' },
                            { text: 'AsyncAPI Workflow', link: '/build/asyncapi-workflow' },
                            {
                                text: 'Contract Ownership & Fragmentation',
                                link: '/build/contract-fragmentation'
                            },
                            {
                                text: 'Fragmentation: products example',
                                link: '/build/contract-fragmentation-state'
                            },
                            {
                                text: 'Fragmentation: the other bundles',
                                link: '/build/contract-fragmentation-other-bundles'
                            },
                            { text: 'Regenerating After a Change', link: '/build/regenerating' },
                            {
                                text: 'Versioning and Retiring an Endpoint',
                                link: '/build/versioning'
                            }
                        ]
                    },
                    {
                        text: 'Test it',
                        items: [
                            { text: 'Testing — Quick Start', link: '/build/testing-quickstart' },
                            { text: 'Testing & Docs', link: '/build/testing-and-docs' },
                            {
                                text: 'Testing: gate or hunter',
                                link: '/build/testing-and-docs-not-done'
                            },
                            { text: 'Unit Testing', link: '/build/unit-testing' },
                            { text: 'Integration Testing', link: '/build/integration-testing' },
                            {
                                text: 'Contract Testing (Response Shape)',
                                link: '/build/contract-testing'
                            },
                            {
                                text: 'Contract-Derived Request Data',
                                link: '/build/contract-request-data'
                            },
                            { text: 'Spec-Driven Fuzzing', link: '/build/fuzz-testing' },
                            { text: 'Property-Based Testing', link: '/build/property-testing' },
                            { text: 'Concurrency Testing', link: '/build/concurrency-testing' },
                            { text: 'Broker testing', link: '/build/broker-testing' },
                            { text: 'Cluster testing', link: '/build/cluster-testing' },
                            { text: 'Load testing', link: '/build/load-testing' },
                            { text: 'Mutation Testing', link: '/build/mutation-testing' },
                            {
                                text: 'Mutation: memory and workers',
                                link: '/build/mutation-testing-memory'
                            },
                            {
                                text: 'Mutation: running it',
                                link: '/build/mutation-testing-running'
                            },
                            {
                                text: 'Mutation: the ratchet',
                                link: '/build/mutation-testing-ratchet'
                            },
                            {
                                text: 'Mutation: the ruler and scope',
                                link: '/build/mutation-testing-ruler'
                            },
                            {
                                text: 'Mutation: commands and sweeps',
                                link: '/build/mutation-testing-sweeps'
                            },
                            {
                                text: 'Mutation: runaway memory',
                                link: '/build/mutation-testing-oom'
                            },
                            {
                                text: 'Mutation: the buffers case study',
                                link: '/build/mutation-testing-oom-case-study'
                            },
                            {
                                text: 'Mutation: file map and commands',
                                link: '/build/mutation-testing-reference'
                            },
                            {
                                text: 'Coverage & Confidence',
                                link: '/build/coverage-and-confidence'
                            },
                            { text: 'Test doubles', link: '/build/test-doubles' },
                            { text: 'Weak Machines', link: '/build/weak-machines' }
                        ]
                    },
                    {
                        text: 'Conventions',
                        items: [
                            { text: 'Writing These Docs', link: '/build/documentation-style' },
                            { text: 'Code comments', link: '/build/code-comments' },
                            { text: 'Dependency Vetting', link: '/build/dependency-vetting' },
                            { text: 'Dependency graph', link: '/build/dependency-graph' },
                            {
                                text: 'Pending Major Upgrades',
                                link: '/build/pending-major-upgrades'
                            },
                            { text: 'AI Auditing', link: '/build/ai-auditing' },
                            {
                                text: 'AI auditing: code-shape',
                                link: '/build/ai-auditing-code-shape'
                            },
                            {
                                text: 'AI auditing: test-honesty',
                                link: '/build/ai-auditing-test-honesty'
                            }
                        ]
                    }
                ],
                /**
                 * Generated from each module's `module.yaml` and the pages beside the index —
                 * see ../../scripts/docs/module-catalog.ts. Nothing to edit when a module is added.
                 */
                '/modules/': moduleSidebar(
                    readCatalog(
                        fileURLToPath(new URL('../../src/modules', import.meta.url)),
                        fileURLToPath(new URL('../modules', import.meta.url))
                    )
                ),
                '/operate/': [
                    {
                        text: 'Start',
                        items: [{ text: 'Overview', link: '/operate/start' }]
                    },
                    {
                        text: 'Deploy',
                        items: [
                            {
                                text: 'Ways to deploy',
                                link: '/operate/ways-to-deploy/',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'Shared hosting',
                                        link: '/operate/ways-to-deploy/shared-hosting'
                                    },
                                    {
                                        text: 'Docker server',
                                        link: '/operate/ways-to-deploy/docker-server'
                                    },
                                    {
                                        text: 'Container PaaS',
                                        link: '/operate/ways-to-deploy/container-paas'
                                    },
                                    {
                                        text: 'Kubernetes',
                                        link: '/operate/ways-to-deploy/kubernetes'
                                    },
                                    {
                                        text: 'Managed services',
                                        link: '/operate/ways-to-deploy/managed-services'
                                    }
                                ]
                            },
                            {
                                text: 'Getting Started — Production',
                                link: '/operate/first-deploy',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'After the first deploy',
                                        link: '/operate/first-deploy-after-launch'
                                    },
                                    {
                                        text: 'Proxy, uploads and backups',
                                        link: '/operate/first-deploy-proxy-and-storage'
                                    },
                                    {
                                        text: 'Monitoring and alerts',
                                        link: '/operate/first-deploy-monitoring'
                                    },
                                    {
                                        text: 'A staging copy',
                                        link: '/operate/first-deploy-staging'
                                    }
                                ]
                            },
                            { text: 'Hosting', link: '/operate/hosting' },
                            { text: 'Deploy and rollback', link: '/operate/deploy-and-rollback' },
                            { text: 'Two Client Stacks', link: '/operate/two-client-stacks' },
                            { text: 'Deployment hardening', link: '/operate/deployment-hardening' },
                            { text: 'Health checks', link: '/operate/health-checks' }
                        ]
                    },
                    {
                        text: 'Configure',
                        items: [{ text: 'Configuration', link: '/operate/configuration' }]
                    },
                    {
                        text: 'Backups',
                        items: [
                            {
                                text: 'Backups',
                                link: '/operate/backups',
                                collapsed: true,
                                items: [
                                    {
                                        text: 'The restore drill',
                                        link: '/operate/backups-restore-drill'
                                    },
                                    { text: 'Restoring', link: '/operate/backups-restoring' }
                                ]
                            },
                            { text: 'Backup server', link: '/operate/backup-server' },
                            { text: 'restic', link: '/operate/restic' },
                            { text: 'rclone', link: '/operate/rclone' },
                            {
                                text: 'MongoDB Database Tools',
                                link: '/operate/mongodb-database-tools'
                            }
                        ]
                    },
                    {
                        text: 'Observe',
                        items: [
                            {
                                text: 'Observability Stack Reference',
                                link: '/operate/observability-reference'
                            },
                            { text: 'Grafana', link: '/operate/grafana' },
                            { text: 'Prometheus', link: '/operate/prometheus' },
                            { text: 'Loki', link: '/operate/loki' },
                            { text: 'Tempo', link: '/operate/tempo' },
                            { text: 'OpenTelemetry', link: '/operate/opentelemetry' },
                            { text: 'Gatus', link: '/operate/gatus' },
                            { text: 'Winston & Audit Logs', link: '/operate/winston' },
                            {
                                text: 'Frontend Observability',
                                link: '/operate/frontend-observability'
                            }
                        ]
                    }
                ],
                '/reference/': [
                    {
                        text: 'Start',
                        items: [{ text: 'Overview', link: '/reference/start' }]
                    },
                    {
                        text: 'API',
                        items: [
                            { text: 'Endpoints', link: '/reference/endpoints' },
                            { text: 'GET /config — the boot answer', link: '/reference/config' },
                            { text: 'Observability Endpoints', link: '/reference/observability' },
                            { text: 'Error Responses', link: '/reference/errors' },
                            { text: 'Success Responses', link: '/reference/responses' },
                            { text: 'Sorting a List', link: '/reference/sorting' },
                            { text: 'Field limits', link: '/reference/field-limits' }
                        ]
                    },
                    {
                        text: 'Lookups',
                        items: [
                            { text: 'Glossary', link: '/reference/glossary' },
                            { text: 'Package Scripts', link: '/reference/package-scripts' },
                            {
                                text: 'Package Dependencies',
                                link: '/reference/package-dependencies'
                            },
                            {
                                text: 'Permission Vocabulary',
                                link: '/reference/permission-vocabulary'
                            }
                        ]
                    },
                    {
                        text: 'Folder map',
                        items: [
                            { text: 'Repository Root', link: '/reference/root' },
                            { text: 'App, Kernel & Types', link: '/reference/src-app' },
                            { text: 'Infrastructure', link: '/reference/src-infrastructure' },
                            { text: 'Modules', link: '/reference/src-modules' },
                            { text: 'Contracts', link: '/reference/contracts' },
                            { text: 'Data', link: '/reference/data' },
                            { text: 'Scripts & Hooks', link: '/reference/scripts' },
                            { text: 'Tests', link: '/reference/tests' },
                            { text: 'Ops & Assets', link: '/reference/ops' }
                        ]
                    }
                ]
            },
            socialLinks: [
                {
                    icon: 'github',
                    link: 'https://github.com/Guebbit/boilerplate-node-backend'
                }
            ]
        },
        mermaid: {
            theme: 'neutral',
            useMaxWidth: true,
            htmlLabels: true,
            flowchart: {
                nodeSpacing: 45,
                rankSpacing: 70,
                padding: 15
            },
            themeVariables: {
                primaryColor: '#f5f3ff',
                primaryBorderColor: '#7c3aed',
                primaryTextColor: '#111827',
                secondaryColor: '#eff6ff',
                secondaryBorderColor: '#2563eb',
                tertiaryColor: '#ecfeff',
                tertiaryBorderColor: '#0891b2',
                clusterBkg: '#f8fafc',
                clusterBorder: '#cbd5e1',
                lineColor: '#64748b'
            }
        }
    })
);
