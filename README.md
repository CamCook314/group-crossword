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
To try it without signing, `npm run firefox` opens a separate Firefox with the extension loaded until you close it.

### Each session

1. Open the crossword on Crosshare or Courier Mail and start it.
2. Click the **Group Crossword** toolbar button (or View → Sidebar) to open the sidebar. Set your name and colour
   (a preset, or the rainbow swatch for a colour wheel).
3. **Start session**, then **Copy** the link and send it to your friends.
4. Suggestions appear in the sidebar, and faintly in the corners of your real grid. **Accept** types them in; **Reject** tells the guest;
   **Undo accept** puts back whatever the last accepted suggestion changed. Identical suggestions from several people combine
   into one card at the top of the list.

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
| `npm run e2e` | End-to-end check in real Firefox against live Crosshare and a free PuzzleMe (Vox) puzzle. Needs internet. `HEADED=1` to watch, `SHOTS=1` to save screenshots, `-- crosshare` or `-- puzzleme` for one site. |
| `npm run firefox` | Run Firefox with the extension temporarily installed |

Pushing to `main` deploys the guest page to https://camcook314.github.io/group-crossword/ (repo Settings → Pages → Source: GitHub Actions).
