# To do: notes from the first real session (2026-10-03)

The host's notes from playing with friends on 0.5.0, in the order they matter most, with what we plan to do.
Status: ⏳ to do, ❓ needs a decision, ✅ done. All done in 0.6.0 (2026-10-04) and checked end to end on both test
sites (`npm run e2e`), except where a row says otherwise.

## Status (2026-10-04)

Built as 0.6.0, merged into `main` and deployed. Checks before merging:
- `npm run e2e` passed in full: co-op and race, on Crosshare and the Vox PuzzleMe puzzle.
- The new guest page passed `main`'s previous tests against the installed 0.5.0 extension, every co-op and race check
  on both sites. Only the selectors for the moved Replay button and the floating messages were updated in that copy.

Left for the host: build and sign 0.6.0 and install it, then try it in a real session.

## Big decision

| # | Note | Plan | Status |
|---|---|---|---|
| 1 | Maybe don't fill in the real crossword until our tool has the whole grid right. The host plays in the full view and everyone plays only there until it's complete. | The background page holds the letters, the way race mode already does. The real site only supplies the puzzle and its answers. Once the grid is right, the host gets a button to fill it in on the site. This also fixes #2, #4, #5 and #6, and most of #7. | ✅ Play in our tool |
| 2 | In the full view, letters typed by the host didn't reach the real crossword. Crosshare pauses when its tab loses focus; the host turned that off in Crosshare's settings. Courier Mail not checked. | Goes away with #1. Without #1: tell the host about the setting, or bring the crossword tab forward while typing. | ✅ |
| 3 | With a session open, opening another crossword in another tab takes the session over, and you can't switch back to the first crossword. | Keep the session on the crossword it started with. Another tab's crossword only takes over when the host presses "Play it instead" in the sidebar or full view. | ✅ |

## Checking and finishing

| # | Note | Plan | Status |
|---|---|---|---|
| 4 | Crosshare's own Check marks aren't passed to the guests. | Our own Check, using the answers the extension already reads for races. Wrong squares are marked for everyone. Square, answer or whole grid. | ✅ Host only |
| 5 | The site's dialog when the grid is full, wrong or right, isn't passed to the guests. | Our own message to everyone: "Not quite" when the grid is full but wrong, and "Solved!" when it's right. | ✅ |
| 6 | Badges on the real site's clue list stack sideways and cover the clue (screenshot 2). | Nothing needed if the host only uses the full view (#1). Otherwise stack them more compactly. | ✅ |

## Suggestions

| # | Note | Plan | Status |
|---|---|---|---|
| 7 | Example: PLANK suggested for 1A and PETAL for 1D. Accepting PLANK, without accepting PETAL, didn't fill in the shared P. | Find out why and fix it, with a test. | ✅ The cause was on the guest's side: suggesting PETAL cleared the P draft that PLANK still needed, so PLANK went as _LANK. A shared square's draft now stays while the crossing answer has other drafts (unit tested). |
| 8 | Players should be able to delete their own suggestions. | "✕ Take back" on your own suggestion, beside the clue lists. | ✅ |
| 9 | Newer suggestions for the same squares should override older ones without deleting them. Suggesting single squares one at a time currently wipes the earlier ones, because the other squares are sent blank. | Same player, same clue: new letters merge into the earlier suggestion. Blanks keep the earlier letters, and new letters replace old ones in the same square. | ✅ |
| 26 | The host should be able to suggest too, when not confident. | A "Write in / Suggest" switch on the host's full view. Suggest works like a guest's: drafts, then Enter. With trusted friends on, the host's own suggestions still wait for someone to agree. | ✅ |
| 10 | Finishing an answer jumps to the next clue, so Enter then suggests the wrong clue. | Guests in co-op stay on the answer they've just filled. Typing straight in, as the host or a racer, still moves on. | ✅ |

## Grid, clues and layout

| # | Note | Plan | Status |
|---|---|---|---|
| 11 | Player badges in the clue lists change how the clue text wraps (screenshot 1). | Badges sit in a fixed spot that doesn't affect the text. | ✅ |
| 12 | Completed clues should be greyed out, like Crosshare (screenshot 1). | Grey a clue in the lists once all its squares are filled. | ✅ |
| 13 | Word-break bars and hyphens should be white, and the word-break bars a bit thinner. | Style change. | ✅ |
| 14 | Courier Mail: the space between a clue and its "(5)" is missing. | Read the enumeration with a space before it. | ✅ Unit tested; not checked on Courier Mail itself (the automated test uses Vox, whose clues have no enumerations). |
| 15 | Banners above the puzzle (e.g. a race's "Not quite") push the puzzle down. No banner should move it. | Banners float over the page instead of taking space. | ✅ |
| 16 | The host's and guests' pages are a bit small; they should fill the tab. | Widen the layout and size the grid to the window. | ✅ |
| 17 | Zooming: on bigger crosswords other people's corner letters get tiny. | Zoom buttons for the grid (remembered per person), with the corner letters scaling with the squares. | ✅ |

## Players

| # | Note | Plan | Status |
|---|---|---|---|
| 18 | The join screen should list the players already there and their colours. | Show them on the join screen. | ✅ |
| 19 | Players should be able to change their name and colour mid-game. | A "Change your name or colour" button that reopens the picker; the host already has this in the sidebar. | ✅ |

## Tools

| # | Note | Plan | Status |
|---|---|---|---|
| 20 | Anagram pad: picking a letter only puts it in the first empty square. You should be able to place letters in any order, anywhere. | Click a square on the pad to choose where the next letter goes, and click a placed letter to send it back to the ring. | ✅ |
| 21 | Anagram pad: letters already in the answer's squares should be taken off the ring if they were typed in with the rest. | Leave those letters off the ring. | ✅ |
| 22 | A scratchpad to type freely in, below the puzzle, behind a button. | Private notes per player, kept per puzzle. | ✅ |
| 25 | A definition tool, so players can look up what a word means. | A "Define" tool beside Anagram: type a word and see its meanings and synonyms, from the free Datamuse service (no key needed; only the looked-up word is sent). | ✅ |

## Race

| # | Note | Plan | Status |
|---|---|---|---|
| 23 | In race mode the host's full view has no way to join as a player. | Check why Play isn't showing (it's in the lobby when a session is live) and make it obvious. | ✅ It was a small "Play" button in the lobby only. Now "Join as a racer" in the race header, in the lobby and during the race. |
| 24 | The winner gets no Replay while waiting for the others to finish. | Finished racers can watch the race. They know every answer by then, so it gives nothing away. | ✅ Everyone's live boards |
