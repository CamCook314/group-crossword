# To do: notes from the first real session (2026-10-03)

The host's notes from playing with friends on 0.5.0, in the order they matter most, with what we plan to do.
Status: ⏳ to do, ❓ needs a decision, ✅ done.

## Big decision

| # | Note | Plan | Status |
|---|---|---|---|
| 1 | Maybe don't fill in the real crossword until our tool has the whole grid right. The host plays in the full view and everyone plays only there until it's complete. | The background page holds the letters, the way race mode already does. The real site only supplies the puzzle and its answers. Once the grid is right, the host gets a button to fill it in on the site. This also fixes #2, #4, #5 and #6, and most of #7. | ❓ |
| 2 | In the full view, letters typed by the host didn't reach the real crossword. Crosshare pauses when its tab loses focus; the host turned that off in Crosshare's settings. Courier Mail not checked. | Goes away with #1. Without #1: tell the host about the setting, or bring the crossword tab forward while typing. | ⏳ |
| 3 | With a session open, opening another crossword in another tab takes the session over, and you can't switch back to the first crossword. | Keep the session on the crossword it started with. Another tab's crossword only takes over when the host presses "Use this crossword" in the sidebar or full view. | ⏳ |

## Checking and finishing

| # | Note | Plan | Status |
|---|---|---|---|
| 4 | Crosshare's own Check marks aren't passed to the guests. | Our own Check, using the answers the extension already reads for races. Wrong squares are marked for everyone. | ❓ who can check (host only, or everyone), and what (square, answer, grid) |
| 5 | The site's dialog when the grid is full, wrong or right, isn't passed to the guests. | Our own message to everyone: "Not quite" when the grid is full but wrong, and "Solved!" when it's right. | ⏳ |
| 6 | Badges on the real site's clue list stack sideways and cover the clue (screenshot 2). | Nothing needed if the host only uses the full view (#1). Otherwise stack them more compactly. | ⏳ |

## Suggestions

| # | Note | Plan | Status |
|---|---|---|---|
| 7 | Example: PLANK suggested for 1A and PETAL for 1D. Accepting PLANK, without accepting PETAL, didn't fill in the shared P. | Find out why and fix it, with a test. | ⏳ |
| 8 | Players should be able to delete their own suggestions. | A ✕ on your own suggestion in the strip under the clue bar. | ⏳ |
| 9 | Newer suggestions for the same squares should override older ones without deleting them. Suggesting single squares one at a time currently wipes the earlier ones, because the other squares are sent blank. | Same player, same clue: new letters merge into the earlier suggestion. Blanks keep the earlier letters, and new letters replace old ones in the same square. | ⏳ |
| 10 | Finishing an answer jumps to the next clue, so Enter then suggests the wrong clue. | Guests in co-op stay on the answer they've just filled. Typing straight in, as the host or a racer, still moves on. | ⏳ |

## Grid, clues and layout

| # | Note | Plan | Status |
|---|---|---|---|
| 11 | Player badges in the clue lists change how the clue text wraps (screenshot 1). | Badges sit in a fixed spot that doesn't affect the text. | ⏳ |
| 12 | Completed clues should be greyed out, like Crosshare (screenshot 1). | Grey a clue in the lists once all its squares are filled. | ⏳ |
| 13 | Word-break bars and hyphens should be white, and the word-break bars a bit thinner. | Style change. | ⏳ |
| 14 | Courier Mail: the space between a clue and its "(5)" is missing. | Read the enumeration with a space before it. | ⏳ |
| 15 | Banners above the puzzle (e.g. a race's "Not quite") push the puzzle down. No banner should move it. | Banners float over the page instead of taking space. | ⏳ |
| 16 | The host's and guests' pages are a bit small; they should fill the tab. | Widen the layout and size the grid to the window. | ⏳ |
| 17 | Zooming: on bigger crosswords other people's corner letters get tiny. | Zoom buttons for the grid (remembered per person), with the corner letters scaling with the squares. | ⏳ |

## Players

| # | Note | Plan | Status |
|---|---|---|---|
| 18 | The join screen should list the players already there and their colours. | Show them on the join screen. | ⏳ |
| 19 | Players should be able to change their name and colour mid-game. | A "You" button that reopens the name and colour picker; the host already has this in the sidebar. | ⏳ |

## Tools

| # | Note | Plan | Status |
|---|---|---|---|
| 20 | Anagram pad: picking a letter only puts it in the first empty square. You should be able to place letters in any order, anywhere. | Click a square on the pad to choose where the next letter goes, and click a placed letter to send it back to the ring. | ⏳ |
| 21 | Anagram pad: letters already in the answer's squares should be taken off the ring if they were typed in with the rest. | Leave those letters off the ring. | ⏳ |
| 22 | A scratchpad to type freely in, below the puzzle, behind a button. | Private notes per player, kept per puzzle. | ⏳ |

## Race

| # | Note | Plan | Status |
|---|---|---|---|
| 23 | In race mode the host's full view has no way to join as a player. | Check why Play isn't showing (it's in the lobby when a session is live) and make it obvious. | ⏳ |
| 24 | The winner gets no Replay while waiting for the others to finish. | Finished racers can watch the race. They know every answer by then, so it gives nothing away. | ❓ live boards, or a replay of the race so far |
