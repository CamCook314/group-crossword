# Expansion — Plan

Group Crossword is built around crosswords. This plans what it takes to play other puzzles the same way: sudokus
first (Courier Mail's, which use PuzzleMe, and Cracking the Cryptic's, which use SudokuPad), then a menu of other
puzzles and group games, researched for free and open-source sources.

Status (2026-10-07): **co-op sudoku from PuzzleMe is built**, along with the three games the host picked (cryptic clue
race, trivia, bracket), on top of the redesign ([redesign.md](redesign.md)). Still to do: SudokuPad (CTC and
variants), sudoku races, and Courier Mail checked by the host. See [Progress](#progress).

## What we found

Checked on 2026-10-06 (sources at the end).

**PuzzleMe sudokus (Courier Mail).** Sudokus run in the same PuzzleMe player as the crosswords
(`puzzle-type-sudoku`), with the same scrambled `rawc` data, and our existing decoder ([shared/rawc.ts](shared/rawc.ts))
reads it. On Amuse Labs' demo sudoku it gave:
- `box`: the **complete solution**, row by row;
- `preRevealIdxs`: which squares are given;
- `subgridWidth` / `subgridHeight` (box size), `isSudokuX`, and `cellInfos` (thick walls, for irregular regions).

So, as with the crosswords, every PuzzleMe sudoku can be checked on completion. PuzzleMe supports classic sudoku
(4×4 to 9×9), Sudoku X, killer sudoku (uploaded only) and KenKen. Not yet checked: how killer cages appear in the data,
how the player shows and takes digits (for reading progress and filling in at the end), and which sudokus Courier
Mail has.

**Cracking the Cryptic (SudokuPad).** Each puzzle page on crackingthecryptic.com links to SudokuPad
(`sudokupad.app/<id>`). SudokuPad is Sven Neumann's player (the one in the videos), and the same links are used by
Logic Masters Deutschland and most of the variant-sudoku community.
- SudokuPad's own page fetches puzzles from a public endpoint, `sudokupad.app/api/puzzle/<id>`, with no login.
- The data is SudokuPad's open "SCL" format: JSON, sometimes compressed (`scl…`, lz-string) and with shortened key
  names. It lists everything as drawable shapes: `cells` (givens), `regions`, `cages`, `lines`, `arrows`, `overlays`,
  `underlays`, plus the title, author and rules.
- **The solution is only sometimes included.** It's a `solution` entry of 81 digits. Of 15 puzzles sampled across
  the CTC archive, 4 had one, mostly recent ones (made in Sudoku Maker).
- SudokuPad itself isn't open source, but its format documentation and tools are (MIT and MPL-2.0), including a
  Penpa+ → SCL converter.

**Other sources worth knowing about** (details under [Other puzzles and group games](#other-puzzles-and-group-games)):
- **The Guardian's crosswords** are free, and the page embeds every answer, the setter, and whether the solution is
  available yet (Prize crosswords hold it back until the deadline).
- **Open source:** puzz.link (pzprjs, MIT) has hundreds of logic-puzzle genres with built-in answer checking; Simon
  Tatham's Portable Puzzle Collection (MIT) generates about 40 puzzle types from a seed; Penpa+ is MIT too.
- **Free data:** Lichess has 6 million chess puzzles (CC0); Open Trivia DB is CC BY-SA 4.0 with no API key; Puzzled
  Pint's team puzzle-hunt archive is CC BY-NC-SA 4.0; there's a dataset of over half a million cryptic clues.

## Progress

| Step (from Build steps below) | Status |
|---|---|
| 0. Prove it | ✅ PuzzleMe (findings below). SudokuPad still to do. |
| 1. Model | ✅ `shared/sudoku/`: model, PuzzleMe parser, clashes, a solver; unit tests on made-up puzzles |
| 2. The grid | ✅ Classic sudoku: selection, Digit / Corner / Centre, clashes, pencil marks shared on request. Variant shapes (SudokuPad) still to do. |
| 3. Co-op, PuzzleMe | ✅ `e2e/sudoku.mjs` on Amuse Labs' demo: suggest, Agree, accept, clashes, shared marks, Check, Solved, Fill in |
| 4. Co-op, SudokuPad | To do |
| 5. Race | To do (races are crosswords only for now) |
| 6. Ship | Docs updated; merging with the redesign |

The games the host picked are built too, each a mode in the host's tab that needs no puzzle or extension, and checked
end to end in `e2e/games.mjs`:
- **Cryptic clue race:** clues fetched from cryptics.georgeho.org as the game runs (its API allows browser requests;
  nothing is copied into the repo). Private guesses; 3, 2, then 1 points by order solved; the definition is underlined
  at half time, after which a solve is worth a point less; the answer, definition and a link to the solving blog's
  explanation at the reveal.
- **Trivia:** questions from Open Trivia DB (CC BY-SA 4.0), by category and difficulty; everyone answers privately and
  can change their answer until the reveal; a point for each right answer.
- **Bracket:** the host names a category; everyone puts forward an option, anonymously; a knockout bracket voted a
  match at a time (byes when the numbers are odd, a coin toss on a tie); who suggested what is shown at the end.

## Step 0 findings: PuzzleMe sudokus (2026-10-06)

Mapped in real Firefox on Amuse Labs' public demo sudokus. These are the test site, since Courier Mail blocks
automated access:
- `puzzleme.amuselabs.com/pmm/sudoku?id=al-sudoku-medium-20210109&set=demo-sudoku`, plus `…-easy-20201231` and
  `…-hard-20210109`, and a 6×6 `al-sudoku-mini-20201231` in the same set;
- `set=demo-special-sudoku` has Sudoku X (`cc9c693f`), a 6×6 killer (`0e3b27f9`), a Wordoku and a Picdoku.

(The LA Times' free PuzzleMe sudokus only load embedded on latimes.com, behind ads and sign-up prompts, so they make
a poor test site.)

- **The player is built like the crossword one:** `.crossword.sudoku > .box` squares with `.endRow` after each row;
  the digit in `.letter-in-box`; givens have `prerevealed-box`; thick walls are `box-right-wall` /
  `box-bottom-wall`; pencil marks are `.pencil-box` elements (`invisible` when unset). The crossword content script's
  grid reading works unchanged.
- **Typing:** select a square with `mousedown` + `mouseup` (as for crosswords), then a `keydown` with the digit on
  `input.dummy`. Unlike crosswords, the `input` event does nothing. `Delete` clears.
- **Data:** `rawc` decodes with our decoder and gives `w`, `h`, `box` (the solution), `preRevealIdxs` (givens),
  `subgridWidth` / `subgridHeight`, `isSudokuX` and `alphabets`. The existing PuzzleMe answer reader returns the
  solution as is; only the check that answers fit the puzzle expects letters.
- To confirm on Courier Mail itself: the same, while logged in.

## Decisions

The host's answers (2026-10-06) are marked ✅; the rest are proposals.

| Topic | Decision |
|---|---|
| Where it's played | As with crosswords: everyone plays in our tool. The host opens the puzzle in Firefox, and the site supplies the puzzle (and solution, when it has one). The solved grid is filled in on the site at the end. |
| First source | ✅ Courier Mail. It only has classic sudokus, in the same PuzzleMe frame as its crosswords, and the solution is always in the data. Then SudokuPad, for CTC and variants. |
| Getting a SudokuPad puzzle | ✅ The host opens the SudokuPad link in Firefox and the full view takes it from there, as with crosswords (rather than pasting the link). Whichever way of reading the puzzle is easier and safer: SudokuPad's own decoded copy, or its API. Decided in step 0. |
| Digits | 1–9 in 9×9 grids. Other sizes (4×4 to 16×16, 0–9, letters) as the data allows. |
| Pencil marks | ✅ Each player has pencil marks (corner and centre) as well as entries. Marks are private by default; a switch shares your marks with everyone, and switching it off unshares them. Entries are shared. |
| Suggestions | ✅ Suggest, then the host accepts, as with crosswords: a suggestion is digits for one or more squares, with Agree, Take back, the accept settings and the host's Write in / Suggest. |
| Checking at the end | With a solution: right or wrong, like crosswords. ✅ Without one, fill the grid in on the original site and let the site check it (most sites verify solutions themselves), then show its verdict to everyone. Some variants don't follow the standard rules, so we don't assume classic rules for a variant puzzle. |
| The host's Check | Against the solution when there is one. Without one, only clashes, and only for puzzles whose rules say normal sudoku rules apply. |
| Rules | ✅ Shown to the right of the grid, as Cracking the Cryptic does, where the clue lists are for crosswords. |
| Variants | Draw SudokuPad's shapes as they are (cages, lines, dots, arrows, shading, text) and show the rules text. That covers killer, thermo, arrow, Kropki, XV, renban, whispers, little killer, sandwich and so on, without code for each rule. No per-variant rule checking. |
| Race | The same race mode. It needs a known solution: PuzzleMe always has one, SudokuPad sometimes. A classic sudoku without one gets its solution from a small solver of our own. A variant without one can't be raced. |

## How a sudoku would play

**Everyone**
- The grid has thick box borders (or the puzzle's own regions), given digits in bold, and the variant shapes drawn on
  top. The title, author and rules sit to the right of it, where the clue lists are for crosswords.
- Select one square, or several: drag, or Ctrl/Shift-click. Then type.
- Modes, as in SudokuPad, since CTC viewers know them: **Digit**, **Corner** marks, **Centre** marks, **Colour**.
  Buttons, plus SudokuPad's keys: Shift for corner, Ctrl for centre, and Z/X/C/V to switch modes.
- Each player's selection shows as an outline in their colour on everyone's grid. This replaces the crossword's
  badges on clues.
- Clashes (the same digit twice in a row, column or box) are marked as you go, for puzzles with normal sudoku rules.
  It's standard in sudoku apps, and it isn't a hint.
- Pencil marks (corner and centre) are your own until you switch on "Share my marks". Then everyone sees them, in your
  colour; switching it off takes them back.
- Everything else carries over: Notes, Replay, Check (the host's), zoom, messages that float over the page, "Solved!".
  Anagram and Define stay crossword-only.

**Guests** suggest digits. A suggested digit shows small, in the suggester's colour, much like corner letters in
crosswords. Others can 👍 Agree. The host accepts, or the accept
setting does.

**Host** plays in the full view, as with crosswords. **Fill in** types the solved grid into PuzzleMe.

## Variant sudokus

How SudokuPad describes common variants, which is all we need to draw them:

| Variant | In the SCL data |
|---|---|
| Irregular (jigsaw) | `regions` |
| Killer, region sums | `cages` (an outline, with the sum as its value) |
| Thermometer | `lines` (thick and grey), with a circle for the bulb |
| Arrow | `arrows`, or `lines` with a circle |
| Kropki, XV, quadruples | `overlays` on cell edges or corners (dots, letters, small circles with digits) |
| Renban, German whispers, palindromes | `lines` in particular colours |
| Little killer, sandwich, X-sums | `overlays` with text outside the grid |
| Even/odd, shaded cells | `underlays` |

A generic SVG renderer for these draws most CTC puzzles correctly; the rules text explains what they mean. Things
that won't work at first, and should say so: fog of war, puzzles that run their own scripts, background images, and
very large or non-square grids.

**Checking variants without a solution** would mean knowing each rule. SudokuPad's open rules parser can guess the
variant from the rules text, but it's guesswork. Instead, the grid is filled in on SudokuPad and SudokuPad checks it;
what SudokuPad does when a puzzle has no solution is to be found out in step 0.

## Sources

| Source | How | What we get | Test site |
|---|---|---|---|
| PuzzleMe (Courier Mail) | The existing PuzzleMe content script, which recognises a sudoku | Givens, solution, box size, Sudoku X, irregular regions; killer cages to check | Courier Mail blocks automated access, as for crosswords. Candidates: the LA Times' free PuzzleMe sudokus, or Amuse Labs' demo sets. To confirm in step 0. |
| SudokuPad (CTC, Logic Masters, f-puzzles, Penpa conversions) | A new content script on sudokupad.app | Everything SCL holds: shapes, rules, title and author, and the solution when the setter included one | Any CTC puzzle (public) |
| Generated (later, optional) | Our own small generator, or Simon Tatham's (MIT) | Classic sudokus at a chosen difficulty, no site needed | n/a |

Credit the setter: show the author and title, and link back to the puzzle page. Be polite to the APIs: one fetch per
puzzle, cached.

## Code structure

- **Puzzle kinds.** `RoomState.puzzle` becomes "a crossword or a sudoku", tagged with `kind` (a missing kind means a
  crossword, so older hosts still work). The crossword model in [shared/puzzle.ts](shared/puzzle.ts) stays as it is.
- **New `shared/sudoku/`:**
  - the model: size, regions, givens, shapes, rules, solution;
  - parsers from SCL and from PuzzleMe's data;
  - clash and classic-rules checks, and a small classic solver;
  - the grid with its SVG shapes, multi-square selection and input modes;
  - a co-op view alongside `CoopSolver`.
- **The shared grid** (`letters`) works unchanged, with digits as one-character strings. If marks are shared, there's
  a new `marks` (corner, centre, colour) in the room state.
- **Suggestions** are keyed by clue today; they'd need a list of squares instead (or as well). Grouping, Agree and
  accepting work the same way on squares.
- **Background page.** Mostly generic already: the grid, Check against solutions, the finished state, replay and race
  all work per square. What changes: applying a suggestion, and the answers summary (squares rather than clues).
- **Content scripts.** PuzzleMe recognises sudokus, reads the digits on the page, and fills them in. A new script
  matches sudokupad.app.
- **Guest page and full view** pick the view by `kind`. Race mode needs a sudoku racer's grid; its rules (progress,
  penalties, standings) are already generic.

## Build steps

| Step | What | Done when |
|---|---|---|
| 0. Prove it | In real Firefox: find a free PuzzleMe sudoku test page and map its player (reading digits, typing them, killer cages in the data); on SudokuPad, read the decoded puzzle and solution from the page | The extension reports the puzzle, givens and solution from both |
| 1. Model | Sudoku model, the SCL and PuzzleMe parsers, checks, solver | Unit tests pass (real puzzle samples as test data) |
| 2. The grid | Selection, modes, clashes, the shapes for variants | Every variant in the table above looks right on sample puzzles |
| 3. Co-op, PuzzleMe | Suggestions, Agree, accept settings, Check, Solved, Fill in, on a classic sudoku | `npm run e2e` passes on the test site |
| 4. Co-op, SudokuPad | The new content script, rules and author shown, checking with or without a solution | e2e on a CTC puzzle with a solution and one without |
| 5. Race | A sudoku racer's grid, finishing by solution or solver | e2e race on both sources |
| 6. Ship | Docs, version bump, check against the installed version, merge | Used in a real session |

Each step sits behind the earlier ones, like race mode, on its own branch until step 3 works end to end.

## Risks

- **PuzzleMe's sudoku player is unmapped.** Step 0 covers it. Courier Mail can't be tested automatically, so the host
  confirms it there, as for crosswords.
- **SudokuPad changes its internals or API.** Prefer the published format over page internals where we can; the
  e2e test catches breakage.
- **Puzzles we can't draw.** Show a clear "not supported yet" rather than a broken grid.
- **Size.** A good sudoku UI (multi-select, four input modes, shapes) is bigger than the crossword grid was. That's
  why it's staged: classic first, variants after.

## Open questions

All answered on 2026-10-06; see [Decisions](#decisions). The host's picks from the list below: the cryptic clue race,
some form of trivia, and a bracket game (see [Group games the host picked](#group-games-the-host-picked)).

## Other puzzles and group games

Grouped by how well each fits what's already built.

**Fits the crossword side as it is**

| Idea | Source and licence | How it fits | Effort |
|---|---|---|---|
| **Guardian crosswords** (cryptic, quiptic, Everyman, quick, prize, genius) | Free on theguardian.com. The page embeds clues, the grid and every answer (Prize answers come after the deadline). | A new content script into the existing crossword model. Check, Solved and race all work, since the answers are there. | Small |
| **Other PuzzleMe papers' crosswords** | Many papers use PuzzleMe | Already work if the content script's frame matching includes them | Tiny (one manifest line each) |
| **.puz / ipuz files** | Open formats; Crossword Nexus and Down for a Cross (open source) | The host loads a file instead of opening a site | Small to medium |
| **Cryptic clue race** ("clue of the round") | A free dataset of 500,000+ cryptic clues with answers | Everyone gets one clue and its enumeration; first right answer wins. Reuses race scoring. Good warm-up, and a natural home for AI explanations later. | Small to medium |
| **Codewords** | PuzzleMe has them, and Courier Mail may | A crossword-like grid with numbered letters; needs its own model | Medium |

**New puzzle kinds that reuse the sudoku work**

| Idea | Source and licence | How it fits | Effort |
|---|---|---|---|
| **Logic Masters Deutschland, f-puzzles** | Free puzzle archives that link to SudokuPad or Penpa | Covered by SudokuPad support; Penpa puzzles via the open Penpa → SCL converter | Small, once SudokuPad works |
| **KenKen, killer** | PuzzleMe (KenKen import) and SudokuPad | Cages, like killer sudoku | Small, once cages work |
| **puzz.link genres** (Slitherlink, Nurikabe, Masyu, Star Battle, Heyawake, LITS, Kakuro: hundreds) | pzprjs, MIT | Its library knows each genre's rules, so it checks answers with no stored solution. Co-op would sync its board state. | Large, but unlocks hundreds of genres at once |
| **Simon Tatham's puzzles** (Solo, Keen, Towers, Pattern/nonograms, Bridges, Loopy, Light Up, Net, Tents…) | MIT; puzzles generated from a seed | Everyone gets the same puzzle from one seed, with no site needed; good for races | Medium per puzzle type for co-op; races are easier |

**Different kinds of group game**

| Idea | Source and licence | How it fits | Effort |
|---|---|---|---|
| **Trivia night** | Open Trivia DB: free JSON, no key, CC BY-SA 4.0, one request per 5 s | Host runs rounds; everyone answers; a scoreboard. Reuses sessions, players and standings. | Medium |
| **Chess puzzle race** | Lichess puzzle database: 6.1 million rated, tagged puzzles, CC0 | Same position for everyone; fastest correct line wins. Needs a chessboard view (open-source boards exist). | Medium |
| **Puzzle hunt night** | Puzzled Pint: monthly team puzzle sets with an archive, CC BY-NC-SA 4.0 | Shared answer submission, checking and notes for a PDF puzzle set; built for teams of 3–5 | Medium |
| Codenames-style party games | Open-source versions exist (e.g. horsepaste; licence unconfirmed) | Little to add over existing free sites plus Discord | Not recommended |
| Wordle / Connections | NYT's are closed; clones exist | A co-op or race version is possible, but puzzle sources are thin or unofficial | Not recommended for now |

## Group games the host picked

Sketches, to plan properly when their turn comes. All three reuse sessions, players and the standings from race mode.

- **Cryptic clue race.** One clue at a time with its enumeration, from the free dataset of 500,000+ cryptic clues
  (or the Guardian's archive). First right answer scores; after a time limit, the answer is shown. A natural place
  for AI explanations of the wordplay, later.
- **Trivia.** Rounds of questions from Open Trivia DB (free, no key, CC BY-SA 4.0), chosen by category and
  difficulty. Everyone answers privately, then the answers are revealed with a scoreboard.
- **Bracket.** Someone suggests a category ("best biscuit"); everyone submits an option; the options are seeded into
  a bracket, and each round everyone votes head to head until one wins. No outside source needed.

## Recommendation

1. **Sudoku from PuzzleMe** (classic, then killer): the data is proven and solutions are always there, and it's what
   was asked for first.
2. **SudokuPad variants**: CTC and Logic Masters, drawn generically, checked by solution when there is one.
3. **Guardian crosswords**: small, and squarely what this group plays. It could even come first as a quick win, since
   it reuses everything.
4. Then pick from the rest. A cryptic clue race is the cheapest new game; puzz.link is the biggest jump in puzzle
   variety.

## Sources

- [Amuse Labs: Sudoku upload formats](https://amuselabs.com/docs/puzzles/sudoku/upload/) and [Puzzle types](https://amuselabs.com/docs/puzzles/overview/)
- [PuzzleMe demo sudoku](https://amuselabs.com/pmm/sudoku?id=89e91aca&set=demo-special-sudoku) (decoded with our `rawc` decoder)
- [Cracking the Cryptic puzzle page example](https://crackingthecryptic.com/sudoku?id=959), [SudokuPad](https://sudokupad.app/)
- [SudokuPad on GitHub](https://github.com/SudokuPad) ([sudokutools](https://github.com/SudokuPad/sudokutools), MPL-2.0; [puzzleformats](https://github.com/SudokuPad/puzzleformats), MIT), [Penpa+ → SCL converter](https://github.com/marktekfan/penpa-to-scl)
- [pzprjs](https://github.com/robx/pzprjs) (MIT), [Penpa+](https://github.com/swaroopg92/penpa-edit) (MIT), [Simon Tatham's Portable Puzzle Collection](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/) (MIT)
- [Guardian cryptic crossword](https://www.theguardian.com/crosswords/cryptic/29800) (page checked for embedded answers)
- [Cryptic clue dataset](https://cryptics.georgeho.org/), [Lichess open database](https://database.lichess.org/) (CC0), [Open Trivia DB](https://opentdb.com/api_config.php) (CC BY-SA 4.0), [Puzzled Pint](https://puzzledpint.org/about/) (CC BY-NC-SA 4.0)
