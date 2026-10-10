Part of #<issue> · targets `develop` (release PRs: `develop` → `main`)

## What changed

<!-- Plain sentences. What a reviewer should look at first. -->

## Walkthrough video

<!-- Required when this PR changes app/, src/, convex/ or app.json (tests excepted); the pr-evidence check enforces it. Link the reel from `bun run verify drive <flow> --reel` (before | after with `bun run verify reel <after> --before <before>` when behaviour changed), uploaded with `bun run verify upload`: the .mp4 link plus the contact sheet image. When nothing visible changed, write "Walkthrough video: not recorded (<reason>)" instead. -->

## Merge danger

- **Door:** one-way / two-way
- **Blast radius:** screen / module / all users / offline clients / money ledger

## Found while testing

<!-- Anything outside this slice. File it as a new issue (`needs-triage`); do not fix it here. -->

## Independent review

- Author model:
- Reviewer model: <!-- must differ from the author -->
- Reviewed head SHA:
- Verdict: `review:approve` / `review:changes`

## Checks

- [ ] `bun run typecheck`
- [ ] `bun run lint:design` (includes fr/en key parity)
- [ ] `bun run test`, plus `bun run test:convex` when `convex/` changed
- [ ] New `ConvexError` codes have `errors.<code>` keys in fr and en
- [ ] Verified on the real app (device or simulator), not only by tests
