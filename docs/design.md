# Design

## Principles

1. Plain and fast: HTML, CSS and JavaScript, no framework, no build step.
2. Presentation is separate from data. `crm/ui.css` and `crm/ui.js` only restyle and enhance what each page already renders; they never read or write data, and every enhancement is optional (skipped if something is missing).
3. Accessible by default: WCAG 2.2 AA, keyboard use, visible focus, reduced-motion support, checked by axe on every page in CI.
4. Honest about privacy: equal-weight consent choices, no dark patterns, third parties listed.

## CRM design tokens (`crm/ui.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0B1020` | Text, dark surfaces |
| `--paper` / `--paper-deep` | `#F3F5FA` / `#E8ECF6` | Page background |
| `--stone` | `#59627A` | Secondary text |
| `--hairline` | `#E1E6F1` | Borders |
| `--blue` / `--blue-deep` | `#2F5BFF` / `#0E1330` | Primary action, hero |
| `--err` / `--ok` / `--warn` | `#C62828` / `#16794A` / `#9A6A15` | Status |
| Radii | 18 / 12 / 10 px | Cards, controls, small |

Fonts: Inter for UI and Manrope for headings, both self-hosted in `assets/fonts/` with `font-display: swap`.

## Loading, empty and error states

- **Skeleton loaders.** A list cell whose text is only "Loading…" gets `.is-loading` from `ui.js` (re-checked on every refresh), and `ui.css` draws pulsing bars over it. The words stay in the page for screen readers and for tests that wait for them to go. `product.html` has the same pulse for its own loading panel.
- **Empty states.** `.empty-row` cells show a quiet inbox icon above the message. Error rows (inline red) keep their plain look.
- **Reduced motion.** The pulse stops and the bars show at a steady opacity. A global reduced-motion rule also shortens other animation.
- **Toasts** for save results come from `crm/live.js` and `ui.css`.
- Where a table row opens details, it carries a hover hint (`title="Click for details"`).

## Public site

- `assets/modern-brand.css`, `modern-home.css`, `motion-system.css` carry the look and motion; `fit.css` the responsive fitting; `pe-trust.css` the consent banner.
- Images: the hero images are WebP. Below-the-fold images use `loading="lazy"` and `decoding="async"`; above-the-fold images stay eager.
- Brand sub-sites (`makwell/`, `flyvision/`, `skevia/`) adapt colours and tone per brand; `product.html` themes itself from the product's brand.

## Adding UI

- Reuse an existing class before adding CSS; new shared styles go in `ui.css`, page-specific ones in the page.
- Never hide information behind colour alone; keep text labels on status pills.
- If a control lives in a modal, tests need `revealModals(page)` ([testing.md](testing.md)).
- Add a test for anything a user can break.
