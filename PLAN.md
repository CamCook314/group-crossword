# Group Crossword — Plan

Solve crosswords together on the sites we already use (Crosshare, Courier Mail) without screen-sharing.
The host plays on the real site in Firefox; friends join from a link and see a live copy of the puzzle,
pick clues, and submit suggestions that the host accepts or rejects.

## Decisions

| Topic | Decision |
|---|---|
| Host software | Firefox extension (Manifest V2, persistent background page). Installed permanently via free *unlisted* Mozilla signing. |
| Guests | Open a link in any desktop browser. Nothing to install. |
| Guest page hosting | Static site on GitHub Pages: `camcook314.github.io/group-crossword/#<room>`. No domain needed. |
| Networking | WebRTC peer-to-peer via PeerJS; host is the hub. PeerJS's free public broker is only used to set up connections; PeerJS also includes free TURN relays for strict networks. |
| Getting the puzzle | Per-site adapters that read the page's own elements/data. **Not OCR** — the DOM gives exact text and exact cell positions (see Feasibility). |
| Source of truth | The letters on the host's real site. Everyone's view is rebuilt from what the site shows. |
| Answers | Never leave the host's machine (Crosshare's page data contains the solution — the adapter drops it). |
| Puzzle type | Almost exclusively cryptics. Enumerations like (3,6) come through in the clue text. |
| Group size | Host + usually up to 3 guests. |

## How it works

```
 HOST'S FIREFOX
 ┌───────────────────────────────────────────────────────┐
 │ Crossword tab (Crosshare page / PuzzleMe iframe)      │
 │   content script (site adapter):                      │
 │     - reads grid, clues, current letters, host's clue │
 │     - draws the overlay (others' badges + suggestions)│
 │     - types accepted answers into the site            │
 │                 ⇅ extension messaging                 │
 │ Background page: session, players, suggestion queue,  │
 │   PeerJS host                                         │
 │ Sidebar: start/stop, copy link, players, accept/reject│
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
- Real letters (what's on the host's site) are shown solid.
- Submitted suggestions show for everyone as small, semi-transparent monospace letters in the suggester's colour, in the
  cell's corners in the order they were suggested: top-right, top-left (just after the clue number), bottom-left,
  bottom-right. A new suggestion never moves existing ones. Up to 4 per cell; beyond that, "+N". On the host's overlay
  they're anchored to the cell's own edges, so wide letters can't spill into the next square.
- A letter two or more players suggest for the same square is shown once, in grey, top-right (most-agreed first),
  ahead of single-player letters. This works square by square, so single letters and whole words both combine.

**Guests** (shared view: grid + Across/Down lists, like the sites themselves)
- Type letters into a clue's cells as a private draft. Partial answers are fine.
- Press Enter (or Submit) to share it as a suggestion. Only then do others see it.
- Resubmitting for the same clue replaces your previous suggestion.

**Host** (plays on the real site)
- An overlay drawn on top of the real crossword shows other players' badges and suggestion letters.
  The overlay ignores the mouse, so clicks go through to the site as normal.
- The host's own current clue (read from the site's highlight) is broadcast as the host's badge.
- Letters the host types on the site are real letters and sync to everyone. The host doesn't need to suggest.
- Sidebar lists pending suggestions (player, clue, letters, clashes with existing letters highlighted) with Accept / Reject.
  Identical suggestions (same clue, same letters) combine into one card ("Sam + Ana", "2 agree"), and cards with more
  agreement go to the top. Accept and Reject act on the whole card; Reject tells everyone on it. Suggestions that only
  partly match stay separate cards (their shared letters still show grey on the grid).
- Accept → extension types the letters into the site (click each non-blank cell, type its letter) → site updates → everyone updates.
- Reject → suggestion removed, suggester notified.
- Undo accept → puts back the squares the last accepted suggestion changed (only those still holding what it typed,
  so later typing isn't lost). One level only; the undone suggestion doesn't return to the queue.
- A suggestion whose letters all match the grid is cleared automatically.

## Site notes

Everything below is used by the content scripts and confirmed end to end in real Firefox with the extension
(`npm run e2e`, 2026-10-03). All input is untrusted DOM events with no timers (they're throttled in out-of-view
frames). Between squares we yield one microtask so Crosshare re-renders: it decides at render time whether clicking a
square selects it or flips direction, so back-to-back clicks otherwise misfire.

| | Crosshare | PuzzleMe (Courier Mail's player; tested on Vox) |
|---|---|---|
| Grid | `[aria-label="cell{row}x{col}"]`; block if its parent's class has `__cellContainerBlock` | `.crossword > .box`; each row ends with `.endRow`; `.box.empty` = block |
| Clues | `li[class*="ClueList"][class*="__item"]`: label "1A" + `__clueText` | `.aclues` / `.dclues` → `.clueDiv` with `.clueNum` and `.clue` |
| Current letters | cell `[class*="__contents"]` text | `.letter-in-box` text |
| Host's current clue | `li[data-active="true"]` | `.clueDiv.hilited-clue` |
| Select a cell | `.click()` on the cell | `mousedown` + `mouseup` on `.box` (`click()` alone does nothing) |
| Type a letter | `keydown` dispatched on `document.body` (on `window` it is ignored) | set `input.dummy` value + dispatch `input` (keydown is ignored) |
| Clear a square | `keydown` `Delete` on `document.body` | `keydown` `Delete` on `input.dummy` |
| Overlay positions | `getBoundingClientRect()` | `getBoundingClientRect()` (inside the iframe) |

Notes:
- Crosshare's page JSON (`#__NEXT_DATA__`) has the puzzle *and its solution*, and goes stale after in-app navigation, so we read the DOM instead.
- Crosshare class names are CSS-module hashes (`Cell-module__JMEMxa__cellContainer`); match on the stable part (`__cellContainer`).
- Crosshare shows a "Begin Puzzle" screen and PuzzleMe a "Play" button; the host clicks these by hand.
- Courier Mail itself blocks automated access, so the automated test uses a free Vox PuzzleMe puzzle; the host has confirmed it works on Courier Mail.
  The PuzzleMe content script runs in `*.amuselabs.com` and `*.couriermail.com.au` frames; if Courier Mail serves the player from another domain, add it to the manifest.

## Build steps

| Step | What | Done when | Status |
|---|---|---|---|
| 0. Prove it in real Firefox | Read + type on both sites from the extension; WebRTC from the background page | Works on Courier Mail while logged in; a friend on another network connects | ✅ Crosshare + Vox PuzzleMe (e2e); ✅ Courier Mail (host testing, 2026-10-03). ⏳ a friend on another network |
| 1. Clickable mockup | Guest view + host overlay look | We're happy with highlights, badges, corner letters | Skipped: built the real UI instead; review it in use |
| 2. Core | Puzzle model (numbering, cells per clue), message types | Unit tests pass | ✅ |
| 3. Live view | Adapters + extension + guest page | Host types on the site → guests see it; late joiners get the full state | ✅ |
| 4. Players | Names, colours, clue badges (guest view + host overlay) | Each player's clue shows for everyone | ✅ |
| 5. Suggestions | Submit, corner letters, sidebar queue, accept → typed into site, reject | Full loop works | ✅ Crosshare + Vox PuzzleMe |
| 6. Courier Mail | PuzzleMe adapter (runs inside the iframe) | Steps 3–5 work on Courier Mail | ✅ confirmed by the host on Courier Mail |
| 7. Robustness + install | Reconnects, host page reload, switching puzzles; unlisted signing | A full session with friends without restarts | Partly: guests rejoin as the same player, the host re-registers with the broker, switching puzzles works. ⏳ signing |

## Messages

See [shared/protocol.ts](shared/protocol.ts).
- Host → guest: `state`, the whole room (puzzle without answers, letters, players, suggestions), sent after every change.
  It's a few KB, and resending everything means guests can't drift. `rejected` goes to the suggester only.
- Guest → host: `hello` (persistent client id, name, colour; rejoining keeps your identity), `select` (current clue),
  `suggest` (clue, letters with blanks). Validated by `parseGuestMessage`.

## Tech

TypeScript throughout, bundled by one small esbuild script ([build.mjs](build.mjs)) with a hand-written MV2 manifest
(WXT and Vite dropped: fewer moving parts). Preact for the guest page and sidebar. PeerJS for WebRTC. web-ext for running
and signing. Vitest for unit tests; Selenium driving real Firefox for the end-to-end test ([e2e/run.mjs](e2e/run.mjs)).
Needs Firefox 140+, because the manifest declares that the extension shares website content, which Mozilla now requires.

## Risks

- **Site markup changes** break an adapter. Keep site-specific code small and isolated per site; `npm run e2e` catches it.
- **A friend can't connect** (strict NAT / mobile networks) → PeerJS's default TURN relays should cover it; otherwise configure another.
- **The free public PeerJS server is down** → sessions can't start. Self-host a PeerServer or switch signalling if it becomes a problem.
- **Courier Mail's PuzzleMe setup differs from Vox** → check while logged in.

## Not doing (for now)

Voice/chat (use Discord), phone guests, hosting from Chrome, OCR import, linked clues spanning several slots ("See 13"),
barred grids, mirroring the sites' Check/Reveal marks, keeping a session alive after the host closes Firefox.
Sessions are private to whoever has the link; nothing is stored anywhere.
