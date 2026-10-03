# Group Crossword

Solve crosswords on Crosshare or Courier Mail together. The host plays on the real site in Firefox;
friends join from a link, pick clues, and suggest answers that the host accepts or rejects.
See [PLAN.md](PLAN.md) for how it works.

## Host

### Install the extension (once)

The extension needs Firefox 140 or newer. Firefox only installs signed extensions permanently, so it is signed
by Mozilla as *unlisted*: free, automatic, and not published on the add-ons store.

1. Get API credentials (free Mozilla account): https://addons.mozilla.org/developers/addon/api/key/
2. Build and sign:
   ```powershell
   npm install
   npm run build
   $env:WEB_EXT_API_KEY = '...'; $env:WEB_EXT_API_SECRET = '...'
   npm run sign
   ```
3. In Firefox: `about:addons` → gear icon → **Install Add-on From File…** → pick the `.xpi` in `web-ext-artifacts/`.
   Firefox will ask to allow sharing website content: that's the crossword being sent to your friends.

Each new signed build needs a higher `version` in [extension/manifest.json](extension/manifest.json).
To try a build without signing, `npm run firefox` opens a separate Firefox (its own profile, so log in to Courier Mail
there) with the extension loaded until you close it. Loading it through `about:debugging` alongside the installed signed
copy doesn't work.

### Each session

1. Open the crossword on Crosshare or Courier Mail and start it.
2. Click the **Group Crossword** toolbar button (or View → Sidebar) to open the sidebar. Set your name and colour
   (a preset, or the rainbow swatch for a colour wheel).
3. **Start session**, then **Copy** the link and send it to your friends.
4. Suggestions appear in the sidebar, and faintly in the corners of your real grid. **Accept** types them in; **Reject** tells the guest;
   **Undo accept** puts back whatever the last accepted suggestion changed. Identical suggestions from several people combine
   into one card at the top of the list.

### Racing

1. In the sidebar, switch to **Race** and press **Open race view** (a full page).
2. Start the session there and send the link. People who join wait in the lobby.
3. Pick the settings: whether racers see how far everyone else has got, and an optional time penalty (with a cooldown)
   for a full grid that's wrong.
4. **Start race**: a 3-2-1 countdown, then everyone races on their own grid. The race view shows every board with
   % correct, times and places. **Play** opens your own racing window.
5. The race ends when everyone has finished, or when you press **End race**; everyone then sees the results.
   **New race** goes back to the lobby.

Races need the puzzle's answers, which the extension reads from the page ("Answers: N squares ✓" on the race view).
If you race yourself, don't look at the race view or the crossword tab while you do.

## Guests

Open the link and pick a name and colour (the rainbow swatch opens a colour wheel). Click a clue or square and type to draft
letters, press **Enter** to suggest them (partial answers are fine), **Esc** to clear. Suggestions show in the corners of the
squares, filled top-right, top-left, bottom-left, bottom-right in the order they were made; a letter several people agree on
shows once, in grey, top-right. Each player's initial sits next to the clue they're on.

## Development

| Command | |
|---|---|
| `npm run build` | Build the guest page (`guest/dist`) and extension (`extension/dist`) |
| `npm run dev:guest` | Guest page with rebuild-on-save at `http://localhost:8000/#<room id>` |
| `npm test` / `npm run typecheck` | Unit tests / type check |
| `npm run e2e` | End-to-end checks in real Firefox against live Crosshare and a free PuzzleMe (Vox) puzzle: co-op, then a race. Needs internet. |
| `npm run e2e:coop` / `npm run e2e:race` | Just one of them. `HEADED=1` to watch, `SHOTS=1` to save screenshots, `-- crosshare` or `-- puzzleme` for one site. |
| `npm run firefox` | Run Firefox with the extension temporarily installed |

Pushing to `main` deploys the guest page to https://camcook314.github.io/group-crossword/ (repo Settings → Pages → Source: GitHub Actions).
