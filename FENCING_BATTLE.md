# Fencing and Battle — Plan

Two competitive modes from [Down for a Cross](https://downforacross.com) (DFAC), the open-source shared-crossword
site, and how each could work here.

- **Fencing:** everyone plays on the same puzzle and scores for the squares they get right first. Each team starts
  seeing only the clues near its own corner and unlocks more as it scores.
- **Battle:** each team solves its own copy. Power-ups lie on the grid; a team picks one up by finishing an answer
  through it and uses it on the other team. First team to finish wins.

This builds on the co-op app ([PLAN.md](PLAN.md)) and race mode ([RACE_MODE.md](RACE_MODE.md)).

DFAC source was read at `HEAD` of https://github.com/downforacross/downforacross.com on 2026-10-03, along with issue
[#172](https://github.com/downforacross/downforacross.com/issues/172). Paths in sections 1 and 2 are relative to that repo.

## Summary

| | Fencing on DFAC | Battle on DFAC |
|---|---|---|
| Status | Live at `/fencing`, still maintained (last changes 2025) | Beta at `/beta/battle`, a 2019 "v0" untouched since apart from lint fixes |
| Sides | 2 teams, plus spectators | 2 teams |
| Grids | One puzzle. Each team has its own grid; squares claimed by either team appear in both | Two separate ordinary games, one per team |
| What you do | Type letters. Every letter is checked as you type it | Solve normally, with Check and Reveal available |
| Score | +1 per square your team gets right first | None. First team to solve wins |
| Ends | When every square is claimed. Most squares wins | When one team has solved it |
| Extras | Fog of war: you start with ~10 clues near your corner and unlock more by scoring | Power-ups picked up on the grid and used on the other team |

## 1. Fencing as Down for a Cross does it

### How it's built

Fencing is event-sourced. Every action is an event (`src/shared/fencingGameEvents/eventDefs/*.ts`). The server stamps
each event with its own time and relays it to everyone (`server/SocketManager.ts`) without checking anything. Each
browser replays all the events through `gameReducer.ts` to get the game state. So every player's browser holds the
solution and both teams' grids, and only the UI keeps them out of sight. (Here, by contrast, the host holds the answers
and is the only judge.)

### Setup and teams

- The home page has a Variants switch, Normal or Fencing, with a short info popup ("Quickly fill in cells correctly
  before the other team to unlock more clues and explore the grid"; `src/components/WelcomeVariantsControl.tsx`).
  Fencing shows the puzzle list at `/fencing`; picking a puzzle opens `/beta/play/<pid>?fencing=1`, which creates the
  game and redirects to `/fencing/<gid>` (`src/components/PuzzleList/Entry.tsx`, `src/pages/Play.js`). A normal game's
  chat header also links to its fencing version: "Join Fencing (N joined)", or a near-invisible "X" when nobody has
  joined (`src/components/Chat/Chat.js`).
- Teams are ids 1 and 2 (`constants.ts`), by default "Team 1" in orange and "Team 2" in purple (`initialState.ts`).
  Team 0 means spectator.
- A newcomer gets a random name and goes on the team with fewer players, with the cursor on that team's starting
  square (`src/components/Fencing/Fencing.tsx`). Players can rename themselves and their own team, leave their team
  to spectate, and join a team (`FencingScoreboard.tsx`). `updateTeamId.ts` allows switching teams at any time, even
  mid-game.
- Anyone can press **Start Game (wait for everyone to join!)**. The grid appears after a 5-second countdown on the
  server's clock (`FencingCountdown.tsx`, `startGame.ts`).

### Starting clues (fog of war)

From `eventDefs/create.ts`:

- Each team has an origin corner (`getOrigin`): team 1 starts **bottom-left** and team 2 **top-right**.
- All white squares are sorted by distance from that corner: rows × 1.0001 + columns (`getSortedWhiteCells`). The
  1.0001 breaks ties the same way for both teams on a grid with 180° symmetry, so the two starts mirror each other.
- Going down that list, each square's across and down clues become visible, until at least `MIN_CLUES = 10` clues
  are visible (across and down counted together).
- The team's cursor starts on the nearest white square to its corner (`getStartingCursorPosition`).

What a player sees (`transformGameToPlayerProps.ts`, `src/components/Grid/Cell.tsx`,
`src/components/Player/Clues.js`):
- Hidden clues are left out of the clue lists completely.
- A square whose across and down clues are both hidden is drawn grey, with no number or letter, and can't be clicked.
- Spectators see every clue and the shared grid.

### Playing: every letter is a guess

- Typing a letter sends `updateCell`, then 10 ms later a `check` of that square (`usePlayerActions.ts`). There is no
  Check button: every letter typed is checked straight away. Deleting a letter isn't checked.
- `updateCell.ts` writes into your team's grid. Claimed squares can't be changed. Its comment says the square must also
  be visible to your team, but the code doesn't check this (fogged squares just can't be clicked).
- **Right letter** (`check.ts`):
  - the square is claimed in every team's grid: the letter is filled in, marked correct, and gets a small dot for the
    claiming team, salmon for team 1 and purple for team 2 (`solvedBy`, drawn in `Cell.tsx`);
  - the checking team, and only that team, gets the square's across and down clues unlocked;
  - +1 score to the player and to their team.
- **Wrong letter:** the square is marked wrong (red) in your team's grid only, and the team's `guesses` and the
  player's `misses` go up by one. That's the only cost, so cycling a square through the alphabet works.
- A square claimed by the other team overwrites whatever your team had typed there. If it's in your fog, it stays
  hidden from you.
- If both teams check the same square at once, the server's order decides. The second check finds the square already
  claimed and does nothing.
- **Reveal Cell** (`FencingToolbar.tsx`, `reveal.ts`) reveals the square under your cursor with exactly the effects of a
  right guess, **including +1 score**. Nothing limits it.
- You can see every player's cursor, opponents included, on squares you can see.
- A chat panel sits beside the grid ("for taunting the other players", per the issue), with the scoreboard above it.

### Scoreboard

`FencingScoreboard.tsx` shows a table of Player, Score and Guesses: each team (name in its colour, score, wrong guesses),
then its players (score, misses), then spectators. Despite the heading, **Guesses counts only wrong guesses**.

### End and winner

- The game is over when every white square is claimed (`isGameComplete` in `Fencing.tsx`, worked out in each browser).
  There's no time limit and no early finish. `gameReducer.ts` only applies events; nothing in it ends a game.
- Then every clue is shown to everyone (`revealAllClues.ts`), everyone gets confetti, and the team or teams with the
  highest score get "🏆 Winner!" or "🤝 Tie!" on the scoreboard.
- Points always add up to the number of squares, reveals included.

### Planned extras (issue #172, still open)

| Item from the issue | In the code now? |
|---|---|
| Team rows coloured on the scoreboard; score and guess tallies | Yes |
| Chat for taunting | Yes |
| Win indicator; confetti on a win | Yes (#346, #350, 2025). The confetti is plain and shown to everyone, not in the winning team's colour |
| Team names "Team Purple" / "Team Orange" instead of 1 / 2 | No. Names are editable but default to "Team 1" / "Team 2" |
| Mobile layout | No |
| Game updates in the chat ("X joins Team Purple", "Team Purple wins") | No |
| What to do with clues that refer to other clues | No |
| Tutorial explaining how to play and how to win | Only the short info popup on the Variants switch |
| **Lockouts:** a wrong guess locks you out of typing for 5 s. **"Chaotic mode":** if the other team then guesses wrong, they're locked and you're unlocked, so only one team is ever locked. Show lockout times on the scoreboard | No. Teams have a `lockedUntil` field (`initialState.ts`, `types/GameState.ts`) that nothing sets or reads, and `usePlayerActions.ts` has a TODO for "auto-check-on-cooldown" |
| End the game when a team has a majority of the points | No |
| Rulesets (guess/reveal timeouts and penalties), free-for-all or more teams, everyone starting in the same corner, imbalance (long across theme answers favour the left side) | Discussion only |
| Creating a fencing game from the home page; post-game replays | Creating, yes (the Variants switch). Replays, no |

## 2. Battle as Down for a Cross does it

Battle was built in January 2019 (PRs #56 "Battle mode v0" and #57) and has only had lint fixes since. It lives at
`/beta/battle/<bid>`, isn't linked from the home page, and uses DFAC's older Firebase store (`src/store/battle.js`)
wrapped around two ordinary DFAC games.

### Setup

- Created from `src/pages/Play.js` with `?mode=battle`. `Battle.initialize` (`src/store/battle.js`):
  - makes one ordinary game per team from the same puzzle (`createGameForBattle` in `src/actions.js`);
  - gives each team `STARTING_POWERUPS = 1` random power-up;
  - places `NUM_PICKUPS = 10` pickups on the grid.
- Lobby (`src/pages/Battle.js`): type a name, click **Team 1** or **Team 2**, and see who's on each team. Then **Start**
  ("This starts the game for all players"), which anyone can press. There's no countdown: everyone is sent straight to
  their team's game.

### Playing

- Each team solves **its own copy**. Within a team it's ordinary DFAC co-op (shared grid, everyone's cursors) with the
  normal toolbar: Check, Reveal and autocheck are all available, at no cost (`src/components/Game/Game.js`).
- You can't see the other team's grid. `Grid.tsx` has code to shade squares the opponent has right (`isDoneByOpponent`),
  but `Player.js` never passes the opponent's grid down, so it does nothing.
- The chat merges both teams' messages, with the other team's in a different colour (`mergeMessages` in `Chat.js`).

### Pickups

- A pickup is an emoji on a square (`getPickup` in `Grid.tsx`, `Cell.tsx`). Pickups sit on the same squares in both
  teams' grids.
- **Collecting:** a team collects a pickup by finishing, all correct, an across or down answer that runs through its
  square. After each letter typed, the typist's browser checks the two answers through that square (`checkPickups`).
  Every pickup on a finished answer goes to that team and disappears for both teams.
- **Placing:** each pickup goes on a random white square where neither crossing answer is already right in either
  team's grid (`getPossiblePickupLocations` in `src/lib/wrappers/GridWrapper.js`), with a random power-up type.
- **Respawning:** every 6 s, each player's browser adds one pickup if 3 or fewer are left (`spawnPowerups` with
  `MAX_ON_BOARD = 3`, called from `src/pages/Game.js`). So the board refills to about 4, more with several players
  online. A code comment admits that two can land on the same square.

### Power-ups

All from `src/lib/powerups.js`:

| Power-up | Icon | Lasts | Effect |
|---|---|---|---|
| **Reverse!** (`REVERSE`) | cactus_cheers | 15 s | The other team's clues are shown back to front, letter by letter |
| **Dark Mode** (`DARK_MODE`) | cactus_yorick | 30 s | The other team's letters show as 🌚 except within 3 squares (a 7×7 box) of one of their cursors |
| **De-Vowel** (`VOWELS`) | cactus_sweat | 15 s | Vowels are removed from the other team's clues |
| **Reveal Square** (`REVEAL_SQUARE`) | surprised_pikachu | Instant | Reveals the square **you** have selected, in your own grid (an ordinary DFAC reveal). It's the only one that helps you rather than hurting them |

- Power-ups appear in a POWERUPS bar under the game (`src/components/common/Powerups.js`), on desktop only. There's one
  icon per type with a count, and while one is running it shows the time left as mm:ss. Click to use.
- `usePowerup` marks it used, timed by your own clock, and always aims it at the other team (`target = 1 - team`, with
  the comment "For now use on other team").
- Each browser applies the effects as it draws: your running power-ups change how the opponent's game looks, and
  theirs change how yours looks (`apply` in `powerups.js`, used by `Game/Game.js`). Several can run at once, including
  two of the same kind.
- Durations are measured on each viewer's own clock against the user's clock at the moment of use.

### End

When a team's grid is solved, its browser writes the `winner` (team and time) unless one is already set (`setSolved`;
the code notes this isn't atomic). A "BattleBot" posts "Team N [names] won! Time taken: X seconds." in the chat
(`src/pages/Game.js`). Nothing stops the losing team: their game carries on.

## 3. How each could work here

### What we already have

| Piece | Where | Fencing uses it for | Battle uses it for |
|---|---|---|---|
| Answers held only by the host, both sites, alternate solutions | adapters' `readAnswers`, [shared/answers.ts](shared/answers.ts) | Checking claims | Checking claims for pickups, finish, and the reveal-a-letter power-up |
| Lobby, settings, 3-2-1 countdown, phases, End, New race | [app/src/host/raceHost.ts](app/src/host/raceHost.ts), [app/src/host/RaceView.tsx](app/src/host/RaceView.tsx), [app/src/Race.tsx](app/src/Race.tsx) | The same | The same |
| Private grid per player, sent to the host on change, restored on rejoin | `race-letters` in [shared/protocol.ts](shared/protocol.ts), `RaceHost.join` | Each player's drafts | The whole game, unchanged |
| Checking and penalties | [shared/race.ts](shared/race.ts): `closest`, `isSolved`, penalty with cooldown | Checking one answer; the lockout works like the cooldown | Finishing, unchanged |
| One clock (the host's), times sent as "ms as of now" | `clockMs` in `RaceState` | Lockouts | Power-up durations |
| Places, `formatTime`, `ordinal` | `shared/race.ts` | Places by score | Unchanged |
| Results and replays | [shared/replay.ts](shared/replay.ts) (events: when, which board, who, which squares) | One shared board, with each claim recorded by its claimer | Each racer's board, plus power-up events |
| Grid, clue lists, keyboard | [shared/Crossword.tsx](shared/Crossword.tsx) | Enter claims the answer the cursor is in | Unchanged |
| Linked answers ("See 13"), clue references, enumerations | `links`, `refs`, `answerOf`, `wordBreaks` in [shared/puzzle.ts](shared/puzzle.ts); `parseEnumeration` in [shared/clues.ts](shared/clues.ts) | A linked answer is claimed as one; references unlock together | The hide-the-lengths power-up |
| Names, colours, rejoining as the same player | co-op | Claims shown in the claimer's colour | Unchanged |
| Host's full-page view; host plays from a Play window | race view | Shared board, everyone's drafts, scores | Every board, plus effects |

Not used by either: the overlay on the real site, suggestions, typing into the site, and chat (we use Discord).

### Fencing here

The core idea transfers well: one shared puzzle, and whoever gets an answer first gets the points and shows the letters
to everyone. A few changes make it suit cryptics and a group of 2–4.

| | DFAC | Here (suggested) | Why |
|---|---|---|---|
| Sides | 2 teams sharing a grid each | **Free-for-all:** each player is a side. Teams can come later | 3 players can't split evenly. Free-for-all reuses race mode's private grids as they are |
| What you claim | One square, checked as you type | **A whole answer**, when you press Enter | See below |
| Points | +1 per square | **+1 per square your claim fills in for the first time** | A long fresh answer is worth a lot; finishing one that's mostly filled in by crossers is worth little |
| Wrong | A tally only | **Locked out of claiming for N s** (default 10), plus a tally | Typing stays free; guessing costs time |
| Clue visibility | ~10 clues nearest your corner; scoring unlocks more | **v1: every clue visible.** Fog of war as a later lobby setting | Simpler first; fog needs retuning for cryptics (see below) |
| Others' claims | Fill your grid, dot in the team's colour | The same, in the claimer's colour | They help everyone. That's the fun |
| Linked answers | Unresolved | One claim covers every entry of the answer | The puzzle model already knows them |
| Start | Anyone presses Start; 5 s countdown | Host's lobby and 3-2-1, as in race mode | Already built |
| End | Every square claimed; most wins | Every square claimed, or the host ends it. Most points wins; equal scores share a place | Cryptics often leave one stubborn clue |
| Reveal | Free, and scores +1 | None | A loophole |
| Others' cursors | Visible | Hidden | Where someone is working is a hint |

**Why whole answers.** Checking one letter of a cryptic gives a lot away: a confirmed first letter often cracks the
wordplay, and with free checks a stuck player can cycle a square through the alphabet. Cryptics are also solved an
answer at a time; you rarely know one letter without the rest. A whole-answer claim is a deliberate act, so a lockout
for a wrong one feels fair, and it makes brute force pointless except on answers that are nearly filled in, which
are worth little under this scoring.

**Claiming.** Type your answer privately (nobody sees drafts), then press Enter: the claim is the answer the cursor is
in. Squares already claimed are filled in and locked; you type the rest. The host checks it:
- **Right:** the letters go into everyone's grid in your colour, and you score one point per square that wasn't
  already claimed. "Got it: +7."
- **Wrong:** "Not it", and you can't claim anything for N seconds (typing still works). Your miss count goes up. Your
  guess isn't shown to anyone.
- **Already claimed** (someone beat you to it by a moment): "Too late, Ana got it". No penalty.
- **Locked out:** ignored, with the countdown shown.

An answer whose squares all get filled by crossing claims is complete and scores for nobody. Points therefore always add
up to the number of squares, as on DFAC, so "can't be caught" is easy to show: the leader has more points than the
runner-up plus the squares still unclaimed.

**Wrong-claim alternatives.** A points penalty (−2) also works but can push scores negative and discourages having a go.
DFAC's planned "chaotic mode" (lockouts that pass from one team to the other) suits two fast teams more than four people
taking minutes per clue. A lockout is the simplest to explain and matches race mode's cooldown.

**Linked and referring clues.** A linked answer ("14 Across: … (5,7)" with "20 Across: See 14") is one claim covering
all its entries, scored on all its new squares, via `answerOf`. A clue that mentions another ("Partner of 4 Down") needs
that answer to be solvable, so under fog the clues it refers to (`refs`) unlock with it. That answers DFAC's open
question about referring clues.

**Fog of war (step two, as a lobby setting).** DFAC's 10 starting clues are about an eighth of an American 15×15 (~76
clues) but a third of a 15×15 cryptic (~28–32 clues), and four corners × 10 would show every clue. Suggested rules:
- **Starting clues per player: about 5** (a setting). Two players start bottom-left and top-right as on DFAC; four take
  a corner each. Use DFAC's method: sort the white squares by distance from your corner and add the clues through them
  until you have enough. It copes with cryptic grids' unchecked squares, which belong to only one clue.
- **A right claim unlocks**, for the claimer only, every clue crossing the answer and every clue those refer to. DFAC
  unlocks the two clues through one square; a whole answer crosses several. Other players still get the letters, but in
  squares that are fogged for them the letters stay hidden.
- **Nobody gets stuck:** cryptic clues take minutes, and if all your visible clues are hard you'd be stuck for good. If
  you claim nothing for 2 minutes, the hidden clue nearest your corner unlocks for you (a setting).
- **Hidden clue text must stay off the player's machine**, not just off their screen. Today every guest gets the same
  room state with every clue's text in it. With fog, each player needs their own copy with the hidden clues blanked.

**Fairness.**
- Network delay decides near-ties between claims. Among friends that's tens of milliseconds, the same for everyone. The
  host's Play window connects over WebRTC like any guest, so the host has no edge.
- Corners are only fair on symmetric grids. Opposite corners match on the 180°-symmetric grids most cryptics use, so 2
  or 4 players are fine. With 3, one corner is left empty and the starts aren't equal. Options: everyone starts with the
  same clues and unlocks diverge from there, or simply play without fog.
- The host's view shows everyone's drafts; a host who plays shouldn't look, as in race mode.

**What players see.** Their grid: claimed letters tinted in the claimer's colour, their own drafts, and grey fog if it's
on. The clue list: claimed clues ticked in the claimer's colour; hidden clues as a grey "Hidden" line. A scoreboard of
points, answers claimed and misses, and who is locked out. The timer, and their own lockout countdown. Results:
places by points, each player's claims, the solution, and the replay.

### Battle here

Battle maps onto race mode almost directly: everyone races on a private copy and the first to finish wins. Battle adds
pickups and power-ups, so it's best as a **race lobby setting ("Power-ups")** rather than a new mode.

- **Sides:** free-for-all, like a race. DFAC's 2v2 needs a grid shared within each team, which race mode doesn't have.
- **Finishing:** unchanged from race mode: a full, correct grid, with the optional penalty and cooldown.
- **Starting power-ups:** one random power-up each, as on DFAC.
- **Pickups sit on answers** (shown on the clue and its first square), shared by everyone: **3** on the board at a time
  for a ~30-clue cryptic, at most one per answer. When one is taken, a new one appears on an answer nobody has claimed.
- **Collecting needs a claim.** You press Enter on the answer, as in Fencing. Right gets you the power-up; wrong locks
  you out of pickups for 30 s. DFAC collects automatically once the answer is right, but the host checking answers as
  you type and handing out a pickup would be an answer checker: cycle guesses in that answer until the pickup arrives.
  Race mode deliberately never tells racers what's correct. A claim reveals that one answer is right, but that's the
  reward, and the lockout makes it costly to fish. Simpler fallback: no pickups, and everyone gets a power-up every few
  minutes.
- **Targets:** with up to 3 opponents, the user picks a target by name. "The leader" by % filled is easy to game
  (fill with junk), and % filled can be hidden by a lobby setting.
- **Durations need to be much longer.** DFAC's 15–30 s is one or two clues in an American speed solve. A cryptic clue
  takes a minute or more, so 15 s barely matters. Use 45–90 s.
- **Who applies the effects:** the host keeps track of what's active on whom and for how long (host clock, sent as "ms
  left"), and the victim's page draws it. A determined friend could undo it in devtools; honour system, as with the
  countdown.

**Power-ups for cryptics:**

| Power-up | Effect on the target | Suggested length | For cryptics? |
|---|---|---|---|
| **Hide lengths** (new) | Enumerations removed from their clues, and the word breaks gone from their grid | 90 s | Strong. Word lengths and breaks are a key cryptic foothold, and we already parse them |
| **Scramble** (new; replaces Reverse) | Words of each clue shuffled | 60 s | Strong. Word order is the whole of a cryptic clue: the definition sits at one end and indicators sit next to their fodder |
| **Freeze** (new) | They can't type | 8 s | Fine. Simple, and cuts into whatever they were writing in |
| **Dark** (DFAC's Dark Mode) | Their letters hidden except in the answer they're on | 45 s | Good. Crossing letters matter even more in cryptics |
| **Reveal a letter** (DFAC's Reveal Square) | One letter of your choice, for you only, sent by the host | Instant | Good. One letter is worth a lot in a cryptic |
| **De-Vowel** (DFAC) | Vowels removed from their clues | 30 s | Harsh. You can't count anagram fodder or spot hidden words without vowels. Optional |
| **Reverse** (DFAC) | Their clues back to front, letter by letter | — | Weaker than Scramble here. Drop |
| **Jam the anagram pad** (new) | Their anagram pad ([shared/AnagramPad.tsx](shared/AnagramPad.tsx)) disabled | 90 s | Cryptic-only fun. Optional |

Starter set: Hide lengths, Scramble, Freeze, Dark, Reveal a letter.

## 4. What building each would take

### Fencing (free-for-all, whole answers, no fog)

**Protocol** (sketch; final names in [shared/protocol.ts](shared/protocol.ts)):
- `mode` gains `'fencing'`, and room state gains a `fencing` section: phase (reusing race mode's
  lobby/countdown/racing/done), settings (lockout seconds; later fog, starting clues, unlock-when-stuck), clock, and per
  player score, answers claimed, misses and lockout ms left; the claims (answer, claimer, letters, points, time); and
  the results.
- Player → host: drafts (the existing `race-letters`, for the host's view, rejoining and replays) and
  `claim { clueId, letters }`, validated like `suggest` but allowing longer answers for linked clues.
- Host → player: `claim-result { clueId, outcome: 'claimed' | 'wrong' | 'taken' | 'locked', points, lockedMs }`.

**Host logic:**
- `shared/fencing.ts`, pure and unit tested: is the claim valid (playing, not locked out, answer exists, not already
  claimed, every square filled); is it right (against any solution consistent with existing claims); points for new
  squares; lockout; answers completed by crossers; end detection; places by score; "can't be caught".
- `app/src/host/fencingHost.ts`, like `RaceHost`: phases, players by client id, the shared claimed board, drafts,
  timers, and what players may see. It's wired into `background.ts` next to the race.

**Player's page:** the shared grid component with claimed squares locked and tinted by claimer; Enter to claim; feedback
messages; lockout countdown; scoreboard; results with the replay. Most of it is `Race.tsx` with a different typing rule
and a scoreboard.

**Host's view:** a Fencing panel on the full-page view: lobby settings, the shared board, everyone's drafts (with right
and wrong marks, as in a race), scores, claim log, End, results. The sidebar's Co-op / Race switch gains Fencing.

**Testing:**
- Unit tests for `fencing.ts` and `fencingHost.ts` on made-up grids (like the 3×3 ring in `raceHost.test.ts`): right,
  wrong, taken and locked claims; points for new squares only; a linked answer; an answer completed by crossers; the
  end; and a JSON check that player state never contains answers.
- End to end (`e2e/fencing.mjs`, built from `e2e/race.mjs`): host plus 2 players on Crosshare and Vox, with answers
  taken from each site's Reveal; a right claim shows on the other player's grid; a wrong claim locks out; two
  near-simultaneous claims give one "too late"; ending and results.

**Size: medium.** Answers, the lobby, countdown, timing, shared grid, results and replays all exist. New code: claims,
scoring, the scoreboard, and a host panel.

**Risks:**
- Alternate solutions (rare, Crosshare only): a claim must agree with the solution already implied by earlier claims.
- Linked answers detected wrongly would make claims cover the wrong squares. Fall back to single entries if a link looks
  off.
- A puzzle whose last clues nobody can get: the host ends it, and results show the solution.

**Then fog (small to medium):** visibility per player (corner sort, unlocks, references, unlock-when-stuck), grey squares
and hidden clue lines, and **sending each player their own room state**, which today is one state for everyone. Late
joiners under fog need a rule; give them the clues of the emptiest corner.

**Then teams, if wanted (medium):** teammates share a live board, so the host relays a team's drafts to its members,
much as co-op relays the site's letters. Each claim scores for the team.

### Battle (a race setting)

**Protocol:**
- Race settings gain `powerups: boolean`. Race state gains the live pickups (clue id and type), each racer's held
  power-ups (sent to that racer only, or to all; see the open questions), and the effects running on each racer (type,
  who used it, ms left).
- Player → host: `use-powerup { type, target, cell? }` and `claim-pickup { clueId, letters }`.
- Host → player: `pickup-result`, and `reveal-letter { cell, letter }` to the user only. That's the only time an answer
  leaves the host mid-game: one letter, to the player who used the power-up.

**Host logic:** `shared/battle.ts`, pure: placing and refilling pickups, claiming them, inventories, effects with
expiry on the host's clock, and the effect transforms (scramble clue words, strip enumerations, hide letters), so the
page and the tests share them. `RaceHost` gains the inventory and effects.

**Player's page:** a power-up bar with counts, a target picker, pickup icons on clues and squares, each effect drawn
(scrambled or stripped clue text, word breaks hidden, dark squares, frozen keyboard), and a "Sam froze you (6 s)"
banner.

**Host's view:** effects shown on each board, and a power-up log on the results.

**Testing:** unit tests for each transform and for placement, claiming, targets and expiry; e2e: one pickup claimed and
one power-up used end to end on both sites.

**Size:** large on its own; **medium once Fencing's claims exist**, because pickups reuse them.

**Risks:**
- Fun and balance. It's random, the leader gets ganged up on, and durations need tuning to cryptic pace. Expect a few
  real sessions of adjusting.
- Effects are drawn by the victim's own page (honour system).
- Lots of small UI.
- A pickup claim confirms that answer. That's intended, but it makes Battle a little less pure as a race.

## 5. Open questions

1. **Free-for-all or teams?** Suggested: free-for-all first. It works for 2, 3 or 4 players and reuses private grids.
   Add 2v2 later if you want it.
2. **Claim whole answers or single squares?** Suggested: whole answers, with Enter. Single-letter checks give too much
   away in a cryptic.
3. **Score per new square or per answer length?** Suggested: per new square. Totals always equal the number of squares,
   and sniping a nearly filled answer is worth little.
4. **Wrong claim: lockout or points?** Suggested: a 10 s lockout from claiming (a lobby setting, 0–60 s). Typing stays
   free. Show misses on the scoreboard.
5. **Fog in the first version?** Suggested: no. Ship open Fencing, play it, then add fog as a setting with about 5
   starting clues each and unlock-when-stuck after 2 minutes.
6. **Under fog, do other players' claims unlock clues for you?** Suggested: no, only the claimer's (as on DFAC). You still
   get their letters where you can see them.
7. **Three players under fog:** corners or a shared start? Suggested: everyone starts with the same clues. Uneven corners
   feel unfair.
8. **Show the "can't be caught" moment?** Suggested: yes, as a badge ("Sam can't be caught"), but play on until the grid
   is done or the host ends it.
9. **Hidden clue text: blank it per player, or send everything and trust people?** Suggested: blank it per player. It's
   needed for fog to mean anything and is a contained change to how state is sent.
10. **Battle: pickups (claimed with Enter) or a power-up every few minutes?** Suggested: pickups, for the race to grab
    them; fall back to timed power-ups if the claim-and-lockout feels fiddly.
11. **Battle: can racers see each other's power-ups?** Suggested: show counts (how many each racer holds) but not types.
    That adds tension without giving away much.
12. **Should the host's Play window be allowed in both modes?** Suggested: yes, on the same honour system as racing (don't
    look at the host's view or the site tab).

## 6. Recommendation

Build **Fencing first**: free-for-all, whole-answer claims with Enter, one point per newly filled square, a 10-second
lockout for a wrong claim, every clue visible. It's the mode DFAC still maintains, it suits a small group solving
cryptics (every claim helps everyone, so it stays sociable), and nearly everything it needs already exists in race
mode. Add fog of war as a lobby setting once the basic game has been played a few times. Battle comes later as a race
setting ("Power-ups") with the cryptic set (Hide lengths, Scramble, Freeze, Dark, Reveal a letter), reusing Fencing's
claims for pickups.
