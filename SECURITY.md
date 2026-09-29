# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities through GitHub's private
[Security Advisories](../../security/advisories/new) for this repository, not a public issue. That
gives us a private channel to discuss and fix the problem before it is disclosed.

Include what you'd include in any bug report: the affected version or commit, the steps to
reproduce, and the impact you'd expect. A proof of concept helps but isn't required.

A running deployment may also publish its own contact at `/.well-known/security.txt`
([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)). This boilerplate serves it only when the
operator configures it, so a fork never advertises someone else's address.

## Supported versions

This is an alpha-stage boilerplate with no version policy yet: the latest commit on `main` is the
only supported one. There is no LTS branch to backport a fix to.

## Scope

This repository is a boilerplate meant to be forked and adapted — a real deployment's security
posture depends on choices this repo cannot make for it (its TLS termination, its reverse proxy,
its own `.env`, its secrets and key rotation). A vulnerability in the API code this repo ships is
in scope — authentication, authorization, input handling, the contract and the container image. A
hardening suggestion for a downstream deployment's own infrastructure is welcome as a regular
issue instead.
