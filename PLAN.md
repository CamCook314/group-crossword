# Group Crossword — Plan

Solve crosswords together on the sites we already use (Crosshare, Courier Mail) without screen-sharing.
The host opens the crossword on the real site in Firefox, and everyone plays in Group Crossword's own copy of it: the
host on a full-page view, friends from a link. Friends suggest answers, which the host accepts or rejects (or which go
in by themselves, if the host chooses). Once it's solved, the host fills it in on the real site with one click.

Race mode, an alternative game mode, has its own plan: [RACE_MODE.md](RACE_MODE.md). Ideas for more competitive modes:
[FENCING_BATTLE.md](FENCING_BATTLE.md).

## Decisions

| Topic | Decision |
|---|---|
| Host software | Firefox extension (Manifest V2, persistent background page). Installed permanently via free *unlisted* Mozilla signing. |
| Guests | Open a link in any desktop browser. Nothing to install. |
| Guest page hosting | Static site on GitHub Pages: `camcook314.github.io/group-crossword/#<room>`. No domain needed. |
| Networking | WebRTC peer-to-peer via PeerJS; host is the hub. PeerJS's free public broker is only used to set up connections; PeerJS also includes free TURN relays for strict networks. |
| Getting the puzzle | Per-site adapters that read the page's own elements/data. **Not OCR** — the DOM gives exact text and exact cell positions (see Feasibility). |
| Source of truth | The shared grid in the host's extension. It copies the site's letters until play starts in the tool (the first letter written or accepted); after that the site is left alone, with a notice saying so, until the host fills it in once it's solved. Changed after the first real session: typing into the site from another tab was unreliable (sites pause in the background), and the sites' own Check and "finished" dialogs never reached the guests. |
| Answers | Never leave the host's machine (Crosshare's page data contains the solution — the adapter drops it). |
| Puzzle type | Almost exclusively cryptics. Enumerations like (3,6) come through in the clue text. |
| Group size | Host + usually up to 3 guests. |

## How it works

```
 HOST'S FIREFOX
 ┌───────────────────────────────────────────────────────┐
 │ Crossword tab (Crosshare page / PuzzleMe iframe)      │
 │   content script (site adapter):                      │
 │   - reads the grid, clues, letters and answers        │
 │   - shows a notice once play has moved to the tool    │
 │   - fills in the solved grid                          │
 │                 ⇅ extension messaging                 │
 │ Background page: session, players, the shared grid,   │
 │   suggestion queue, checks, PeerJS host               │
 │ Sidebar: start/stop, copy link, players, accept/reject│
 │ Full view (extension page): where the host plays:     │
 │   the board, suggestions, players, tools; or the race │
 └──────────────────────────┬────────────────────────────┘
                            │ WebRTC data channels
             ┌──────────────┼──────────────┐
          Guest page     Guest page     Guest page   (GitHub Pages)
```

## Player experience

**Everyone**
- Each player picks a name and a colour when joining (host too): a preset, or any colour from a colour wheel.
- Selection is private: clicking a cell or clue highlights that clue and its cells on *your* screen only.
- Everyone sees which clue each other player is on: a small avatar/initial badge in that player's colour next to the clue.
- Letters in the shared grid are shown solid.
- Submitted suggestions show for everyone as small, semi-transparent monospace letters in the suggester's colour, in the
  cell's corners in the order they were suggested: top-right, top-left (just after the clue number), bottom-left,
  bottom-right. A new suggestion never moves existing ones. Up to 4 per cell; beyond that, "+N". A player's newer
  letter for a square replaces their older one there (their older suggestion keeps its other letters).
- A letter two or more players suggest for the same square is shown once, in grey, top-right (most-agreed first),
  ahead of single-player letters. This works square by square, so single letters and whole words both combine.
- Word breaks from the enumeration, in white: a bar between words, a short dash for a hyphen.
- Linked answers ("See 13"): an answer spread over several entries is one answer. Selecting any part selects all of
  it, typing runs on from one part to the next, and the clue bar says "1A/3A". A clue that mentions another ("4 Down",
  or one the site marks) lightly highlights that clue too.
- Typing: filling an empty square skips squares already filled; at the end of an answer the cursor goes back to its
  first empty square. Writing straight in (the host, a racer) then moves on to the next unfinished clue; drafting a
  suggestion stays put, so Enter suggests the answer just typed. Space switches direction, Tab goes to the next clue,
  and the crossing clue is highlighted in the list. Filled-in clues are greyed out in the lists.
- Player badges sit in a space kept for them at the end of each clue, so they never move its text.
- The page fills the window: the grid as big as fits, with − / + to zoom (remembered), scrolling when zoomed in.
  Messages (checks, "Solved!", a race's "Not quite") float over the page instead of pushing the puzzle down.
- Anagram pad: type the letters and they sit in a circle (Shuffle mixes them). Click a square to choose where the
  next letter goes (otherwise the first empty one), then click letters into the answer's squares; click a placed letter
  to send it back. Letters already in the grid come off the circle when the whole fodder is typed. **Use** puts them in
  the grid: as drafts when suggesting, straight in when writing.
- Define: look up a word's meanings and synonyms (Datamuse, free, no key; only the word looked up leaves the page).
- Notes: a private scratchpad under the grid, kept in your browser per puzzle.
- Replay: watch the solve back, with a slider and speeds. The host's extension records each letter that changes in the
  shared grid and whose it was (grey for agreed ones), in memory only. Letters already there when the puzzle opens
  come first; a new puzzle starts a new replay.
- Check (the host's): a square, the selected answer or the whole grid, against the answers the extension read. Wrong
  squares are marked red for everyone until they change, and everyone sees a message ("Checked 1A: nothing wrong ✓").
- When the grid is full, everyone sees "Solved! 🎉", or that something's not right (or just that it's full, if the
  answers couldn't be read).

**Guests** (shared view: grid + Across/Down lists, like the sites themselves)
- The join screen shows who's already there, with their colours. "Change your name or colour" works mid-game.
- Type letters into a clue's cells as a private draft. Partial answers are fine.
- Press Enter (or Suggest) to share it as a suggestion. Only then do others see it.
- Suggesting again for the same clue adds to your earlier suggestion square by square (new letters replace old ones;
  blanks keep them), so suggesting one square at a time works. Drafts in a square shared with another drafted answer
  stay until that answer is suggested too.
- Beside the clue lists: the suggestions for the selected answer. Others' have **👍 Agree**, which suggests the same
  letters so they combine into one card; yours have **✕ Take back**.
- What Enter says follows the host's accept setting ("Enter" rather than "Suggest" when it goes straight in).

**Host** (plays in the full view)
- **Open full view** in the sidebar opens an extension page with the same board guests see, everyone's suggestions on
  it. **Write in** (the default) puts letters straight into the shared grid; **Suggest** makes them drafts and
  suggestions like a guest's, for when the host isn't sure. Beside it: the suggestion queue, the players, the tools,
  Check, and once it's solved, **Fill in the crossword**, which brings the site's tab forward and types the grid in.
  In Race mode the same page is the race view.
- The host's selected clue in the full view is broadcast as the host's badge.
- The session sticks to its crossword. Another crossword opened in another tab is offered ("Play it instead") rather
  than taking over; before a session starts and before any play in the tool, the tool simply follows the newest one.
- The sidebar (and the full view) lists pending suggestions (player, clue, letters, clashes with existing letters highlighted) with Accept / Reject.
  Identical suggestions (same clue, same letters) combine into one card ("Sam + Ana", "2 agree"), and cards with more
  agreement go to the top. Accept and Reject act on the whole card; Reject tells everyone on it. Suggestions that only
  partly match stay separate cards (their shared letters still show grey on the grid).
- Accept → the letters go into the shared grid → everyone updates.
- Reject → suggestion removed, suggester notified.
- Undo accept → puts back the squares the last accepted suggestion changed (only those still holding what it typed,
  so later typing isn't lost). One level only; the undone suggestion doesn't return to the queue.
- A suggestion whose letters all match the grid is cleared automatically.
- Accept setting (remembered): friends' answers go in when the host accepts them (the default), automatically once
  two or more players agree on the same letters, or automatically for trusted friends. Automatic accepts work a
  submitted suggestion at a time, exactly like pressing Accept (so Undo accept works on them), so drafts stay private
  until Enter. The host's own suggestions always wait for someone to agree (the host suggests when unsure).

## Site notes

Everything below is used by the content scripts (selecting and typing, to fill in the solved grid) and confirmed end
to end in real Firefox with the extension (`npm run e2e`, 2026-10-04). All input is untrusted DOM events with no timers (they're throttled in out-of-view
frames). Between squares we yield one microtask so Crosshare re-renders: it decides at render time whether clicking a
square selects it or flips direction, so back-to-back clicks otherwise misfire.

| | Crosshare | PuzzleMe (Courier Mail's player; tested on Vox) |
|---|---|---|
| Grid | `[aria-label="cell{row}x{col}"]`; block if its parent's class has `__cellContainerBlock` | `.crossword > .box`; each row ends with `.endRow`; `.box.empty` = block |
| Clues | `li[class*="ClueList"][class*="__item"]`: label "1A" + `__clueText` | `.aclues` / `.dclues` → `.clueDiv` with `.clueNum` (its own text only: a linked clue puts the clue it links to in a child) and `.clue` |
| Current letters | cell `[class*="__contents"]` text | `.letter-in-box` text |
| Host's current clue | `li[data-active="true"]` | `.clueDiv.hilited-clue` |
| Select a cell | `.click()` on the cell | `mousedown` + `mouseup` on `.box` (`click()` alone does nothing) |
| Type a letter | `keydown` dispatched on `document.body` (on `window` it is ignored) | set `input.dummy` value + dispatch `input` (keydown is ignored) |
| Clear a square | `keydown` `Delete` on `document.body` | `keydown` `Delete` on `input.dummy` |

Notes:
- Crosshare's page JSON (`#__NEXT_DATA__`) has the puzzle *and its solution*, and goes stale after in-app navigation, so we read the DOM instead.
- Crosshare class names are CSS-module hashes (`Cell-module__JMEMxa__cellContainer`); match on the stable part (`__cellContainer`).
- Crosshare shows a "Begin Puzzle" screen and PuzzleMe a "Play" button; the host clicks these by hand.
- Courier Mail itself blocks automated access, so the automated test uses a free Vox PuzzleMe puzzle; the host has confirmed it works on Courier Mail.
  The PuzzleMe content script runs in `*.amuselabs.com` and `*.couriermail.com.au` frames; if Courier Mail serves the player from another domain, add it to the manifest.

## Build steps

| Step | What | Done when | Status |
|---|---|---|---|
| 0. Prove it in real Firefox | Read + type on both sites from the extension; WebRTC from the background page | Works on Courier Mail while logged in; a friend on another network connects | ✅ Crosshare + Vox PuzzleMe (e2e); ✅ Courier Mail (host testing, 2026-10-03); ✅ a real session with a friend joining |
| 1. Clickable mockup | Guest view + host overlay look | We're happy with highlights, badges, corner letters | Skipped: built the real UI instead; review it in use |
| 2. Core | Puzzle model (numbering, cells per clue), message types | Unit tests pass | ✅ |
| 3. Live view | Adapters + extension + guest page | Host types on the site → guests see it; late joiners get the full state | ✅ |
| 4. Players | Names, colours, clue badges (guest view + host overlay) | Each player's clue shows for everyone | ✅ |
| 5. Suggestions | Submit, corner letters, sidebar queue, accept → typed into site, reject | Full loop works | ✅ Crosshare + Vox PuzzleMe |
| 6. Courier Mail | PuzzleMe adapter (runs inside the iframe) | Steps 3–5 work on Courier Mail | ✅ confirmed by the host on Courier Mail |
| 7. Robustness + install | Reconnects, host page reload, switching puzzles; unlisted signing | A full session with friends without restarts | ✅ Signed (0.3.0, unlisted) and installed; a real session ran without restarts. Guests rejoin as the same player, the host re-registers with the broker, switching puzzles works. |
| 8. Polish | Word breaks, linked answers, Agree, accept settings, typing, anagram pad, replay, the host's full view | Both sites end to end | ✅ `npm run e2e`, both sites, 2026-10-03 |
| 9. Play in our tool | The notes from the first real session ([TODO.md](TODO.md)): the shared grid lives in the extension, Check, Solved and Fill in, the session sticks to its crossword, the host can suggest, merged suggestions, the page fills the window with zoom, Define and Notes | Both sites end to end | ✅ `npm run e2e`, both sites, 2026-10-04 |

## Messages

See [shared/protocol.ts](shared/protocol.ts).
- Host → guest: `state`, the whole room (puzzle without answers, the shared grid, players, suggestions, the accept
  setting, squares checked wrong, the latest check, whether the full grid is right), sent after every change and as
  soon as someone connects (so the join screen can list the players). It's a few KB, and resending everything means
  guests can't drift. `rejected` goes to the suggester only; `replay` (the solve so far) to whoever asked;
  `race-boards` (everyone's grid) to racers who have finished.
- Guest → host: `hello` (persistent client id, name, colour; rejoining keeps your identity, and sending it again
  changes your name or colour), `select` (current clue), `suggest` (clue, letters with blanks, merged into your
  earlier suggestion for the clue; all blank takes it back; Agree sends the same letters), `get-replay`. Validated by
  `parseGuestMessage`.
- The guest page copes with older extensions (fields they don't send get defaults), because it deploys before the
  host has signed and installed a new version.

## Tech

TypeScript throughout, bundled by one small esbuild script ([build.mjs](build.mjs)) with a hand-written MV2 manifest
(WXT and Vite dropped: fewer moving parts). Preact for the guest page and sidebar. PeerJS for WebRTC. web-ext for running
and signing. Vitest for unit tests; Selenium driving real Firefox for the end-to-end test ([e2e/run.mjs](e2e/run.mjs)).
Needs Firefox 140+, because the manifest declares that the extension shares website content, which Mozilla now requires.
[.gitattributes](.gitattributes) keeps every file's line endings LF, so a Windows checkout doesn't change them.

## Risks

- **Site markup changes** break an adapter. Keep site-specific code small and isolated per site; `npm run e2e` catches it.
- **A friend can't connect** (strict NAT / mobile networks) → PeerJS's default TURN relays should cover it; otherwise configure another.
- **The free public PeerJS server is down** → sessions can't start. Self-host a PeerServer or switch signalling if it becomes a problem.
- **Courier Mail's PuzzleMe setup differs from Vox** → check while logged in.

## Not doing (for now)

Voice/chat (use Discord), phone guests, hosting from Chrome, OCR import, barred grids, Reveal and hints, keeping a
session alive after the host closes Firefox. AI explanations of clues: maybe later.
Sessions are private to whoever has the link; nothing is stored on any server (notes and zoom stay in each browser).
