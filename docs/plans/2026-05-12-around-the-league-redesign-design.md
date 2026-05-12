# Around the League — Homepage Redesign

## Problem

The current "Around the League" section has four buckets (Live Now, Today, Coming Up, Recent), all rendered as identical full-size score cards. Live and upcoming games show `—` in the score slot because YSBA does not post scores during games — finals appear hours or days later. The result wastes vertical space and reads as broken.

## Goal

Replace the 4-bucket card grid with:

1. A compact **"On the Schedule"** strip — dense one-line rows for live + upcoming games, no score area.
2. A **"Latest Scores"** grid — the existing score cards, kept for completed games only (where real data exists).

Live state is communicated via a small pulsing green dot, not red, and not via empty score boxes.

## Section Structure

```
AROUND THE LEAGUE

ON THE SCHEDULE                                         3 games
─────────────────────────────────────────────────────────────
● LIVE  10U INTERLOCK   Markham @ Caledon          6:30 PM · Carlton
● LIVE  10U INTERLOCK   Leaside @ Vaughan          6:00 PM · Rolph Rd
  TUE   10U INTERLOCK   Leaside @ Richmond Hill    6:00 PM · Rolph Rd

LATEST SCORES                                          12 games
[score card]  [score card]  [score card]  …
```

## Row anatomy (schedule strip)

Each row, 36–40 px tall, six columns on desktop:

| Slot       | Content                              | Style                              |
|------------|--------------------------------------|------------------------------------|
| Indicator  | Pulsing dot (live) or static dot     | 6 px, `--green-bright`             |
| Status     | `LIVE` / `TODAY` / `TUE` / `MAY 15`  | Mono, 0.7 rem, uppercase           |
| Division   | `10U INTERLOCK`                      | Display, 0.8 rem, uppercase, muted |
| Matchup    | `Away @ Home`                        | Display, 0.95 rem, ink             |
| Time       | `6:30 PM`                            | Mono, 0.8 rem                      |
| Venue      | `Carlton`                            | Display, 0.8 rem, ink-3, truncate  |

Whole row is a single `<a>` to the division page.

Mobile (≤ 520 px): two-line stack. Line 1: indicator · status · division · time. Line 2: matchup · venue.

## Live indicator

- 6 px green dot, brand `--green-bright`.
- 1.4 s pulse (opacity 1 → 0.4 → 1), `prefers-reduced-motion` disables it.
- No red. The current ticker LIVE pill (red) stays; this is a separate "live without score yet" signal.

## Bucketing rules

- **live**: `gameLiveState(g) === 'live'` (start time ≤ now ≤ start + game length, no final score).
- **today-upcoming**: `isToday(g) && !isCompleted && not live`.
- **future**: not today, not completed, within 7 days.
- Sort: live first, then today by start time, then future by start time.
- Cap at 6 rows. If overflow, add a small `+N more on /schedule …` link (links to first overflow division for now; full schedule page is out of scope).
- If 0 rows: hide the entire strip.

## Latest Scores grid

- Source unchanged: `state.recent.games` filtered to `isCompleted && score`.
- Card layout unchanged.
- Cap from 16 → 12 to balance against the new strip on tall pages.

## Header changes

- Drop the `BOX SCORE` kicker and the `Updated continuously` meta.
- Two separate sub-headers: `On the Schedule` + count, `Latest Scores` + count.
- Single `<h2>Around the <span class="accent">League</span></h2>` umbrella stays.

## Out of scope

- New `/schedule` page.
- Changing the data fetch shape.
- Touching the ticker, lead story, standings snapshot, or division grid.

## Files affected

- `public/index.html` — replace the scoreboard CSS block, the `renderScoreCard` / `renderScores` JS, and the section markup.
- No CSS changes outside the scoreboard block.
- No data layer changes.
