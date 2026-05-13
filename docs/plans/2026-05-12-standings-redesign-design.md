# Standings Page — Mobile-First Redesign

## Problem

The division standings page was hard to read on phones. The 10-column table (Pos · Team · GP · W · L · T · PTS · RF · RA · PCT) horizontally scrolls below ~640 px, team names get ellipsis-truncated, and the type is small enough to feel cramped. The schedule modal that opens when you tap a team had its own problems: a heavy all-black header band, oversized black score chips that dominated every row, and competing visual weight everywhere.

The notifications bell sits in the status bar but the underlying email pipeline isn't reliably delivering — keeping the visible affordance creates expectations the product can't meet.

## Goal

Bring the standings page in line with the homepage's editorial-sports aesthetic (Barlow Condensed display, Barlow body, JetBrains Mono numerals, near-black accents, restrained surfaces). Mobile-first. Bigger type. Real breathing room. No horizontal scrolling unless the user explicitly opts in.

## Three changes

### 1. Mobile card layout for standings (≤ 640 px)

Each table row reflows into a single-line card via CSS Grid. Existing `<table>` markup is preserved (data integrity, sortability) — the layout transformation is CSS-only plus a single trailing `<td>` that holds the mobile-only stat strip.

Card anatomy:

```
┃ ① CALEDON NATIONALS 9U DS                     1.000
┃                                               ─────
┃   REC 2-0-0  │  PTS 4   GP 2   DIFF +24
```

- Left edge stripe: green-bright for #1, soft-green for #2-3, neutral for the rest.
- Position pill becomes jersey-style (2.2 rem square) on mobile, with rank-tier coloring (`.position-1` / `.position-2` / `.position-3` activate previously-dormant sports-skin rules).
- Team name in Barlow Condensed 1.1 rem, allowed to wrap. No more ellipsis truncation.
- Win-percentage chip stays top-right, larger and more prominent.
- Stat strip below the team name: `REC` (W-L-T) is the headline, then `PTS`, `GP`, and `DIFF` (run differential) — DIFF colored green/red by sign.

Above 640 px the table renders as before, just bumped: thead padding 0.85 → 1 rem, td padding 0.8 → 1.05 rem, team-name 1.02 → 1.1 rem, numerals 0.88 → 0.98 rem, position badge 1.85 → 2.05 rem.

The mobile-stats `<td>` is `display: none` in desktop mode so it doesn't claim a column.

### 2. Cards / Table view switcher

Some users want the dense table even on phones. A subtle segmented control lives in the status bar (replacing the hidden notifications bell — see below) and toggles between modes.

```
⚡ LAST SYNCED: 2M AGO                              ☰  ▦
                                                    ─
```

- Two icon-only buttons, no chrome. `bi-list-ul` (cards/list view) + `bi-table` (classic table).
- Inactive: `--ss-ink-4`. Active: `--ss-ink` plus a 2 px green underline accent.
- Phone-only (`display: none` ≥ 641 px). Desktop has one canonical layout.
- Preference persists via `localStorage.standingsView` (`"cards"` | `"table"`).
- An inline `<script>` in `<head>` reads the value before render and stamps `<html class="view-classic">` if needed — avoids a flash of the wrong view on reload.
- Classic mode keeps every breathability improvement (taller rows, bigger numerals, TOP pill, swipe-to-see-more hint) but restores `display: table-*` on rows/cells via `html.view-classic` overrides scoped inside `@media (max-width: 640px)`.

Default for first-time visitors: **Cards**.

### 3. Schedule modal redesign

Tapping a team opens a Bootstrap modal showing their historical + upcoming games. The previous design used an inky black header band, large colored result badges at the top of every row, and dominant black score chips on the right. The new design is lighter, more editorial, more breathable.

Modal header:
- White surface (was near-black).
- Team name 1.7 rem display caps (was 1.15 rem). On mobile, 1.45 rem.
- Record line below in mono caps: `1W – 1L · 2 GP` with a muted middle-dot separator (was `1W - 1L ⚾ 2 games played`).
- Close button reverts to a subtle dark Bootstrap X.

Game row anatomy (final game):

```
┃ ROYAL YORK                                     9 – 10
┃ MAY 7 · HOME                                FINAL [L]
```

- Colored left stripe encodes result (green win / red loss / amber tie / blue upcoming / grey no-result). The big colored "WIN/LOSS" badge that used to sit at the top of each row is gone — the stripe carries that signal.
- Opponent name 1.2 rem display caps (was 1.05 rem).
- Date · home/away in mono caps, smaller.
- Score is a clean mono pair `9 – 10` with a muted dash, 1.5 rem (was inside a 14 px-padded black chip).
- Below the score, a tiny `FINAL [W/L/T]` caption — the letter is a 0.66 rem colored chip.

Upcoming-game rows show time-of-day instead of score (`6:30 PM` with `UPCOMING` caption). No-result past games show `—` with `NO SCORE`.

Mobile (≤ 640 px) scales everything down proportionally: title 1.45 rem, opponent 1.08 rem, score 1.35 rem.

## Notifications bell — hidden, not removed

The bell in the status bar opens a notifications signup modal. The email backend has never delivered notifications reliably in production — keeping the bell visible promises a feature that doesn't ship.

For now the bell is **hidden via CSS** (`.status-action-link--hidden { display: none !important }`) plus `aria-hidden="true"` and `tabindex="-1"` on the link. The markup and the modal stay in the DOM. Re-enabling later is one class removal + restoring `aria-hidden`/`tabindex`.

When the email pipeline is fixed, the bell will land back next to the view switcher in the same flex row.

## Files affected

- `public/standings.html`
  - Inline `<head>` script that reads `localStorage.standingsView` before paint to set `html.view-classic`.
  - View-switcher `<div>` lives inside `.status-actions` (right side of status bar, phone-only via CSS).
  - Notifications `<a>` gets `status-action-link--hidden` class + `aria-hidden="true"` + `tabindex="-1"`.
- `public/js/multi-division-app.js`
  - `createTeamRow()` adds `data-stat` attributes to each stat `<td>`, a trailing `<td class="mobile-stats-strip">` cell, and a `rank-top` / `rank-high` / `rank-rest` class on the row.
  - `createPositionBadge()` adds `position-1` / `position-2` / `position-3` / `position-other` classes.
  - `initViewSwitcher()` + `applyStandingsView()` — reads/writes `localStorage`, toggles `<html>` class, re-arms sticky header when switching to table mode.
  - `displayNewSchedule()` — record format rewritten (`1W – 1L · 2 GP`).
  - `createNewGameCard()` — score display restructured with `<span class="score-dash">` and the `FINAL [W/L/T]` caption chip.
- `public/css/sports-skin.css`
  - Desktop standings type/spacing bump.
  - Full `@media (max-width: 640px)` block: card layout, view-switcher chrome, `html.view-classic` overrides.
  - `@media (max-width: 380px)` tightening block for iPhone SE-class phones.
  - Schedule modal block fully rewritten (light header, transparent score numerals, result chips).
  - `.status-action-link--hidden` rule.

## Out of scope

- Restoring email notifications (separate engineering effort).
- Touching the homepage, ticker, or other division-page surfaces beyond what cascades from the shared sports-skin overlay.
- Changing the data shape from `/api/standings` or `/api/team/:teamCode/schedule`.
