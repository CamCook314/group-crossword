# Redesign — should it stay an extension?

The host asked (2026-10-06), before building the expansion ([expansion.md](expansion.md)): is it worth overhauling
the design to reuse and improve things, and should this still be a web extension?

## Short answer

Keep a Firefox extension, but make it small: a **connector** that reads puzzles (and their answers) from the sites
you're logged into, and fills in the solved grid at the end. Move everything else into the web app on GitHub Pages,
which guests already use: the session, the shared grid, suggestions, Check, races, and the host's full view. The app
gets a host mode.

Do it now, as the first step of the expansion, before sudoku. Otherwise every new game gets built twice and shipped
through extension signing.

## Why now

- **The extension has become the game server.** Since "play in our tool" (0.6.0), its background page holds the
  grid, the suggestions, the checks and the races. The full view is a second copy of the guest page with host
  controls. Sudoku, the clue race, trivia and the bracket would each have to be built into both.
- **Every host-side change needs a signed release:** build, sign, wait for Mozilla, reinstall (last time, a clock six
  seconds fast stopped it). The guest page deploys in under a minute, so the two drift apart. Every release then
  needs fallback code for older extensions and a compatibility test run.
- **Most of the planned games need no site at all.** Trivia, the bracket, the cryptic clue race and generated sudokus
  could be hosted with no extension, by anyone, from any browser. Today only the extension can host.

## What the extension is really needed for

Only these need to run inside the host's browser, with access to the site's page:

1. **Reading the puzzle and answers from sites the host is logged into.** Courier Mail needs your subscription; and
   none of these sites let another web page read them (they don't allow cross-site requests).
2. **Filling in the solved grid on the site**, so it counts on your account.
3. Showing the notice on the site that the puzzle is being played in the full view.

Everything else (the PeerJS hub, room state, suggestions, accept settings, Check, replay, race rules, the full view's
screens) is ordinary app logic. It runs just as well in a normal web page.

## Options

| | A. Keep the extension as host | **B. Web app hosts; extension is a connector** | C. A server holds the rooms |
|---|---|---|---|
| New games built… | Twice: guest page and full view | **Once, in the app** | Once |
| Releasing a change | Sign and reinstall for anything host-side | **Just push; sign only when site reading or filling changes** | Deploy a server too |
| Version drift (guest page vs extension) | Every release | **Rare: the connector's job is small and stable** | None |
| Games without a site (trivia, bracket, clue race) | Still need the extension to host | **Anyone can host, no install** | Anyone |
| Survives the host reloading | Yes (background page) | Needs care: save the room in the tab and keep the room id (see Risks) | Yes |
| Work to get there | None | **Moving code, not rewriting (see What's reused)** | New backend, accounts or hosting; drops "no domain/server" |

Also considered and not recommended:
- **A desktop app:** the sites need your browser login, and guests should need nothing installed.
- **Chrome / Manifest V3:** not needed. Firefox is keeping Manifest V2, and option B makes a Chrome connector easy
  later.

## Option B in detail

```
 HOST'S FIREFOX
 ┌──────────────────────────────────────────────────────────┐
 │ Puzzle tab (Courier Mail, Crosshare, SudokuPad…)         │
 │   connector content script: reads puzzle + answers,      │
 │   fills in the solved grid, shows the notice             │
 │                ⇅ extension relay (tiny background page)  │
 │ Group Crossword app tab (GitHub Pages), in host mode     │
 │   bridge content script ⇄ window.postMessage             │
 │   host engine: room, grid, suggestions, checks, races    │
 │   host screens: today's full view                        │
 └────────────────────────────┬─────────────────────────────┘
                              │ WebRTC (PeerJS), as now
               ┌──────────────┼──────────────┐
            the same app, in guest mode, for each friend
```

- **One app, two roles.** The page friends open is the same one the host runs. Host mode comes from a "Host a game"
  button, or from the extension's toolbar button, which opens the app with host mode on.
  - With the connector, the host picks a puzzle tab ("Play the crossword open in Courier Mail").
  - Games without a site start straight away.
- **The connector** is the existing site adapters, plus a bridge: a content script that runs only on the app's own
  address (and localhost for development and tests) and relays messages. Firefox doesn't let a web page message an
  extension directly, so the bridge is the standard workaround.
  - Its messages: which puzzles are open; a puzzle's snapshot (grid, clues, letters, answers); fill in; show the
    notice.
  - Answers go only to the host's own app tab, never to guests, as now.
- **The host engine** is today's background-page logic moved into the app: `background.ts`, `raceHost.ts`, the
  suggestion rules. It becomes a plain module without browser-extension APIs, which also makes it easier to
  unit-test.
- **Surviving a reload:** the app saves the room in the tab (session storage) and reopens it with the same room id;
  guests reconnect by themselves. Automatic reconnecting is worth having anyway; today guests press Reconnect.
- **The sidebar retires.** Everything in it is already in the full view; the toolbar button opens or focuses the app.
- **Versions:** the connector's messages carry a version, and the app says "update the extension" if the connector is
  too old for something. Signing is needed only when site reading or filling changes.

## Game kinds, on top of this

A room layer shared by every game, and game kinds plugged into it:
- **Room** (all games): session, players with names and colours, the join screen, who's looking at what, messages,
  standings.
- **Game kinds:** crossword and sudoku (co-op and race), cryptic clue race, trivia, bracket. Each brings its model,
  its host rules (what can be suggested, accepted, checked), its screen, and which modes it supports.

Code layout:
- `app/`: the one web app (room, host engine, screens);
- `games/<kind>/`: each game's model, rules and views, holding today's `shared/` crossword code;
- `connector/`: the extension.

## What's reused

Most code moves rather than being rewritten:

| Today | Becomes |
|---|---|
| `shared/`: the grid, clue lists, co-op view, race rules, suggestions, replay, anagram pad, Define, Notes | Unchanged, under `games/crossword/` and the room layer |
| `guest/`: the guest page | The app, with host mode added |
| `extension/src/background.ts`, `raceHost.ts` | The host engine in the app |
| `extension/src/CoopView.tsx`, `RaceView.tsx`, `SuggestionList.tsx`, `host.tsx` | The app's host screens |
| `extension/src/content/*`: site adapters | The connector, nearly unchanged |
| `extension/src/sidebar.tsx` | Retired (the toolbar opens the app) |
| `e2e/`: the same checks | Same checks; games without a site need no extension at all |

## Risks

- **Size.** About as big as race mode. Nothing new for players until it's done, so it goes on a branch, and the
  existing co-op and race checks must all pass before it merges.
- **Closing the host's tab ends the session.** Today closing the crossword tab doesn't, though quitting Firefox does.
  Mitigation: the app asks before closing while a session is live, and a reload restores it.
- **The room id after a reload.** The guests' link holds the room id, so the host must get the same one back from the
  PeerJS broker after reloading. To prove in step 0.
- **Background tabs.** Firefox slows timers in a tab you're not looking at (to about once a second). WebRTC keeps
  working, and nothing here needs fast timers, but the tests should cover a host tab in the background.
- **The bridge** must only talk to the app's own address (and localhost in development), so other sites can't use it.

## Plan

| Step | What | Done when |
|---|---|---|
| 0. Prove it | An app tab hosts a room and keeps its room id across a reload; the bridge passes a crossword from the content script to the app tab, and a fill-in back | A throwaway test shows both |
| 1. Host engine | Move the background-page logic into a host module in the app | Unit tests pass, including today's race tests |
| 2. Host mode | The full view's co-op and race screens in the app, plus a home screen (host or join) | The app can host co-op with no extension, on a puzzle given by the test |
| 3. Connector | Background page becomes a relay; site adapters unchanged; the bridge | The host picks an open puzzle tab; fill-in works |
| 4. Parity | Today's co-op and race end-to-end checks, rewritten for the new structure | `npm run e2e` passes on both sites |
| 5. Ship | Sign the slimmer connector, update the docs, merge | A real session |
| 6. Expansion | The game-kind layer, then sudoku (expansion.md), then the games without a site | As in expansion.md |

## Long term: letting anyone host

The host asked (2026-10-06): today only the host can host, since only they have the extension. Long term, is it
worth getting a domain and a server, or building a non-web app where you paste a puzzle's URL, so that others can
create a lobby and invite people? Would that also let non-puzzle games in?

**What decides it is where the puzzle data comes from.** Checked 2026-10-06, whether a plain web page (like ours on
GitHub Pages) may read each source:

| Source | Readable by a web page? | So, to host it you need… |
|---|---|---|
| Open Trivia DB, Datamuse (Define) | Yes | Nothing: the app alone |
| Generated sudokus, the bracket, a clue dataset we host ourselves | n/a (no outside source) | Nothing: the app alone |
| Guardian, Crosshare, Cracking the Cryptic pages, SudokuPad's API | No (SudokuPad only allows its own development address) | Something outside the page to fetch it: the connector extension, or a small server that fetches on request |
| Courier Mail (PuzzleMe behind a subscription) | No; it also needs the subscriber's login, and the PuzzleMe player only loads inside the paper's own page | The subscriber's own logged-in browser, so the connector extension. A server can't do this, and shouldn't try. |

**The options for "paste a URL":**

| | What it gives | Cost |
|---|---|---|
| **A tiny fetcher on a free serverless host** (e.g. a Cloudflare Worker on its free `workers.dev` address) | Anyone pastes a Guardian, Crosshare or SudokuPad/CTC link and hosts, with nothing installed. It does one thing: fetch a puzzle page from an allowed list of sites and return the puzzle (and answers, to the host only). Rooms stay peer-to-peer. | A free account; a few dozen lines; keep to an allow-list and modest use, as a polite reader of public pages |
| A full server for rooms (a domain, plus rooms held on the server) | Rooms that don't depend on the host's tab, no PeerJS broker, public lobbies, accounts and stats later | Ongoing running and upkeep, security, likely a small monthly cost beyond free tiers; not needed for a group of friends |
| A desktop app (paste a URL; it fetches anything) | The same as the fetcher, without a server | Every host installs it, plus Windows/macOS signing, updates, two platforms. Guests still need the web page. Not worth it. |
| A domain on its own | A nicer address (can point at GitHub Pages and the fetcher) | About £10–15 a year; purely cosmetic |

**Recommended path:**
1. **The redesign (option B above).** The app hosts, so anyone can host the games that need no site: the bracket,
   trivia, the clue race, generated sudokus. You keep the connector for Courier Mail.
2. **The fetcher**, when paste-a-URL is wanted: then anyone can host Guardian, Crosshare and CTC/SudokuPad puzzles
   with nothing installed. Courier Mail stays with whoever has a subscription and the connector.
3. **A server for rooms, and a domain**, only if peer-to-peer proves unreliable or public lobbies and accounts are
   wanted. The redesign keeps the host engine a plain module, so it could move onto a server later without a
   rewrite.

**Hosting and lobbies:** the app's home screen gets "Host a game". You pick the game, get a lobby with the invite link
(or a short room code), and friends join. Race mode's lobby already works this way.

**Non-puzzle games:** yes. The game-kind layer (above) takes any game that suits a host-run room: trivia, the
bracket, word and drawing games, party games, anything turn-based or casual. Fast real-time games would suffer from
going through the host's connection, so those aren't a good fit.

## Decision needed

Go with option B before the expansion? Or keep the extension as host and add game kinds to it (option A)?
