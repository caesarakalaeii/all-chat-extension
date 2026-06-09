# ADR 006: Standardize the Build Environment on the Latest Node.js LTS

**Status: Accepted**
**Date: 2026-06-09**

## Context

On 2026-06-09 the Mozilla Add-ons team flagged All-Chat Extension 1.6.3 for a policy violation under *Development → Unsupported build tools or environments*: the CI build pipeline pinned Node.js 20, which reached end-of-life on 2026-04-30. Mozilla does not accept extensions built with a toolchain that is no longer supported by its maintainers, and gave 30 days before the affected version is disabled on addons.mozilla.org.

The Node version was pinned literally (`node-version: '20'`) in two jobs of `.github/workflows/build-and-release.yml`, and an illustrative CI snippet in `docs/TESTING_QUICKSTART.md` pinned an even older, also-EOL Node 18. There was no `.nvmrc` or `engines` field, so the supported build environment was neither declared in one place nor obvious to a reviewer reproducing the build.

## Decision

Standardize the build environment on the **latest Node.js LTS line**, currently **Node 24** (Active LTS until ~2026-10, maintenance until ~2028-04).

To stop the pin from silently going stale again, the version lives in a single source of truth:

1. **`.nvmrc`** contains the major version (`24`). It is the canonical declaration for local development (`nvm use`) and for CI.
2. **CI** (`build` and `release` jobs) consumes it via `actions/setup-node`'s `node-version-file: '.nvmrc'` rather than a literal version, so the two jobs can never drift from each other or from local dev.
3. **`package.json`** declares `engines.node: ">=24"` so the supported runtime is visible to anyone inspecting the manifest (including AMO reviewers) and tooling warns on an out-of-range runtime.

Bumping the build environment in the future is a one-line change to `.nvmrc` (and the matching `engines` floor).

## Consequences

- The Mozilla finding is resolved: builds run on a maintainer-supported Node line, and the supported environment is declared explicitly in reviewer-visible places that cannot drift apart.
- A new extension version must be released so AMO accepts a compliant upload; the produced artifact is otherwise unchanged (webpack output does not depend on the Node major version for this codebase).
- This pin must be revisited before Node 24 reaches end-of-life (~April 2028). At that point, bump `.nvmrc` and `engines.node` to the then-current LTS.
- Contributors on a Node older than 24 will see an `EBADENGINE` npm warning; this is intentional signalling, not a hard failure.

## Alternatives Considered

### Pin to Node 22 (the older maintenance LTS)
Pros: Slightly broader contributor compatibility.
Cons: Shorter runway (EOL ~2027-04 vs ~2028-04). The latest LTS maximizes the time before this recurs.

### Pin to Node 26 (the latest "Current" release)
Pros: Newest features.
Cons: Node 26 does not enter LTS until ~2026-10. Building production release artifacts on a non-LTS Current line is discouraged and risks a shorter, less predictable support window than an LTS.

### Keep a literal version pin in CI
Pros: No new file.
Cons: This is exactly what went stale and triggered the violation — two pinned jobs plus a docs snippet had already drifted to three different values (20, 20, 18). A single `.nvmrc` removes the drift.
