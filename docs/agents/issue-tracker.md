# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The Wayfinder map is a GitHub issue with child decision tickets.

- **Map**: create one issue labelled `wayfinder:map` containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: create an issue labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`, then attach it through GitHub's sub-issues endpoint. If sub-issues are unavailable, add `Part of #<map>` to the ticket and a task-list link to the map.
- **Blocking**: use GitHub's native issue dependency relationship. POST to `repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by` with the blocker's numeric database `id`. If dependencies are unavailable, add `Blocked by: #<number>` to the child body.
- **Frontier**: list the map's open children in map order, excluding tickets with an open blocker or assignee.
- **Claim**: assign the ticket before any decision work with `gh issue edit <number> --add-assignee @me`.
- **Resolve**: add a resolution comment, close the ticket, then append a one-line linked context pointer to the map's Decisions so far.

Refer to maps and tickets by linked title in user-facing writing, never by bare issue number.
