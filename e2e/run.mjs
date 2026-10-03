// End-to-end check of co-op in real Firefox: the extension on live crossword sites as the host, plus two guests in
// other Firefoxes, connected over WebRTC through the public PeerJS server.
//
//   npm run build && npm run e2e              both sites
//   npm run e2e -- puzzleme                   just one (crosshare | puzzleme)
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots of the guest view, the sidebar and the full view.
import { writeFileSync } from 'node:fs';
import { By, Key } from 'selenium-webdriver';
import { buildExtension, chosenSites, guestUrl, launch, openSidebarTab, readSite, SITES, startGuestServer, step, switchToNewWindow, until } from './helpers.mjs';

const sites = chosenSites();
const shot = async (driver, file) => process.env.SHOTS && writeFileSync(`e2e/.artifacts/${file}.png`, await driver.takeScreenshot(), 'base64');
buildExtension();
const server = startGuestServer();
const ANA_COLOR = '#12ab34';

const host = await launch(true);
const sam = await launch(false);
const ana = await launch(false);
try {
  // The sidebar and the crossword get a window each, so the crossword tab stays visible.
  const sidebarWindow = await openSidebarTab(host);
  await host.switchTo().newWindow('window');
  const siteWindow = await host.getWindowHandle();
  await host.switchTo().window(sidebarWindow);

  // --- Host starts a session; two guests join (Ana with a custom colour from the colour wheel) ---
  await (await until('Start button', () => host.findElement(By.xpath("//button[normalize-space(.)='Start session']")))).click();
  await until('session live', async () => (await host.findElement(By.css('.status')).getText()) === 'Live', 30000);
  const roomId = new URL(await host.findElement(By.css('.link input')).getAttribute('value')).hash.slice(1);
  async function join(guest, name, customColor) {
    await guest.get(guestUrl(roomId));
    await (await until('name box', () => guest.findElement(By.css('.join input')))).sendKeys(name);
    if (customColor) {
      await guest.findElement(By.css('.swatch[title="Any colour"]')).click();
      await guest.findElement(By.css('input.hex')).sendKeys(Key.END, ...Array(7).fill(Key.BACK_SPACE), customColor);
    }
    await guest.findElement(By.css('.join button[type=submit]')).click();
    await until(`${name} waiting for a puzzle`, async () => (await guest.findElement(By.css('body')).getText()).includes('Waiting for the host'), 30000);
  }
  await join(sam, 'Sam');
  // Ana sees who's already here before she joins.
  await ana.get(guestUrl(roomId));
  await until("Sam on Ana's join screen", async () => (await ana.findElement(By.css('.join .already')).getText()).includes('Sam'), 30000);
  await join(ana, 'Ana', ANA_COLOR);
  const sidebar = async () => host.switchTo().window(sidebarWindow);
  await sidebar();
  const anaDot = await until('Ana in the players list', () => host.findElement(By.xpath("//ul[@class='players']/li[contains(., 'Ana')]/span[@class='dot']")));
  const anaRgb = await anaDot.getCssValue('background-color');
  if (anaRgb !== 'rgb(18, 171, 52)') throw new Error(`Ana's colour is ${anaRgb}`);
  step(`session ${roomId} is live; Ana saw Sam on the join screen, then joined (with ${ANA_COLOR} from the colour wheel)`);

  // A guest's letter in a square: the shared grid's, not a draft.
  const letter = (guest, cell) => guest.findElement(By.css(`.cell[data-cell="${cell}"] .letter`)).getText();
  const marks = async guest => (await guest.findElements(By.css('.mark'))).length;
  const both = async check => (await check(sam)) && (await check(ana));
  const label = async driver => driver.findElement(By.css('.clue-bar-text b')).getText();
  /** Clicks a square until it's selected in the given clue (clicking the selected square switches direction). */
  const selectIn = (driver, cell, clueId) =>
    until(`square ${cell} in ${clueId}`, async () => {
      await driver.findElement(By.css(`.main .cell[data-cell="${cell}"]`)).click();
      return (await label(driver)) === clueId;
    });
  const agree = async (guest, clueId) =>
    (await until(`a suggestion to agree with on ${clueId}`, () => guest.findElement(By.css(`.agree-item[data-clue="${clueId}"] button.agree`)))).click();
  const acceptMode = async text => {
    await sidebar();
    await host.findElement(By.xpath(`//label[contains(., '${text}')]/input`)).click();
  };
  let fullView = null;

  for (const [i, name] of sites.entries()) {
    const site = SITES[name];
    console.log(`${name}:`);
    await host.switchTo().window(siteWindow);
    const onSite = async () => {
      await host.switchTo().window(siteWindow);
      await site.enter(host);
    };
    const siteLetters = async (...cells) => {
      await onSite();
      return host.executeScript(
        `const cells = document.querySelectorAll(arguments[0]);
         return arguments[2].map(i => cells[i].querySelector(arguments[1])?.textContent.trim() || '').join('');`,
        site.cells, site.letter, cells,
      );
    };
    const before = i > 0 && (await sam.findElements(By.css('.clue-list li'))).length;
    await site.open(host);
    if (i > 0) {
      // Opening another crossword mid-session doesn't take over: it's offered.
      await sidebar();
      const offer = await until('the new crossword offered', () => host.findElement(By.xpath("//button[normalize-space(.)='Play it instead']")), 30000);
      if ((await sam.findElements(By.css('.clue-list li'))).length !== before) throw new Error('the new crossword took over by itself');
      await offer.click();
      step('the new crossword was offered rather than taking over; "Play it instead" switched everyone to it');
      await onSite();
    }
    const siteCellCount = await host.executeScript(`return document.querySelectorAll(arguments[0]).length`, site.cells);
    // (The two test puzzles have different numbers of clues.)
    await until('guests have the same grid', () =>
      both(async g => (await g.findElements(By.css('.grid .cell'))).length === siteCellCount && (await g.findElements(By.css('.clue-list li'))).length !== before),
    30000);
    const clueCount = (await sam.findElements(By.css('.clue-list li'))).length;
    if (clueCount < 20) throw new Error(`only ${clueCount} clues`);
    if ((await sam.findElement(By.css('.cell[data-cell="0"] .num')).getText()) !== '1') throw new Error('test assumes 1A and 1D start in cell 0');
    // Clue numbers go up within each list (a linked clue once read "4" plus its link "7" as 47).
    for (const list of await sam.findElements(By.css('.clue-list'))) {
      const nums = (await Promise.all((await list.findElements(By.css('.n'))).map(n => n.getText()))).map(Number);
      if (nums.some((n, j) => j > 0 && n <= nums[j - 1])) throw new Error(`clue numbers out of order: ${nums.join(', ')}`);
    }
    step(`guests see the ${siteCellCount}-cell grid and ${clueCount} clues`);

    // The extension found this puzzle's answers (every white square), for Check and races.
    const whiteSquares = (await sam.findElements(By.css('.grid .cell:not(.block)'))).length;
    await sidebar();
    await until(`sidebar shows ${whiteSquares} answers`, async () => (await host.findElement(By.css('.answers')).getText()) === `Answers: ${whiteSquares} squares ✓`, 30000);
    step(`the extension read the answers: ${whiteSquares} squares`);

    // Word breaks from the enumerations (Crosshare's cryptic has them; Vox's puzzle doesn't).
    if (name === 'crosshare') {
      const breaks = (await sam.findElements(By.css('.grid .cell.brk-r, .grid .cell.brk-b, .grid .cell.hyp-r, .grid .cell.hyp-b'))).length;
      if (!breaks) throw new Error('no word breaks on the guest grid');
      step(`word breaks: ${breaks} on the guest grid`);
    }

    // Until play starts in the tool, the grid follows the site.
    await onSite();
    await (await host.findElements(By.css(site.cells)))[0].click();
    await host.actions().sendKeys('q').perform();
    await until('guests see host letter', () => both(async g => (await letter(g, 0)) === 'Q'));
    step('host typed Q on the site and both guests see it (before play starts in the tool, the grid follows the site)');

    // Sam suggests 1A and Ana 1D, both starting on the host's Q (clicking a clue jumps to its first empty square,
    // so step back).
    await sam.findElement(By.css('li[data-clue="1A"]')).click();
    await sam.actions().sendKeys(Key.ARROW_LEFT, 'wm', Key.ENTER).perform();
    await until('Sam sees his marks', async () => (await marks(sam)) === 2);
    await ana.findElement(By.css('li[data-clue="1D"]')).click();
    await ana.actions().sendKeys(Key.ARROW_UP, 'ab', Key.ENTER).perform();
    await until('guests see all four marks', () => both(async g => (await marks(g)) === 4));
    const corner = (guest, sel) => guest.findElement(By.css(`.cell[data-cell="0"] ${sel}`)).getText();
    if ((await corner(sam, '.mark.m0')) !== 'W' || (await corner(sam, '.top-left .mark')) !== 'A') throw new Error('guest corners in the wrong order');
    await sidebar();
    await until('sidebar shows both suggestions', async () => (await host.findElements(By.css('.suggestion'))).length === 2);
    step('Sam suggested WM for 1A and Ana AB for 1D: W top-right, A top-left after the number');

    // Ana backs Sam's 1A with 👍 Agree: the letters combine into one grey letter each, top-right,
    // and the host sees one combined card at the top of the list (above Ana's earlier 1D).
    await ana.findElement(By.css('li[data-clue="1A"]')).click();
    await shot(ana, `${name}-agree`);
    await agree(ana, '1A');
    const GREY = 'rgb(138, 138, 138)';
    await until('agreed letters shown once, in grey, top-right', () =>
      both(async g => {
        const cell0 = await g.findElements(By.css('.cell[data-cell="0"] .mark'));
        const m0 = await g.findElement(By.css('.cell[data-cell="0"] .mark.m0'));
        return cell0.length === 1 && (await m0.getText()) === 'W' && (await m0.getCssValue('color')) === GREY;
      }),
    );
    await sidebar();
    const cards = await until('one combined card on top', async () => {
      const c = await host.findElements(By.css('.suggestion .who'));
      return c.length === 2 && (await c[0].getText()).includes('Sam + Ana') && c;
    });
    await shot(host, `${name}-sidebar`);
    step(`Ana pressed 👍 Agree on Sam's 1A: grey W and M for both guests, and "${(await cards[0].getText()).replace(/\s+/g, ' ')}" tops the sidebar`);

    // Host accepts the combined card: it goes into the shared grid, not the site, which now says so.
    await (await host.findElements(By.xpath("//button[normalize-space(.)='Accept']")))[0].click();
    await until('guests see WM', () => both(async g => (await letter(g, 0)) + (await letter(g, 1)) === 'WM'));
    await sidebar();
    await until('both 1A suggestions cleared', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    if ((await siteLetters(0, 1)) !== 'Q') throw new Error('accepting typed onto the site');
    const notice = await until('the notice on the site', () =>
      host.executeScript(`const n = document.getElementById('group-crossword-notice')?.shadowRoot.querySelector('.note'); return n && !n.hidden && n.textContent;`),
    );
    step(`host accepted the combined 1A: WM in the shared grid for both guests, the site untouched, and it says "${notice}"`);
    await sidebar();
    const undoButton = await until('Undo button', () => host.findElement(By.css('button.undo')));
    if (!(await undoButton.getText()).includes('Sam + Ana · 1A')) throw new Error(`undo label: ${await undoButton.getText()}`);
    await undoButton.click();
    await until('guests see Q again', () => both(async g => (await letter(g, 0)) === 'Q' && (await letter(g, 1)) === ''));
    await sidebar();
    if ((await host.findElements(By.css('button.undo'))).length) throw new Error('undo still offered');
    step('host pressed Undo: the Q came back, the M was cleared, and both guests see it');

    // Host rejects Ana's 1D.
    await host.findElement(By.xpath("//button[normalize-space(.)='Reject']")).click();
    await until('Ana told about rejection', async () => (await ana.findElement(By.css('.toast')).getText()).includes('rejected'));
    await until('marks gone', () => both(async g => (await marks(g)) === 0));
    step("host rejected Ana's 1D: she was told and nothing went in");

    // Typing: Space switches direction, and the crossing clue is highlighted in the list.
    const was = await label(sam);
    await sam.actions().sendKeys(Key.SPACE).perform();
    const now = await until('Space switches direction', async () => {
      const l = await label(sam);
      return l !== was && l;
    });
    if (!(await sam.findElements(By.css('.clue-list li.crossing'))).length) throw new Error('no crossing clue highlighted');
    step(`Space switched ${was} to ${now}; the crossing clue is highlighted`);

    // The host's full view: writing there goes straight into the shared grid; a matching suggestion clears itself.
    if (!fullView) {
      await sidebar();
      const windows = await host.getAllWindowHandles();
      await host.findElement(By.xpath("//button[normalize-space(.)='Open full view']")).click();
      fullView = await switchToNewWindow(host, windows, 'full view');
      await host.manage().window().setRect({ width: 1500, height: 1000 });
    }
    const full = async () => host.switchTo().window(fullView);
    await full();
    await until('full view board', async () => (await host.findElements(By.css('.coop .grid .cell'))).length === siteCellCount);
    const cols = Math.sqrt(siteCellCount);
    if (!Number.isInteger(cols)) throw new Error('test assumes a square grid');
    await sam.findElement(By.css('li[data-clue="1D"]')).click();
    await sam.actions().sendKeys(Key.ARROW_UP, 'zx', Key.ENTER).perform();
    await sidebar();
    await until("sidebar shows Sam's 1D", async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    await full();
    await selectIn(host, 0, '1D');
    await host.actions().sendKeys('zx').perform();
    await until('guests see ZX, marks gone', () => both(async g => (await letter(g, 0)) + (await letter(g, cols)) === 'ZX' && (await marks(g)) === 0));
    await sidebar();
    await until('sidebar queue empty', async () => (await host.findElements(By.css('.suggestion'))).length === 0);
    if ((await siteLetters(0)) !== 'Q') throw new Error('writing in the full view typed onto the site');
    step("full view: the host wrote ZX into 1D; Sam's matching suggestion cleared itself, and the site was left alone");

    // Once play has started in the tool, typing on the site isn't shared.
    await onSite();
    await (await host.findElements(By.css(site.cells)))[2].click();
    await host.actions().sendKeys('y').perform();
    await host.sleep(1500);
    if ((await letter(sam, 2)) === 'Y') throw new Error('typing on the site still reaches the guests');
    step('host typed on the site after play started in the tool: not shared, as the notice says');

    // Accepting automatically: once two agree, then for trusted friends (but the host's own suggestions still wait).
    await acceptMode('once 2 or more agree');
    await selectIn(sam, 1, '1A');
    await sam.actions().sendKeys('p', Key.ENTER).perform();
    await ana.findElement(By.css('li[data-clue="1A"]')).click();
    await agree(ana, '1A');
    await until('the agreed answer went in by itself', () => both(async g => (await letter(g, 1)) === 'P'));
    step('setting "once 2 or more agree": Ana agreed with Sam\'s P and it went in by itself');
    await acceptMode('trusted');
    await selectIn(sam, 2, '1A');
    await sam.actions().sendKeys('k', Key.ENTER).perform();
    await until('the trusted answer went in by itself', () => both(async g => (await letter(g, 2)) === 'K'));
    await full();
    await host.findElement(By.xpath("//span[@class='write-mode']/button[normalize-space(.)='Suggest']")).click();
    await selectIn(host, 3, '1A');
    await host.actions().sendKeys('t', Key.ENTER).perform();
    await sam.findElement(By.css('li[data-clue="1A"]')).click();
    await until("the host's suggestion in Sam's agree strip", () => sam.findElement(By.css('.agree-item[data-clue="1A"]')));
    if ((await letter(sam, 3)) === 'T') throw new Error("the host's suggestion went in without anyone agreeing");
    await agree(sam, '1A');
    await until("the host's T went in once Sam agreed", () => both(async g => (await letter(g, 3)) === 'T'));
    await full();
    await host.findElement(By.xpath("//span[@class='write-mode']/button[normalize-space(.)='Write in']")).click();
    await acceptMode('When I accept them');
    step('setting "trusted": Sam\'s K went straight in; the host\'s own suggestion T waited until Sam agreed');

    // A player's suggestions for the same clue add up, square by square, and they can take them back.
    await selectIn(sam, 1, '1A');
    await sam.actions().sendKeys('e', Key.ENTER).perform();
    await selectIn(sam, 2, '1A');
    await sam.actions().sendKeys('f', Key.ENTER).perform();
    const mine = await until("Sam's merged suggestion", async () => {
      const spans = await sam.findElements(By.css('.agree-item[data-clue="1A"] .letters span:not(.blank)'));
      const text = (await Promise.all(spans.map(s => s.getText()))).join('');
      return text === 'EF' && text;
    });
    await sidebar();
    await until('one card for both squares', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    await sam.findElement(By.css('.agree-item[data-clue="1A"] button.withdraw')).click();
    await until('suggestion taken back', async () => (await host.findElements(By.css('.suggestion'))).length === 0);
    step(`Sam suggested E, then F, for 1A: one suggestion "${mine}"; then he took it back`);

    // The host's Check marks wrong squares for everyone.
    await full();
    await host.findElement(By.xpath("//span[@class='check']/button[normalize-space(.)='Grid']")).click();
    const checked = await until('check result for the guests', async () => {
      const toast = await sam.findElements(By.css('.toast-item'));
      return toast.length && (await toast[0].getText()).startsWith('Checked the grid') && (await toast[0].getText());
    });
    const wrongCount = (await sam.findElements(By.css('.cell.wrong'))).length;
    if (!wrongCount || !checked.includes(`${wrongCount} wrong`)) throw new Error(`check said "${checked}" with ${wrongCount} squares marked`);
    step(`host checked the grid: "${checked}", and the guests see ${wrongCount} squares marked`);

    // The anagram pad: pick a square, then a letter from the wheel; Use puts it there as a draft.
    const acrossClues = await sam.findElements(By.css('.clue-list li[data-clue$="A"]'));
    let emptyCells = null;
    for (const li of acrossClues.slice(1)) {
      await li.click();
      const cells = await sam.executeScript(`return [...document.querySelectorAll('.main .cell.in-clue')].map(c => ({ cell: +c.dataset.cell, letter: c.querySelector('.letter').textContent }))`);
      if (cells.length >= 3 && cells.every(c => !c.letter)) {
        emptyCells = cells.map(c => c.cell);
        break;
      }
    }
    if (!emptyCells) throw new Error('no empty across answer for the anagram pad');
    await sam.findElement(By.xpath("//button[normalize-space(.)='Anagram']")).click();
    await (await until('anagram box', () => sam.findElement(By.css('.anagram-input')))).sendKeys('xy');
    await (await sam.findElements(By.css('button.anagram-slot')))[1].click();
    const wheel = await until('two letters on the wheel', async () => {
      const letters = await sam.findElements(By.css('.anagram-letter'));
      return letters.length === 2 && letters;
    });
    await wheel[0].click();
    await shot(sam, `${name}-anagram`);
    await sam.findElement(By.xpath("//div[@class='anagram-actions']/button[normalize-space(.)='Use']")).click();
    await until('anagram letter in the second square, as a draft', async () => (await sam.findElements(By.css(`.cell[data-cell="${emptyCells[1]}"] .letter.draft`))).length === 1);
    await sam.actions().sendKeys(Key.ESCAPE).perform();
    step('anagram pad: the second square was picked, and a letter from the wheel went there as a draft');

    // Definitions, notes and zoom.
    await sam.findElement(By.xpath("//button[normalize-space(.)='Define']")).click();
    await (await until('define box', () => sam.findElement(By.css('.define-input')))).sendKeys('plank', Key.ENTER);
    const meanings = await until('meanings of "plank"', async () => {
      const items = await sam.findElements(By.css('.define-results li'));
      return items.length && items;
    }, 20000);
    await shot(sam, `${name}-define`);
    await sam.findElement(By.xpath("//div[@class='define-form']/button[@title='Close']")).click();
    await sam.findElement(By.xpath("//div[@class='board-foot']/button[normalize-space(.)='Notes']")).click();
    const drafts = async () => (await sam.findElements(By.css('.letter.draft'))).length;
    const draftsBefore = await drafts();
    await (await until('notes', () => sam.findElement(By.css('textarea.scratchpad')))).sendKeys('abc');
    if ((await drafts()) !== draftsBefore) throw new Error('typing in the notes typed into the grid');
    const width = async () => (await sam.findElement(By.css('.main .grid')).getRect()).width;
    const normal = await width();
    await sam.findElement(By.css('.zoom button[title="Zoom in"]')).click();
    await until('zoomed in', async () => (await width()) > normal * 1.2);
    await sam.findElement(By.css('.zoom button[title="Zoom out"]')).click();
    await until('zoomed back out', async () => Math.abs((await width()) - normal) < 2);
    await sam.findElement(By.xpath("//div[@class='board-foot']/button[normalize-space(.)='Notes']")).click();
    step(`define: ${meanings.length} meanings of "plank"; notes typed without touching the grid; zoom in and back out`);

    // The co-op replay, scrubbed to the end, shows exactly the shared grid.
    await sam.findElement(By.xpath("//div[@class='board-foot']/button[normalize-space(.)='Replay']")).click();
    await until('replay of the solve so far', async () => Number(await sam.findElement(By.css('.modal .replay-scrubber')).getAttribute('max')) > 0);
    await sam.executeScript(`const s = document.querySelector('.modal .replay-scrubber'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    const gridNow = await ana.executeScript(`return [...document.querySelectorAll('.main .grid .cell')].map(c => c.querySelector('.letter')?.textContent || '').join('')`);
    await until('the replay ends where the grid is', async () =>
      (await sam.executeScript(`return [...document.querySelectorAll('.modal .replay-boards .cell')].map(c => c.querySelector('.letter')?.textContent || '').join('')`)) === gridNow,
    );
    await shot(sam, `${name}-replay`);
    await sam.findElement(By.xpath("//div[@class='modal-head']/button[normalize-space(.)='Close']")).click();
    step('co-op replay: scrubbed to the end, it shows exactly the shared grid');

    // A guest can change their name mid-game.
    if (i === 0) {
      const rename = async to => {
        await sam.findElement(By.xpath("//button[normalize-space(.)='Change your name or colour']")).click();
        const input = await until('name box', () => sam.findElement(By.css('.modal .join input')));
        await input.sendKeys(Key.END, ...Array(10).fill(Key.BACK_SPACE), to);
        await sam.findElement(By.css('.modal .join button[type=submit]')).click();
        await sidebar();
        await until(`host sees ${to}`, async () => (await host.findElement(By.css('ul.players')).getText()).includes(to));
      };
      await rename('Samuel');
      await rename('Sam');
      step('Sam renamed himself Samuel mid-game (and back), and the host saw it');
    }

    // Solving: Ana reads the answers from the real site in a window of her own; the host writes them in. Everyone
    // sees it's solved, and the host fills in the real crossword.
    const guestWindow = await ana.getWindowHandle();
    await ana.switchTo().newWindow('window');
    await site.open(ana);
    await site.reveal(ana);
    const answers = await until('revealed grid', async () => {
      await site.enter(ana);
      const letters = await readSite(ana, site);
      return letters.filter(Boolean).length === whiteSquares && letters;
    }, 30000);
    await ana.close();
    await ana.switchTo().window(guestWindow);
    await full();
    await host.executeScript(
      `const port = browser.runtime.connect({ name: 'full' });
       port.postMessage({ type: 'type', cells: arguments[0] });
       setTimeout(() => port.disconnect(), 1000);`,
      answers.flatMap((letter, cell) => (letter ? [{ cell, letter }] : [])),
    );
    await until('everyone sees it solved', () =>
      both(async g => (await g.findElements(By.css('.toast-item.solved'))).length === 1),
    );
    // Every clue is filled in, so every clue is greyed out.
    const greyed = await sam.executeScript(
      `const items = [...document.querySelectorAll('.clue-list li')];
       return items.every(li => li.classList.contains('done')) && getComputedStyle(items[0].querySelector('.t')).color !== getComputedStyle(document.body).color;`,
    );
    if (!greyed) throw new Error("finished clues aren't greyed out");
    const fill = await until('Fill in button', () => host.findElement(By.xpath("//button[normalize-space(.)='Fill in the crossword']")));
    await shot(host, `${name}-fullview`);
    await fill.click();
    const all = [...Array(siteCellCount).keys()];
    await until('the site filled in', async () => (await siteLetters(...all)) === answers.join(''), 30000);
    await full();
    await until('filled in, says the full view', async () => (await host.findElement(By.css('.toast-item.solved')).getText()).includes('Filled in on the site'));
    step('solved: everyone saw "Solved! 🎉", and Fill in typed the grid into the real crossword');
  }
  console.log('\nAll end-to-end checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
  for (const [name, driver] of [['host', host], ['sam', sam], ['ana', ana]]) {
    await driver.switchTo().defaultContent().catch(() => {});
    writeFileSync(`e2e/.artifacts/failure-${name}.png`, await driver.takeScreenshot(), 'base64');
  }
  console.error('Screenshots saved in e2e/.artifacts/');
} finally {
  await Promise.allSettled([host.quit(), sam.quit(), ana.quit()]);
  server.close();
}
