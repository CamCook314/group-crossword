# Race Mode — Plan

An alternative game mode. The host opens a crossword as usual and creates a **lobby**; friends join from a link;
the host starts a countdown and everyone races to finish the same puzzle, each on their own private copy. The host
sees everyone's progress live and can also race in a separate window.

This builds on the co-op app described in [PLAN.md](PLAN.md). The parts that matter here are summarised below so this
file stands on its own.

## What carries over from co-op

| Reused as is | Not used in a race |
|---|---|
| Firefox extension: background hub, PeerJS session, sidebar ([extension/src](extension/src)) | Overlay on the host's real crossword |
| Guest page on GitHub Pages, join screen with name + colour wheel ([guest/src](guest/src)) | Suggestions, accept/reject/undo |
| Site adapters that read the grid and clues ([extension/src/content](extension/src/content)) | Typing into the real site |
| Puzzle model and numbering ([shared/puzzle.ts](shared/puzzle.ts)) | |
| Message validation, rejoining as the same player via a stored client id ([shared/protocol.ts](shared/protocol.ts)) | |

The real site is only the **source** of the puzzle and its answers. Racers never need a subscription or the extension.

## How a race goes

1. The host opens a crossword on Crosshare or Courier Mail.
2. In the sidebar the host switches to **Race**, creates a lobby and copies the link. The sidebar confirms the answers
   were found ("Answers: 169 squares ✓"); if not, racing isn't available for that puzzle (see Answers).
3. Players open the link, pick a name and colour, and wait in the lobby, seeing who else has joined.
4. The host presses **Start**. Everyone sees a 3-2-1 countdown, then the puzzle appears for everyone at once.
5. Each racer fills in their own grid. Nobody sees anyone else's letters.
6. When a racer's grid is full and correct they're **finished**: their time and place are shown. If it's full but
   wrong, they get "Not quite — keep going" with no hint where.
7. The race ends when everyone has finished, or when the host ends it. Everyone sees the results.

The host can follow it all in the sidebar, and press **Play** to open their own racing window.

## Answers

Confirmed 2026-10-03:

| | Crosshare | PuzzleMe (Courier Mail's player) |
|---|---|---|
| Where | Page JSON `#__NEXT_DATA__` → `props.pageProps.puzzle.grid`: one string per cell, `.` for blocks | `window.puzzleEnv.rawc` in the PuzzleMe iframe: the whole puzzle, scrambled |
| Reading it | Plain JSON. It goes stale after in-app navigation, so fetch a fresh copy of the page (`fetch(location.href)`, same origin) | Unscramble, then JSON. `box` is the solution, column-major (`box[col][row]`, `"\u0000"` = block); `placedWords[].originalTerm` is each answer, `wordLens` its word lengths |
| Status | ✅ (seen on several puzzles) | ✅ Vox (9×9: decoded in 24 ms, all 71 squares). ⏳ Courier Mail, to check while logged in |
| Extras | `alternateSolutions` (rare; accept them too) | `contestModeEnabled` — contest puzzles may leave answers out |

**Unscrambling PuzzleMe.** The scrambled text is Base64 JSON with successive chunks reversed, the chunk lengths
cycling through an unknown 7-number key (each 2–20). xword-dl finds the key with a pruned search; a JavaScript port
of it worked first time (spike: `pm_decode.mjs` in the scratchpad, to be brought into the repo in step 0). It comes from
[kotwords](https://github.com/jpd236/kotwords) (Apache-2.0) via [xword-dl](https://github.com/thisisparker/xword-dl),
so keep the attribution. Amuse Labs changes the scheme now and then (xword-dl has had to adapt), so this is the most
fragile part of race mode; the end-to-end test against Vox will catch a break.

**Reading page variables from the extension.** Content scripts can't see page JavaScript variables directly; in Firefox
they can through `window.wrappedJSObject.puzzleEnv.rawc`.

**If answers can't be found** (scheme changed, contest puzzle): race mode says so and stays off for that puzzle.
A possible later fallback is "reveal and read": the host uses the site's own Reveal and the extension reads the
filled grid. It works on any site with Reveal, but marks the puzzle as revealed in the host's account and shows the
host the answers.

**Who holds the answers.** Only the host's extension. Racers send their letters to the host, and the host checks them.
The answers are never sent to any guest page, including the host's own racing window.

## Checking, progress and timing

- Each racer's page sends its letters to the host whenever they change (debounced ~300 ms; a few hundred bytes).
- The host works out, per racer: squares filled, squares correct, and whether they've finished.
- **One clock.** The host times everything: the race starts when it sends "go", and a racer's time is when their
  correct grid arrives. Network delay (tens of ms) is the same for everyone and fine among friends.
- **Countdown.** The host sends the puzzle (without answers) with "starting in 3 s"; pages show 3-2-1 locally and
  reveal the grid at zero, so it appears instantly. Someone determined could read the clues in devtools during those
  3 seconds; not worth guarding against among friends.
- **Rejoining.** The host keeps each racer's letters by client id, so a racer who refreshes or drops out gets their
  grid back and carries on. Their clock keeps running.
- **Leaking answers through progress.** A live "% correct" works as a free checker for whoever can see it (type a
  letter, watch the number). So racers should only ever see "% filled" for others; see open questions for the host's view.

## The host

- **Sidebar, Race mode:** the lobby link, players, answer status and Start; during the race, one row per racer with a
  progress bar, time and place, plus End race; afterwards, the results. A sidebar comfortably fits the usual 3–4 racers.
- **Play:** opens the race page in a new window, joined as the host (own client id, the host's name and colour).
  To the hub it's just another racer over WebRTC, so it needs no special code, and it never has the answers.
  If the host races, they shouldn't look at the crossword site tab: it shows the same puzzle, and the site's own
  Check/Reveal would be cheating.

## The racer's page

- **Lobby:** who's joined (names and colours), "Waiting for the host to start".
- **Countdown:** 3-2-1 over a blank grid.
- **Racing:** the same grid and clue lists as co-op (keyboard, clicking, highlighting), but typing goes straight into
  your own grid: no drafts, no suggestions, no corner letters. A timer at the top.
- **Finished:** your time and place, and how others are doing.
- **Results:** times and places for everyone.

## Protocol additions

Sketch; final names in [shared/protocol.ts](shared/protocol.ts).

- Room state gains `mode: 'coop' | 'race'` and a `race` section: `phase` (`lobby` → `countdown` → `racing` → `done`),
  per racer `filled`, `total`, `finishedMs`, `place`, and (see open questions) `correct`.
- Host → racer: `race-start` (puzzle without answers + ms until go), `not-quite` (full but wrong).
- Racer → host: `race-letters` (their whole grid). Validated like the other guest messages.

## Code structure

- `shared/race.ts`: pure functions — progress, solved check (with alternate solutions), places — unit tested.
- Adapters gain `readAnswers(): string[] | null`: Crosshare from a fresh page fetch, PuzzleMe by unscrambling `rawc`
  (`shared/rawc.ts` or in the PuzzleMe adapter, with its own unit test on a saved sample).
- Background: the race phases, per-racer letters, timing. Co-op logic stays as it is.
- Sidebar: a Co-op / Race switch and the race panel.
- Guest page: the race screens. The grid, clue lists and keyboard handling in [guest/src/Board.tsx](guest/src/Board.tsx)
  get split out so co-op and race share them; only what typing does differs.

## Build steps

| Step | What | Done when |
|---|---|---|
| 0. Answers | Answer readers in both adapters; the sidebar shows "Answers: N squares ✓" | Works on Crosshare and Vox (e2e); the host confirms it on Courier Mail |
| 1. Race logic | `shared/race.ts` + tests | Unit tests pass |
| 2. Hub + sidebar | Race phases, lobby, Start/End, progress rows, results | Racers in the lobby show in the sidebar; Start runs a countdown |
| 3. Racer's page | Lobby, countdown, racing, not-quite, finished, results | A full race works end to end |
| 4. Host plays | Play button and window | The host can race alongside guests |
| 5. End-to-end test | Host + 2 racers on Crosshare and Vox: correct finish, wrong grid, rejoin, places and times | `npm run e2e` passes |
| 6. Ship | Docs, version bump, merge to `main`, deploy, sign | Used in a real race |

## Branching

Work on a `race-mode` branch and merge into `main` when step 5 passes. `main` is what's live: pushing to it redeploys
the guest page your friends use, and it's what the signed extension was built from. Keeping race mode on a branch means
co-op keeps working for real sessions while race mode is half-built.

The catch: only `main` deploys, so friends can't try race mode until it's merged. Until then it's tested locally
(`npm run e2e`, or `npm run firefox` plus `npm run dev:guest`).

## Open questions

1. **Host's live view:** "% filled" or "% correct"? Correct is far more interesting to watch, but if the host is also
   racing it lets them check their own grid. Suggestion: show correct only while the host isn't racing.
2. **Racers seeing each other:** should racers see the others' progress bars ("% filled") while racing, or only once
   they've finished? Suggestion: always, for the race feel.
3. **After the race:** show everyone the solution and/or each other's final grids?
4. **Mistakes:** is "Not quite — keep going" enough, or do you want something like a time penalty for a full-but-wrong grid?
5. **Late joiners:** can someone join a race already in progress (starting from zero, clock already running)?
