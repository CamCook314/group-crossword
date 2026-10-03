# Group Crossword

Solve crosswords on Crosshare or Courier Mail together. The host opens the crossword in Firefox and everyone plays in
Group Crossword's copy of it: the host on a full-page view, friends from a link, suggesting answers that the host
accepts or rejects. Once it's solved, one click fills it in on the real site.
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
4. **Open full view** and play there: **Write in** puts your letters straight into the grid, **Suggest** makes them a
   suggestion like everyone else's (for when you're not sure). Once play starts there, the crossword's own page is left
   alone (it says so); letters typed on it aren't shared.
5. Suggestions appear beside the board (and in the sidebar), and in the corners of the squares. **Accept** puts them in;
   **Reject** tells the guest; **Undo accept** puts back whatever the last accepted suggestion changed. Identical
   suggestions from several people combine into one card at the top of the list.
6. Choose when friends' answers go in: when you accept them, automatically once 2 or more agree, or automatically
   (for trusted friends; your own suggestions still wait for someone to agree).
7. **Check** a square, the answer or the whole grid: wrong squares turn red for everyone.
8. When it's solved, everyone sees "Solved! 🎉" and you get **Fill in the crossword**, which types it into the real site.

Opening another crossword in another tab doesn't disturb the session: the full view and sidebar offer **Play it instead**.

### Racing

1. In the sidebar, switch to **Race** and press **Open full view**.
2. Start the session there and send the link. People who join wait in the lobby. To race a different crossword,
   open it and press **Play it instead** in the lobby.
3. Pick the settings: whether racers see how far everyone else has got, and an optional time penalty (with a cooldown)
   for a full grid that's wrong.
4. **Start race**: a 3-2-1 countdown, then everyone races on their own grid. The full view shows every board with
   % correct, times and places. **Join as a racer** opens your own racing window. Racers who finish can watch
   everyone else's grid live.
5. The race ends when everyone has finished, or when you press **End race**; everyone then sees the results: those who
   finished by time, then everyone else by squares correct, and a replay of the race. **New race** goes back to the lobby.

Races need the puzzle's answers, which the extension reads from the page ("Answers: N squares ✓" on the full view).
If you race yourself, don't look at the full view or the crossword tab while you do.

## Guests

Open the link and pick a name and colour (the rainbow swatch opens a colour wheel); the join screen shows who's already
there. Click a clue or square and type to draft letters, press **Enter** to suggest them (partial answers are fine;
suggesting more letters for the same clue adds to your suggestion), **Esc** to clear. Suggestions show in the corners of the
squares, filled top-right, top-left, bottom-left, bottom-right in the order they were made; a letter several people agree on
shows once, in grey, top-right. Each player's initial sits next to the clue they're on.

- **👍 Agree** (beside the clue lists) backs someone else's suggestion for the clue you're on, without retyping it;
  **✕ Take back** withdraws yours.
- **Space** switches direction; **Tab** goes to the next clue. Filled squares are skipped as you type, and finished
  clues are greyed out.
- **Anagram**: type the letters, click a square to choose where the next one goes, click letters into the answer's
  squares, then **Use**. **Define** looks up a word's meanings and synonyms.
- Under the grid: **−** / **+** zoom, **Notes** opens a private scratchpad, **Replay** plays back the solve so far.
- **Change your name or colour** (at the bottom) works mid-game.

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
