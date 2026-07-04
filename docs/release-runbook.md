# Release Runbook

Actions only. The *why* lives in [deployment-model.html](./deployment-model.html).
Always online at: `github.com/truesignal-digital/njangui/blob/main/docs/release-runbook.md`

**The model in one line:** merging to main auto-deploys the backend (staging → prod).
Nothing reaches users' phones until you run a command from this page.

---

## Where is everything right now?

```bash
bun run release:status
```

---

## Ship JS to staging testers (preview channel)

```bash
git checkout main && git pull
bun run release:status                        # read what testers currently have
npx eas-cli@latest update --channel preview --environment preview \
  --message "one line: what changed"
bun run release:status                        # confirm the publish landed
```

Testers get it on their **second** app launch (first launch downloads, second runs it).

## Ship JS to real users (production channel)

Same commands, swap the channel **and** the environment — they must always match:

```bash
git checkout main && git pull
bun run release:status
git log --oneline <last-released-commit>..main   # READ THIS — it is your release
npx eas-cli@latest update --channel production --environment production \
  --message "one line: what changed"
bun run release:status
```

> ⚠️ `--environment` bakes in that tier's backend URL + Clerk key.
> Wrong flag = staging app talking to prod money. Never omit it.

## When OTA is not enough (native changed)

If `release:status` shows the update's runtime differs from the installed builds'
runtime, the OTA reaches nobody. Build instead:

```bash
npx eas-cli@latest build -p android --profile preview --non-interactive --no-wait
npx eas-cli@latest build -p ios --profile preview --non-interactive --no-wait
```

Install links appear at expo.dev → project njangi → Builds (iOS: open the build
page in Safari on a registered iPhone → Install).

---

## Something bad is live — rollback

| What's broken | Do this | Takes |
|---|---|---|
| Backend (Convex) | `git revert <merge-sha>` → PR → merge. Pipeline redeploys automatically. | ~5 min |
| JS update (OTA) | `npx eas-cli@latest update:republish --channel <channel> --group <old-update-group-id>` (find the id: `update:list --branch <channel>`) | ~5 min |
| Native binary | No recall. Fix forward: OTA if JS-fixable, else new build + store review. | hours–days |

**Revert first, investigate second.** Prod healthy beats root cause found.

---

## Rarely needed

| Task | Command |
|---|---|
| Backend deploy logs | `gh run list --workflow "Deploy Convex" --limit 5` |
| What's on a channel | `npx eas-cli@latest update:list --branch <channel> --limit 5` |
| Recent builds | `npx eas-cli@latest build:list --limit 5` |
| Staging backend logs | `bunx convex logs --deployment-name benevolent-gopher-102` |
| Prod backend logs | `bunx convex logs --prod` |
| Crashes / errors | https://true-signal-digital.sentry.io/issues/ |

## The map

| Tier | Backend | Auth | Who has it |
|---|---|---|---|
| dev | dev Convex (`.env.local`) | dev Clerk | your simulator |
| staging | `benevolent-gopher-102` | dev Clerk | preview-channel builds |
| prod | `fantastic-zebra-245` | prod Clerk (`clerk.njangui.truesignaldigital.com`) | production-channel builds (none shipped yet) |
