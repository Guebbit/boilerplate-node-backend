---
source: k8s/base/namespace.yaml
source_sha256: 788e856e53247622f76299f63660cfbba9cc3a99cffc9e9a5cca63cae440a5e7
context_sha256: 2f2e1f7b5575f99a70399c799aa8235aaab6ed3bb96a854f5b9c82964bef56ea
generated_at: 2026-11-22T01:37:30.894950+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/namespace.yaml

## Purpose
Defines the single Kubernetes `Namespace` named `boilerplate` that holds the whole stack. Keeping everything in one namespace means one command, `kubectl delete namespace boilerplate`, tears down all resources, persistent volume claims included.

## Key elements
- `kind: Namespace` (`apiVersion: v1`): the only resource in the file.
- `metadata.name: boilerplate`: the namespace name for the stack.

## Relationships
- `k8s/base/kustomization.yaml` is the neighboring file in the dependency graph, so this manifest is part of the base kustomization it defines.

## Notes
- Deleting the namespace is destructive. Per the file's own comment, it also removes claims, so any data stored on them goes too.
- Resources must target the `boilerplate` namespace to be covered by that single-command cleanup.
