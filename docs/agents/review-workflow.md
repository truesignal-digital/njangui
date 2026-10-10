# How work moves: issue → branch → PR → review → merge → release

Branches and environments: `docs/adr/0001-develop-is-staging.md`. Issue commands: `docs/agents/issue-tracker.md`.

## Issues

- An **epic** is a parent issue labelled `enhancement`. Body: a 2–4 sentence goal, `## Slices (build order)` as a checklist, `## Done when`, `## Open questions`.
- A **slice** is a sub-issue sized for one agent session, a thin vertical piece. Body, in this order, under 60 lines:
  `Part of #<epic>` · `## Problem` (with `path:line` evidence) · `## Decision` · `## Acceptance criteria` (checkboxes) · `## Guard test` · `## Definition of done` · `## Related`.
  A slice waiting on the owner adds `**Waiting on the owner:** <the exact question>`.
- **Labels:** exactly one category (`bug` or `enhancement`) and one state (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`).
- **Picking work:** take the first open slice labelled `ready-for-agent` with no open blocker and no assignee. Claim it by assigning yourself; that is your first write.

## Branches

- Name: `<type>/<issue#>-<kebab-slug>`, with `type` one of `feat`, `fix`, `docs`, `chore`, `test`, `perf`.
- Cut from `origin/develop`, in your own worktree. Update by merging `origin/develop` in. Never rebase, never force-push, never push to `develop` or `main`.
- Keep the diff to your slice. Anything else you notice goes under "Found while testing" and becomes a new issue.

## Building

1. Write the guard or behaviour test first and watch it fail, then make it pass.
2. Run `bun run typecheck`, `bun run lint:design`, `bun run test` (and `bun run test:convex` when `convex/` changed).
3. Verify in the real app. Tests are not enough for UI or native changes; record a walkthrough.

## Pull requests

- Target `develop`, using `.github/pull_request_template.md`. Title: a plain imperative sentence ("Stop Android launch crash from null color scheme"), no `feat:` prefix.
- Reference the issue with `Part of #N`. Do not write `Closes #N` on PRs into `develop`; issues are closed by hand after the merge.
- Agents may push their branch and open the PR. They may not merge, close issues, or push to `develop`/`main`.

## Review

- An independent reviewer from a **different model** than the author (Opus builds, Fable reviews).
- One PASS / FAIL / UNVERIFIED verdict per acceptance line, with `file:line` evidence and reproduction steps for anything blocking.
- The verdict applies only to the reviewed head SHA. New commits need a new review.

## Merging

- Merge commits only: `gh pr merge <n> --merge --match-head-commit <reviewed-sha>`.
- The owner merges, or an agent the owner explicitly told to merge that PR. A request to build, review or open a PR is not permission to merge it.
- After merging into `develop`, close the issue by hand with a comment naming the PR.

## Releasing

- A PR from `develop` into `main` titled `Release: <what> (YYYY-MM-DD)`, merged with a merge commit.
- Promote the JS update tested on `preview` with `eas update:republish --destination-channel production`; never publish a fresh build of `main`.
- Hotfix: branch from `main`, merge into `main`, merge back into `develop` the same day.
