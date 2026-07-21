# Unified Groups Prototype Design

**Date:** 2026-07-21
**Status:** Approved for prototype
**Wayfinder ticket:** [Prototype the unified Groups screen and create chooser](https://github.com/truesignal-digital/njangui/issues/21)

## Decision to test

Use one mixed Groups list and an acquisition-first creation chooser. The
one-time Contribution path leads visually because it is the quickest path from
a WhatsApp need to a useful Group. Njangi remains a clear, first-class choice,
and invitation entry stays available without competing with creation.

The approved chooser order is:

1. **Collect for a purpose** — dominant action;
2. **Start a njangi** — secondary action;
3. **Join with an invitation** — tertiary action.

French follows the same hierarchy with plain, action-led labels:

1. **Collecter pour un besoin**;
2. **Démarrer un njangi**;
3. **Rejoindre avec une invitation**.

## Groups list

Contribution groups and njangis appear in one action-sorted stream. There are
no mode tabs or persistent filters. Every card begins with the same identity
hierarchy:

- one localized purpose tag beside the Group name;
- the Group name;
- a quiet mode label only where the primary fact does not already explain it;
- one mode-aware fact;
- at most one viewer-owned attention treatment.

A Contribution card emphasizes confirmed progress, the deadline, and any
claim awaiting the viewer. A Njangi card emphasizes the current or next round,
the next due date, and whether the viewer owes or receives. The two card modes
share spacing, typography, borders, and navigation affordance without sharing
lifecycle vocabulary.

## Prototype scope

Build reusable discriminated-summary presentation code and a development-only
preview route containing representative Contribution and Njangi fixtures. The
real Groups tab adopts the same purpose treatment for existing njangis while
the Contribution backend is still being built. The preview must demonstrate:

- mixed ordering with viewer actions first;
- open/current items before terminal items;
- all-purpose text remains understandable without relying on color;
- French and English copy fits a small phone width;
- the chooser preserves all three paths without looking like separate apps.

The preview route must not make fixture data available in production builds.

## Interaction and accessibility

Cards are full-row buttons with explicit accessible labels containing name,
purpose, and the primary fact. Purpose and mode remain text, never color-only.
Touch targets stay at least 44 points. Motion is limited to a short staggered
entry that respects reduced-motion settings. The list must remain usable with
large text and on narrow Android screens.

## Verification

Render the preview at a narrow mobile viewport in French and English, inspect
the chooser and mixed list visually, run typecheck and design lint, and export
the native and web bundles. Record screenshots and the final human reaction on
the Wayfinder ticket before closing it.
