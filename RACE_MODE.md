# Race Mode — Plan

An alternative game mode. The host opens a crossword as usual and creates a **lobby**; friends join from a link;
the host starts a countdown and everyone races to finish the same puzzle, each on their own private copy. The host
watches everyone's boards live on a full-page race view, and can also race in a separate window.

This builds on the co-op app described in [PLAN.md](PLAN.md). The parts that matter here are summarised below so this
file stands on its own.

## Decisions

| Topic | Decision |
|---|---|
| Where racers solve | On the guest page, each on a private grid. Nobody needs a subscription or the extension; the real site is only the source of the puzzle and answers. |
| Who holds the answers | Only the host's extension. Racers send their letters to the host, which checks them. Answers reach racers only once the race is over. |
| Host's views | A full-page **race view** (extension page) with every racer's live board, **% correct**, time and place, plus the lobby controls. The host's own racing window is a normal racer view. |
| What racers see | Their own grid and timer, and the others' **% filled** (lobby setting, on by default). Never % correct: that would work as an answer checker. |
| Full but wrong grid | "Not quite — keep going", no hint where. Lobby setting: optional time penalty with a cooldown (see Lobby settings). |
| After the race | Everyone sees a correct solution — the winner's board, or the answer grid if nobody finished — and then every player's final board. |
| Late joiners | Allowed: they start with an empty grid and the race clock already running. |
| Timing | One clock, the host's. |

## What carries over from co-op

| Reused as is | Not used in a race |
|---|---|
| Firefox extension: background hub, PeerJS session, sidebar ([extension/src](extension/src)) | Overlay on the host's real crossword |
| Guest page on GitHub Pages, join screen with name + colour wheel ([guest/src](guest/src)) | Suggestions, accept/reject/undo |
| Site adapters that read the grid and clues ([extension/src/content](extension/src/content)) | Typing into the real site |
| Puzzle model and numbering ([shared/puzzle.ts](shared/puzzle.ts)) | |
| Message validation, rejoining as the same player via a stored client id ([shared/protocol.ts](shared/protocol.ts)) | |

## How a race goes

1. The host opens a crossword on Crosshare or Courier Mail.
2. In the sidebar the host switches to **Race** and opens the **race view** (a full page). It shows the lobby link,
   the lobby settings, the players who've joined, and whether the answers were found ("Answers: 169 squares ✓").
   If they weren't, racing isn't available for that puzzle (see Answers).
3. Players open the link, pick a name and colour, and wait in the lobby, seeing who else has joined.
4. The host presses **Start**. Everyone sees a 3-2-1 countdown, then the puzzle appears for everyone at once.
5. Each racer fills in their own grid. Nobody else sees their letters, except the host on the race view.
6. When a racer's grid is full and correct they're **finished**: their time and place are shown. If it's full but
   wrong they get "Not quite — keep going".
7. The race ends when everyone has finished, or when the host ends it. Everyone sees the results.

## Lobby settings

Set by the host on the race view before starting; sent to racers with the room state.

| Setting | Default | |
|---|---|---|
| Show others' progress | On | Racers see a "% filled" bar for each other racer. |
| Wrong-grid penalty | Off, 30 s when on | Adds N seconds to a racer's time for a wrong grid, with an N-second cooldown (see below). |

**Checking and the penalty.** A racer's grid is checked whenever one of their changes leaves it full (no Submit button).
- Correct → finished, immediately, cooldown or not.
- Wrong → "Not quite — keep going", every time.
- With the penalty on, a wrong check also adds N seconds, unless a penalty was given in the last N seconds. Quick fixes
  during the cooldown are free.
- A penalty only ever follows a change: sitting and thinking with a full, wrong grid isn't penalised when the cooldown
  runs out, only the next wrong change is.
- Racers see "Not quite — +30 s" when a penalty is added and a countdown to when they can be penalised again; the race
  view and the results show each racer's penalties.
- Known loophole, accepted: during a cooldown someone can cycle a doubtful square through letters for free. It's still
  stricter than playing with the penalty off, where every check is free.

## Answers

Confirmed 2026-10-03:

| | Crosshare | PuzzleMe (Courier Mail's player) |
|---|---|---|
| Where | Page JSON `#__NEXT_DATA__` → `props.pageProps.puzzle.grid`: one string per cell, `.` for blocks | `window.puzzleEnv.rawc` in the PuzzleMe iframe: the whole puzzle, scrambled |
| Reading it | Plain JSON. It goes stale after in-app navigation, so fetch a fresh copy of the page (`fetch(location.href)`, same origin) | Unscramble, then JSON. `box` is the solution, column-major (`box[col][row]`, `"\u0000"` = block); `placedWords[].originalTerm` is each answer, `wordLens` its word lengths |
| Status | ✅ (seen on several puzzles) | ✅ Vox (9×9: decoded in 24 ms, all 71 squares). ⏳ Courier Mail, to check while logged in |
| Extras | `alternateSolutions` (rare; accept them too) | `contestModeEnabled`: contest puzzles may leave answers out |

**Unscrambling PuzzleMe.** The scrambled text is Base64 JSON with successive chunks reversed, the chunk lengths
cycling through an unknown 7-number key (each 2–20). xword-dl finds the key with a pruned search; a JavaScript port
of it worked first time (spike: `pm_decode.mjs` in the scratchpad, brought into the repo in step 0). It comes from
[kotwords](https://github.com/jpd236/kotwords) (Apache-2.0) via [xword-dl](https://github.com/thisisparker/xword-dl),
so keep the attribution. Amuse Labs changes the scheme now and then (xword-dl has had to adapt), so this is the most
fragile part of race mode; the end-to-end test against Vox will catch a break.

**Reading page variables from the extension.** Content scripts can't see page JavaScript variables directly; in Firefox
they can through `window.wrappedJSObject.puzzleEnv.rawc`.

**If answers can't be found** (scheme changed, contest puzzle): race mode says so and stays off for that puzzle.
A possible later fallback is "reveal and read": the host uses the site's own Reveal and the extension reads the
filled grid. It works on any site with Reveal, but marks the puzzle as revealed in the host's account and shows the
host the answers.

## Checking, progress and timing

- Each racer's page sends its letters to the host whenever they change (debounced ~300 ms; a few hundred bytes).
- The host works out, per racer: squares filled, squares correct, each square's status (empty / right / wrong, for
  the race view), and whether they've finished.
- **One clock.** The host times everything: the race starts when it sends "go", and a racer's time is when their
  correct grid arrives, plus any penalties. Network delay (tens of ms) is the same for everyone and fine among friends.
- **Countdown.** The host sends the puzzle (without answers) with "starting in 3 s"; pages show 3-2-1 locally and
  reveal the grid at zero, so it appears instantly. Someone determined could read the clues in devtools during those
  3 seconds; not worth guarding against among friends.
- **Rejoining.** The host keeps each racer's letters by client id, so a racer who refreshes or drops out gets their
  grid back and carries on. Their clock keeps running.
- **Late joiners** get the puzzle straight away with an empty grid; their time counts from the race start like everyone's.

## The host

- **Sidebar, Race mode:** a switch between Co-op and Race, a button to open the race view, and a one-line status.
- **Race view** (a full-page extension page, opened from the sidebar in its own tab or window):
  - *Lobby:* link + Copy, settings, players, answer status, **Start**.
  - *Racing:* one live board per racer (their letters, wrong ones marked), with % correct, % filled, time and place;
    **End race**.
  - *Results:* places and times, the solution board, every racer's final board.
  - It's the host's own page inside the extension, so it gets everything straight from the background page and needs
    no network connection of its own.
- **Play:** opens the race page in a new window, joined as the host (own client id; join form prefilled with the
  host's name and colour). To the hub it's just another racer over WebRTC, so it needs no special code and never has
  the answers. It shows % filled like any racer.
- **Honour system while racing:** the race view shows everyone's letters and which are right, and the crossword site
  tab shows the puzzle with the site's own Check/Reveal. A host who races shouldn't look at either.

## The racer's page

- **Lobby:** who's joined (names and colours), "Waiting for the host to start".
- **Countdown:** 3-2-1 over a blank grid.
- **Racing:** the same grid and clue lists as co-op (keyboard, clicking, highlighting), but typing goes straight into
  your own grid: no drafts, no suggestions, no corner letters. A timer, and the others' % filled if the host allows it.
  "Not quite" (and any penalty, with its cooldown) when a full grid is wrong.
- **Finished:** your time and place, and how others are doing.
- **Results:** places and times; the solution (the winner's board, or the answer grid if nobody finished); then every
  player's final board.

## Protocol additions

Sketch; final names in [shared/protocol.ts](shared/protocol.ts).

- Room state gains `mode: 'coop' | 'race'` and a `race` section: `phase` (`lobby` → `countdown` → `racing` → `done`),
  `settings`, and per racer `filled`, `total`, `finishedMs`, `penaltyMs`, `cooldownUntil`, `place`. Racers never get `correct`.
- Host → racer: `race-start` (puzzle without answers + ms until go; also sent to late joiners), `not-quite`,
  `race-results` (places, times, the solution board, every racer's final letters).
- Racer → host: `race-letters` (their whole grid). Validated like the other guest messages.
- Background → race view (extension messaging, not the network): everything, including each racer's letters and
  per-square status.

## Code structure

- `shared/race.ts`: pure functions — progress, per-square status, solved check (with alternate solutions), places,
  penalties and cooldowns — unit tested. The cooldown uses the host's clock like all other timing.
- Adapters gain `readAnswers(): string[] | null`: Crosshare from a fresh page fetch, PuzzleMe by unscrambling `rawc`
  (`shared/rawc.ts`); turning each site's data into answer grids and checking they fit the puzzle on screen in
  `shared/answers.ts`. Both unit tested with made-up data (no real puzzles in the repo).
- Background: the race phases, per-racer letters, timing. Co-op logic stays as it is.
- The grid and clue lists in [guest/src/Board.tsx](guest/src/Board.tsx) move into `shared/` (with their CSS) so the
  guest page and the race view both use them, like [shared/ColorPicker.tsx](shared/ColorPicker.tsx). Co-op and race
  differ only in what typing does; the race view shows small read-only boards.
- New extension page `race.html` / `race.tsx` for the race view; the sidebar gets the Co-op / Race switch.

## Build steps

| Step | What | Done when | Status |
|---|---|---|---|
| 0. Answers | Answer readers in both adapters; the sidebar shows "Answers: N squares ✓" | Works on Crosshare and Vox (e2e); the host confirms it on Courier Mail | ✅ Crosshare + Vox (e2e) and Courier Mail (host, via `npm run firefox`), 2026-10-03 |
| 1. Race logic | `shared/race.ts` + tests | Unit tests pass | ✅ |
| 2. Shared grid | Move the grid and clue lists into `shared/` | Co-op e2e still passes | ✅ |
| 3. Hub + race view | Race phases, lobby + settings, Start/End, live boards with % correct, results | Racers in the lobby show on the race view; Start runs a countdown | |
| 4. Racer's page | Lobby, countdown, racing, others' % filled, not-quite / penalty + cooldown, finished, results | A full race works end to end | |
| 5. Host plays | Play button and window | The host can race alongside guests | |
| 6. End-to-end test | Host + 2 racers on Crosshare and Vox: correct finish, wrong grid, penalty and cooldown, late join, rejoin, places, results | `npm run e2e` passes | |
| 7. Ship | Docs, version bump, merge to `main`, deploy, sign | Used in a real race | |

## Branching

Work on the `race-mode` branch and merge into `main` when step 6 passes. `main` is what's live: pushing to it
redeploys the guest page your friends use, and it's what the signed extension was built from. Keeping race mode on a
branch means co-op keeps working for real sessions while race mode is half-built.

The catch: only `main` deploys, so friends can't try race mode until it's merged. Until then it's tested locally
(`npm run e2e`, or `npm run firefox` plus `npm run dev:guest`).
