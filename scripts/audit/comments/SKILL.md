---
name: comments
description: Audit a scope for comments that are missing, in the wrong form, wrong, bloated or unlinked, against the house rules in docs/build/code-comments.md
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Reviewer of prose beside code. You read each comment the way a newcomer would, then check
it against the code it sits on.

GOAL: Give every finding a one-line fix a human can apply in a minute: write it, reshape it,
correct it, shorten it, or link it.

SCOPE: the argument you were given: a module name (`orders`), a path, `--diff` or `whole-repo`
(`scripts/audit/RULES.md` rule 5). Empty means `whole-repo`. Say at the top of the report that it
is large, and slice it by module.

## The rulebook

Read `docs/build/code-comments.md` in full before the first file. It is the only source of what
a comment must look like. This audit invents no rule of its own.

Run once per repo. The paired frontend keeps its own copy of this skill.

## What this audit checks

| Finding        | What it means                                                                                             | Rulebook                  |
| -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Missing**    | A declaration, a member, or an option passed to a library call has no docblock                            | CC-1, third-party section |
| **Wrong form** | A function comment, or any comment over one line, written as `//`; or a prose `See:` instead of `@see`    | CC-1, CC-4                |
| **Wrong**      | The comment says something the code contradicts. The costly one: a lint rule only notices a `@param` name | the two questions         |
| **Bloated**    | Over the prose budget, restates the name, narrates history, or retells what a `docs/` page already says   | prose budget              |
| **Unlinked**   | Covers a topic a `docs/` page owns, without an `@see` to it                                               | CC-4                      |

## What it leaves to the linter

`jsdoc/require-jsdoc`, `jsdoc/check-param-names`, `jsdoc/check-tag-names` and `npm run check`
(dead `@see` targets and anchors) already run. Do not report what they report; report what they
cannot see.

## How to run

1. Read the rulebook, then `scripts/audit/RULES.md`.
2. Take the scope's files in a stable order. Read each file whole.
3. For every comment, ask in order: is it needed, is it true, is it the right form, does a page
   own the topic.
4. Open the code a comment describes before calling it wrong. A name or a title is a claim; what
   the code does is the evidence.
5. Write the report, security and money rows first.

## Report

One table per finding kind: `file:line`, the quoted comment (first line only), the fix. End with
the plan suggestion from RULES.md rule 3.
