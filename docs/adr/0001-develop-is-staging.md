# ADR-0001: develop is staging, main is production

**Status:** accepted · **Date:** 2026-10-09 · **Supersedes:** `docs/deployment-model.html` §1–2 ("Ship from Trunk")

## Decision

Two long-lived branches:

- **`develop`** is the integration branch and the **staging** environment. Feature PRs merge here. A merge deploys Convex staging (`benevolent-gopher-102`). The JS update is published to the `preview` channel, which testers' preview builds listen to (`.github/workflows/eas-update.yml`).
- **`main`** is **production**. It changes only through a release PR from `develop` (titled `Release: <what> (YYYY-MM-DD)`) or a hotfix. A merge deploys Convex prod; the JS update is promoted to the `production` channel.

## Why

- Real money and trust: every change runs in front of testers on staging before it reaches people's money.
- App binaries ship at store speed, so a bad production release is slow to undo. A human-tested staging audience is worth an extra merge.
- The team uses the same flow in ROUTIQ; one process across projects.

## Invariants

1. Nothing lands on `main` except release merges and hotfixes. No direct pushes to `main` or `develop`; no force pushes.
2. A release merges the current head of `develop`, with a merge commit.
3. A hotfix branches from `main`, merges into `main`, and is merged back into `develop` the same day.
4. JS is promoted, never rebuilt: the update tested on `preview` goes to production with `eas update:republish --destination-channel production`. A fresh `eas update` from `main` would be a new, untested artifact. This is safe because the bundle picks its backend at runtime from its update channel (`preview` → staging, `production` → prod, `src/lib/env-channel.ts`); build-time `EXPO_PUBLIC_*` values only apply to dev builds.
5. Convex prod deploys only from `main`; staging only from `develop` (`.github/workflows/deploy-convex.yml`). Two jobs, each naming only its own secret (`CONVEX_STAGING_DEPLOY_KEY`, `CONVEX_DEPLOY_KEY`), with no ternaries and no GitHub Environments: a missing environment secret silently falls back to a repo secret of the same name. Each job fails if its key is missing or targets the other deployment.
6. Public Convex function signatures evolve additively across both deployments (CLAUDE.md, Server State).
7. Branch protection on both branches: one required check named `CI`, conversations resolved, no force push, no deletion, admins included.

## Revert trigger

Go back to trunk-based delivery if a hotfix stays un-merged into `develop` for more than a day, or a release sits on staging for more than a day because `develop` holds unrelated unfinished work. Either means the branches are drifting, which is the failure the trunk model was chosen to avoid.

## Consequences

- `docs/deployment-model.html` §1–2 describe the old model; its channel and "build once, promote" sections still apply.
- Issues close by hand after the merge into `develop` (merges into `develop` don't auto-close them).
