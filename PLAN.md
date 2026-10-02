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
- Each player picks a name and a colour when joining (host too).
- Selection is private: clicking a cell or clue highlights that clue and its cells on *your* screen only.
- Everyone sees which clue each other player is on: a small avatar/initial badge in that player's colour next to the clue.
- Real letters (what's on the host's site) are shown solid.
- Submitted suggestions show for everyone as small, semi-transparent letters in the suggester's colour,
  in the cell's free corners (top-left holds the clue number). Up to 3 shown per cell; beyond that, "+N".

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
- Accept → extension types the letters into the site (click each non-blank cell, type its letter) → site updates → everyone updates.
- Reject → suggestion removed, suggester notified.
- A suggestion whose letters all match the grid is cleared automatically.

## Site notes

Everything below is used by the content scripts and confirmed end to end in real Firefox with the extension
(`npm run e2e`, 2026-10-03). All input is untrusted DOM events, dispatched synchronously: both sites react
immediately, and timers can be throttled in out-of-view frames.

| | Crosshare | PuzzleMe (Courier Mail's player; tested on Vox) |
|---|---|---|
| Grid | `[aria-label="cell{row}x{col}"]`; block if its parent's class has `__cellContainerBlock` | `.crossword > .box`; each row ends with `.endRow`; `.box.empty` = block |
| Clues | `li[class*="ClueList"][class*="__item"]`: label "1A" + `__clueText` | `.aclues` / `.dclues` → `.clueDiv` with `.clueNum` and `.clue` |
| Current letters | cell `[class*="__contents"]` text | `.letter-in-box` text |
| Host's current clue | `li[data-active="true"]` | `.clueDiv.hilited-clue` |
| Select a cell | `.click()` on the cell | `mousedown` + `mouseup` on `.box` (`click()` alone does nothing) |
| Type a letter | `keydown` dispatched on `document.body` (on `window` it is ignored) | set `input.dummy` value + dispatch `input` (keydown is ignored) |
| Overlay positions | `getBoundingClientRect()` | `getBoundingClientRect()` (inside the iframe) |

Notes:
- Crosshare's page JSON (`#__NEXT_DATA__`) has the puzzle *and its solution*, and goes stale after in-app navigation, so we read the DOM instead.
- Crosshare class names are CSS-module hashes (`Cell-module__JMEMxa__cellContainer`); match on the stable part (`__cellContainer`).
- Crosshare shows a "Begin Puzzle" screen and PuzzleMe a "Play" button; the host clicks these by hand.
- Courier Mail itself blocks automated access, so PuzzleMe was tested on a free Vox puzzle. Still to confirm on Courier Mail in the host's own Firefox.
  The PuzzleMe content script runs in `*.amuselabs.com` and `*.couriermail.com.au` frames; if Courier Mail serves the player from another domain, add it to the manifest.

## Build steps

| Step | What | Done when | Status |
|---|---|---|---|
| 0. Prove it in real Firefox | Read + type on both sites from the extension; WebRTC from the background page | Works on Courier Mail while logged in; a friend on another network connects | ✅ Crosshare + Vox PuzzleMe (e2e). ⏳ Courier Mail; a friend on another network |
| 1. Clickable mockup | Guest view + host overlay look | We're happy with highlights, badges, corner letters | Skipped: built the real UI instead; review it in use |
| 2. Core | Puzzle model (numbering, cells per clue), message types | Unit tests pass | ✅ |
| 3. Live view | Adapters + extension + guest page | Host types on the site → guests see it; late joiners get the full state | ✅ |
| 4. Players | Names, colours, clue badges (guest view + host overlay) | Each player's clue shows for everyone | ✅ |
| 5. Suggestions | Submit, corner letters, sidebar queue, accept → typed into site, reject | Full loop works | ✅ Crosshare + Vox PuzzleMe |
| 6. Courier Mail | PuzzleMe adapter (runs inside the iframe) | Steps 3–5 work on Courier Mail | ⏳ needs a check while logged in |
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
