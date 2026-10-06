# Group Crossword

Solve crosswords and sudokus on Crosshare or Courier Mail together, or play a cryptic clue race, trivia or a bracket. Everyone plays in Group Crossword, a web page: the host in a
tab that runs the game, friends from a link, suggesting answers that the host accepts or rejects. A small Firefox
extension, the **connector**, reads the crossword from the site the host has open, and once it's solved, fills it in
there with one click. See [PLAN.md](PLAN.md) for how it works, and [redesign.md](redesign.md) for why it's built this way.

## Host

### Install the connector (once)

The connector needs Firefox 140 or newer. Firefox only installs signed extensions permanently, so it is signed
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

Each new signed build needs a higher `version` in [connector/manifest.json](connector/manifest.json). Most changes
don't need a new connector at all: they're in the web page, which updates when `main` is pushed. If signing fails with
"JWT iat … is invalid", the computer's clock is off: sync it (Settings → Time & language → Sync now) and sign again.
To try a build without signing, `npm run firefox` opens a separate Firefox (its own profile, so log in to Courier Mail
there) with the connector loaded until you close it.

### Each session

1. Open the crossword on Crosshare or Courier Mail and start it.
2. Click the **Group Crossword** toolbar button. It opens Group Crossword in a tab, ready to host (or open
   https://camcook314.github.io/group-crossword/ and press **Host a game**). Set your name and colour with the button
   at the top right.
3. **Start session**, then **Copy** the link and send it to your friends.
4. Play in that tab: **Write in** puts your letters straight into the grid, **Suggest** makes them a suggestion like
   everyone else's (for when you're not sure). Once play starts, the crossword's own page is left alone (it says so);
   letters typed on it aren't shared.
5. Suggestions appear beside the board and in the corners of the squares. **Accept** puts them in; **Reject** tells
   the guest; **Undo accept** puts back whatever the last accepted suggestion changed. Identical suggestions from
   several people combine into one card at the top of the list.
6. Choose when friends' answers go in: when you accept them, automatically once 2 or more agree, or automatically
   (for trusted friends; your own suggestions still wait for someone to agree).
7. **Check** a square, the answer or the whole grid: wrong squares turn red for everyone.
8. When it's solved, everyone sees "Solved! 🎉" and you get **Fill in the crossword**, which types it into the real site.

Reloading the Group Crossword tab is fine: the game carries on with the same link, and friends reconnect by
themselves. Closing it ends the session (it asks first). Opening another crossword in another tab doesn't disturb the
session: the host's screen offers **Play it instead**.

### Sudokus

Courier Mail's sudokus (PuzzleMe) work like crosswords: open one, and it shows in the host's tab. Select squares
(drag, or Ctrl/Shift-click), type digits; **Corner** and **Centre** (or hold Shift / Ctrl) make pencil marks, which
are yours alone until you press **Share my marks**. Clashes are marked red. Suggestions, Agree, Check and Fill in work
as for crosswords. Races are crosswords only, so far.

### Games without a puzzle

**Clue race**, **Trivia** and **Bracket** (at the top of the host's tab) need no crossword and no extension: anyone can
open https://camcook314.github.io/group-crossword/, press **Host a game**, and send the link. The host plays too.
- **Clue race:** one cryptic clue at a time; first right answer scores most; the definition is underlined at half time.
- **Trivia:** pick a category, difficulty and number of questions; everyone answers privately, then sees who was right.
- **Bracket:** name a category; everyone puts forward an option; vote through the knockout until one is left.

### Racing

1. In the host's tab, switch to **Race**.
2. Start the session and send the link. People who join wait in the lobby. To race a different crossword, open it and
   press **Play it instead** in the lobby.
3. Pick the settings: whether racers see how far everyone else has got, and an optional time penalty (with a cooldown)
   for a full grid that's wrong.
4. **Start race**: a 3-2-1 countdown, then everyone races on their own grid. The host's screen shows every board with
   % correct, times and places. **Join as a racer** opens your own racing tab. Racers who finish can watch everyone
   else's grid live.
5. The race ends when everyone has finished, or when you press **End race**; everyone then sees the results: those who
   finished by time, then everyone else by squares correct, and a replay of the race. **New race** goes back to the lobby.

Races need the puzzle's answers, which the connector reads from the page ("Answers: N squares ✓" in the lobby).
If you race yourself, don't look at the host's screen or the crossword tab while you do.

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
- If the connection drops (or the host reloads), the page reconnects by itself.

## Development

| Command | |
|---|---|
| `npm run build` | Build the app (`app/dist`) and the connector (`connector/dist`) |
| `npm run dev:app` | The app with rebuild-on-save at `http://localhost:8000/` (`#host` to host; the connector works on localhost too) |
| `npm test` / `npm run typecheck` | Unit tests / type check |
| `npm run e2e` | End-to-end checks in real Firefox against live Crosshare and free PuzzleMe puzzles: co-op, a race, a sudoku, then the games. Needs internet. |
| `npm run e2e:sudoku` / `npm run e2e:games` | A co-op sudoku (Amuse Labs' PuzzleMe demo); the games without a puzzle (hosted with no extension). |
| `npm run e2e:coop` / `npm run e2e:race` | Just one of them. `HEADED=1` to watch, `SHOTS=1` to save screenshots, `-- crosshare` or `-- puzzleme` for one site. |
| `npm run firefox` | Run Firefox with the connector temporarily installed |

Pushing to `main` deploys the app to https://camcook314.github.io/group-crossword/ (repo Settings → Pages → Source: GitHub Actions).
