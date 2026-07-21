# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- `CONTEXT-MAP.md` if it is introduced later.
- ADRs under `docs/adr/` that touch the area being changed.

If one of these files does not exist, proceed silently.

## File structure

This is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md` in issue titles, proposals, hypotheses, and tests. Do not drift to synonyms the glossary explicitly avoids.

When a necessary concept is absent, first determine whether it is unnecessary new language or a genuine domain gap. Resolve genuine gaps through domain modeling before implementation.

## Flag ADR conflicts

Surface contradictions with existing ADRs explicitly instead of silently overriding them.
