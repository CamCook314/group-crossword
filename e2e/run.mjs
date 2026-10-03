// End-to-end check in real Firefox: the extension on live crossword sites as the host,
// plus a guest page in a second Firefox, connected over WebRTC through the public PeerJS server.
//
//   npm run build && npm run e2e              both sites
//   npm run e2e -- puzzleme                   just one (crosshare | puzzleme)
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots of the overlay and guest view.
import { writeFileSync } from 'node:fs';
import { By, Key } from 'selenium-webdriver';
import { buildExtension, chosenSites, guestUrl, launch, openSidebarTab, SITES, startGuestServer, step, switchToNewWindow, until } from './helpers.mjs';

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
  await join(ana, 'Ana', ANA_COLOR);
  const sidebar = async () => host.switchTo().window(sidebarWindow);
  await sidebar();
  const anaDot = await until('Ana in the players list', () => host.findElement(By.xpath("//ul[@class='players']/li[contains(., 'Ana')]/span[@class='dot']")));
  const anaRgb = await anaDot.getCssValue('background-color');
  if (anaRgb !== 'rgb(18, 171, 52)') throw new Error(`Ana's colour is ${anaRgb}`);
  step(`session ${roomId} is live; Sam and Ana joined (Ana picked ${ANA_COLOR} on the colour wheel)`);

  const letter = (guest, cell) => guest.findElement(By.css(`.cell[data-cell="${cell}"] .letter`)).getText();
  const marks = async guest => (await guest.findElements(By.css('.mark'))).length;
  const both = async check => (await check(sam)) && (await check(ana));

  for (const name of sites) {
    const site = SITES[name];
    console.log(`${name}:`);
    await host.switchTo().window(siteWindow);
    await site.open(host);
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
    /** With SHOTS=1, saves the host's overlay, Sam's view and the sidebar. */
    const shots = async label => {
      if (!process.env.SHOTS) return;
      await onSite();
      await host.switchTo().defaultContent();
      const frame = (await host.findElements(By.css('iframe[src*="amuselabs"]')))[0];
      writeFileSync(`e2e/.artifacts/${name}${label}-host.png`, await (frame ?? host).takeScreenshot(true), 'base64');
      writeFileSync(`e2e/.artifacts/${name}${label}-guest.png`, await sam.takeScreenshot(), 'base64');
      await sidebar();
      await host.manage().window().setRect({ width: 360, height: 900 });
      writeFileSync(`e2e/.artifacts/${name}${label}-sidebar.png`, await host.takeScreenshot(), 'base64');
    };
    const siteCellCount = await host.executeScript(`return document.querySelectorAll(arguments[0]).length`, site.cells);
    await until('guests have the same grid', () => both(async g => (await g.findElements(By.css('.grid .cell'))).length === siteCellCount), 30000);
    const clueCount = (await sam.findElements(By.css('.clue-list li'))).length;
    if (clueCount < 20) throw new Error(`only ${clueCount} clues`);
    if ((await sam.findElement(By.css('.cell[data-cell="0"] .num')).getText()) !== '1') throw new Error('test assumes 1A and 1D start in cell 0');
    // Clue numbers go up within each list (a linked clue once read "4" plus its link "7" as 47).
    for (const list of await sam.findElements(By.css('.clue-list'))) {
      const nums = (await Promise.all((await list.findElements(By.css('.n'))).map(n => n.getText()))).map(Number);
      if (nums.some((n, i) => i > 0 && n <= nums[i - 1])) throw new Error(`clue numbers out of order: ${nums.join(', ')}`);
    }
    step(`guests see the ${siteCellCount}-cell grid and ${clueCount} clues`);

    // The extension found this puzzle's answers (every white square), for race mode.
    const whiteSquares = (await sam.findElements(By.css('.grid .cell:not(.block)'))).length;
    await sidebar();
    await until(`sidebar shows ${whiteSquares} answers`, async () => (await host.findElement(By.css('.answers')).getText()) === `Answers: ${whiteSquares} squares ✓`, 30000);
    step(`the extension read the answers: ${whiteSquares} squares`);

    // Word breaks from the enumerations (Crosshare's cryptic has them; Vox's puzzle doesn't).
    if (name === 'crosshare') {
      const guestBreaks = (await sam.findElements(By.css('.grid .cell.brk-r, .grid .cell.brk-b, .grid .cell.hyp-r, .grid .cell.hyp-b'))).length;
      await onSite();
      const overlayBreaks = await until('word breaks on the real crossword', () =>
        host.executeScript(`return document.getElementById('group-crossword-overlay')?.shadowRoot.querySelectorAll('.break').length`),
      );
      if (!guestBreaks) throw new Error('no word breaks on the guest grid');
      step(`word breaks: ${guestBreaks} on the guest grid, ${overlayBreaks} drawn on the real crossword`);
    }

    // Host types on the real site.
    await onSite();
    await (await host.findElements(By.css(site.cells)))[0].click();
    await host.actions().sendKeys('q').perform();
    await until('guests see host letter', () => both(async g => (await letter(g, 0)) === 'Q'));
    step('host typed Q on the site and both guests see it');

    // Sam suggests 1A and Ana 1D, both starting on the host's Q (clicking a clue jumps to its first empty square,
    // so step back). Wide letters check that nothing spills out of its square.
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

    await onSite();
    const overlay = await until('overlay', async () => {
      const r = await host.executeScript(
        `const root = document.getElementById('group-crossword-overlay')?.shadowRoot;
         if (!root) return null;
         const cells = document.querySelectorAll(arguments[0]);
         const marks = [...root.querySelectorAll('.mark')].map(m => {
           const a = m.getBoundingClientRect(), c = cells[m.dataset.cell].getBoundingClientRect();
           return { text: m.textContent, cell: Number(m.dataset.cell), left: a.left,
                    inside: a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom };
         });
         // Where the "1" printed in the first square ends.
         const num = [...cells[0].querySelectorAll('*')].find(el => !el.childElementCount && el.textContent.replace(/\\D/g, '') === '1');
         const range = document.createRange();
         range.selectNodeContents(num);
         return { marks, numberRight: range.getBoundingClientRect().right, badges: [...root.querySelectorAll('.badge')].map(b => b.title) };`,
        site.cells,
      );
      return r && r.marks.length === 4 && r.badges.length === 2 && r;
    });
    const spilled = overlay.marks.filter(m => !m.inside).map(m => m.text);
    if (spilled.length) throw new Error(`overlay letters spill out of their squares: ${spilled}`);
    const [first, second] = overlay.marks.filter(m => m.cell === 0);
    if (first.text !== 'W' || second.text !== 'A' || !(second.left < first.left)) throw new Error('overlay corners in the wrong order');
    if (second.left < overlay.numberRight) throw new Error('top-left letter overlaps the clue number');
    await shots('');
    step(`overlay: ${overlay.marks.map(m => m.text).join(',')} inside their squares; W top-right, A top-left after the number; badges for ${overlay.badges.join(' and ')}`);

    // Ana backs Sam's 1A with 👍 Agree: the letters combine into one grey letter each, top-right,
    // and the host sees one combined card at the top of the list (above Ana's earlier 1D).
    await ana.findElement(By.css('li[data-clue="1A"]')).click();
    const agreeButton = await until("Sam's 1A in Ana's agree strip", () => ana.findElement(By.css('.agree-item[data-clue="1A"] button.agree')));
    await shot(ana, `${name}-agree`);
    await agreeButton.click();
    const GREY = 'rgb(138, 138, 138)';
    await until('agreed letters shown once, in grey, top-right', () =>
      both(async g => {
        const cell0 = await g.findElements(By.css('.cell[data-cell="0"] .mark'));
        const m0 = await g.findElement(By.css('.cell[data-cell="0"] .mark.m0'));
        return cell0.length === 1 && (await m0.getText()) === 'W' && (await m0.getCssValue('color')) === GREY;
      }),
    );
    await onSite();
    const agreedOverlay = await until('overlay combines the agreed letters', async () => {
      const r = await host.executeScript(
        `return [...document.getElementById('group-crossword-overlay').shadowRoot.querySelectorAll('.mark')]
           .map(m => ({ text: m.textContent, cell: Number(m.dataset.cell), color: getComputedStyle(m).color }));`,
      );
      const cell0 = r.filter(m => m.cell === 0);
      return cell0.length === 1 && cell0[0].text === 'W' && cell0[0].color === GREY && r;
    });
    await sidebar();
    const cards = await until('one combined card on top', async () => {
      const c = await host.findElements(By.css('.suggestion .who'));
      return c.length === 2 && (await c[0].getText()).includes('Sam + Ana') && c;
    });
    await shots('-agreed');
    await sidebar();
    step(`Ana pressed 👍 Agree on Sam's 1A: grey W and M on the guests and the overlay (${agreedOverlay.length} marks), and "${(await cards[0].getText()).replace(/\s+/g, ' ')}" tops the sidebar`);

    // Host accepts the combined card, then undoes it.
    await (await host.findElements(By.xpath("//button[normalize-space(.)='Accept']")))[0].click();
    await until('site has WM', async () => (await siteLetters(0, 1)) === 'WM');
    await until('guests see WM', () => both(async g => (await letter(g, 0)) + (await letter(g, 1)) === 'WM'));
    await sidebar();
    await until('both 1A suggestions cleared', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    step('host accepted the combined 1A: WM typed into the site, synced to both guests, and both suggestions cleared');
    const undoButton = await until('Undo button', () => host.findElement(By.css('button.undo')));
    if (!(await undoButton.getText()).includes('Sam + Ana · 1A')) throw new Error(`undo label: ${await undoButton.getText()}`);
    await undoButton.click();
    await until('site back to Q', async () => (await siteLetters(0, 1)) === 'Q');
    await until('guests see Q again', () => both(async g => (await letter(g, 0)) === 'Q' && (await letter(g, 1)) === ''));
    await sidebar();
    if ((await host.findElements(By.css('button.undo'))).length) throw new Error('undo still offered');
    step('host pressed Undo: the Q came back, the M was cleared, and both guests see it');

    // Host rejects Ana's 1D.
    await host.findElement(By.xpath("//button[normalize-space(.)='Reject']")).click();
    await until('Ana told about rejection', async () => (await ana.findElement(By.css('.toast')).getText()).includes('rejected'));
    await until('marks gone', () => both(async g => (await marks(g)) === 0));
    if ((await siteLetters(0, 1)) !== 'Q') throw new Error('rejected suggestion changed the site');
    step("host rejected Ana's 1D: she was told and nothing was typed");

    // Sam suggests 1D; the host types those same letters on the site, so the suggestion clears by itself.
    const cols = Math.sqrt(siteCellCount);
    if (!Number.isInteger(cols)) throw new Error('test assumes a square grid');
    await sam.findElement(By.css('li[data-clue="1D"]')).click();
    await sam.actions().sendKeys(Key.ARROW_UP, 'zx', Key.ENTER).perform();
    await sidebar();
    await until('sidebar shows Sam\'s 1D', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    await onSite();
    for (const [cell, key] of [[0, 'z'], [cols, 'x']]) {
      await (await host.findElements(By.css(site.cells)))[cell].click();
      await host.actions().sendKeys(key).perform();
    }
    await until('guests see ZX as real letters, marks gone', () =>
      both(async g => (await letter(g, 0)) + (await letter(g, cols)) === 'ZX' && (await marks(g)) === 0),
    );
    await sidebar();
    await until('sidebar queue empty', async () => (await host.findElements(By.css('.suggestion'))).length === 0);
    step("host typed Sam's suggested 1D letters on the site: the suggestion cleared by itself");

    // Typing: Space switches direction, and the crossing clue is highlighted in the list.
    const label = async guest => guest.findElement(By.css('.clue-bar-text b')).getText();
    const before = await label(sam);
    await sam.actions().sendKeys(Key.SPACE).perform();
    const after = await until('Space switches direction', async () => {
      const now = await label(sam);
      return now !== before && now;
    });
    if (!(await sam.findElements(By.css('.clue-list li.crossing'))).length) throw new Error('no crossing clue highlighted');
    step(`Space switched ${before} to ${after}; the crossing clue is highlighted`);

    // Accepting automatically: once two agree, then for trusted friends.
    const acceptMode = async label => {
      await sidebar();
      await host.findElement(By.xpath(`//label[contains(., '${label}')]/input`)).click();
    };
    const selectIn = (guest, cell, clueId) =>
      until(`square ${cell} in ${clueId}`, async () => {
        await guest.findElement(By.css(`.cell[data-cell="${cell}"]`)).click();
        return (await label(guest)) === clueId;
      });
    await acceptMode('once 2 or more agree');
    await selectIn(sam, 1, '1A');
    await sam.actions().sendKeys('p', Key.ENTER).perform();
    await ana.findElement(By.css('li[data-clue="1A"]')).click();
    await (await until("Sam's P in Ana's agree strip", () => ana.findElement(By.css('.agree-item[data-clue="1A"] button.agree')))).click();
    await until('the agreed answer went in by itself', async () => (await siteLetters(1)) === 'P');
    step('setting "once 2 or more agree": Ana agreed with Sam\'s P and it went onto the site by itself');
    await acceptMode('trusted');
    await selectIn(sam, 2, '1A');
    await sam.actions().sendKeys('k', Key.ENTER).perform();
    await until('the trusted answer went in by itself', async () => (await siteLetters(2)) === 'K');
    await acceptMode('When I accept them');
    step('setting "trusted": Sam\'s K went straight onto the site');

    // The anagram pad: a letter placed from the wheel goes into the answer's first empty square, as a draft.
    await selectIn(sam, 3, '1A');
    await sam.findElement(By.xpath("//button[normalize-space(.)='Anagram']")).click();
    await (await until('anagram box', () => sam.findElement(By.css('.anagram-input')))).sendKeys('xy');
    const wheel = await until('two letters on the wheel', async () => {
      const letters = await sam.findElements(By.css('.anagram-letter'));
      return letters.length === 2 && letters;
    });
    await wheel[0].click();
    await shot(sam, `${name}-anagram`);
    await sam.findElement(By.xpath("//div[@class='anagram-actions']/button[normalize-space(.)='Use']")).click();
    await until('anagram letter in the grid as a draft', async () => (await sam.findElements(By.css('.cell[data-cell="3"] .letter.draft'))).length === 1);
    await sam.actions().sendKeys(Key.ESCAPE).perform();
    step('anagram pad: a letter from the wheel went into the first empty square of 1A as a draft');

    // The co-op replay, scrubbed to the end, shows exactly what's on the site.
    await sam.findElement(By.xpath("//div[@class='footer']/button[normalize-space(.)='Replay']")).click();
    await until('replay of the solve so far', async () => Number(await sam.findElement(By.css('.modal .replay-scrubber')).getAttribute('max')) > 0);
    await sam.executeScript(`const s = document.querySelector('.modal .replay-scrubber'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    const everyCell = [...Array(siteCellCount).keys()];
    const onSiteNow = await siteLetters(...everyCell);
    await until('the replay ends where the site is', async () =>
      (await sam.executeScript(`return [...document.querySelectorAll('.modal .replay-boards .cell')].map(c => c.querySelector('.letter')?.textContent || '').join('')`)) === onSiteNow,
    );
    await shot(sam, `${name}-replay`);
    await sam.findElement(By.xpath("//div[@class='modal-head']/button[normalize-space(.)='Close']")).click();
    step('co-op replay: scrubbed to the end, it shows exactly the letters on the site');

    // The host's full view: the same board, and typing there goes straight onto the site.
    await sidebar();
    const windows = await host.getAllWindowHandles();
    await host.findElement(By.xpath("//button[normalize-space(.)='Open full view']")).click();
    const fullView = await switchToNewWindow(host, windows, 'full view');
    await until('full view board', async () => (await host.findElements(By.css('.coop .grid .cell'))).length === siteCellCount);
    await host.findElement(By.css('.coop .cell[data-cell="4"]')).click();
    await host.actions().sendKeys('j').perform();
    await until("the host's letter reached the site", async () => (await siteLetters(4)) === 'J');
    await host.switchTo().window(fullView);
    await host.manage().window().setRect({ width: 1500, height: 1000 });
    await shot(host, `${name}-fullview`);
    await host.close();
    await sidebar();
    step('full view: the host typed J on the board there and it went onto the real crossword');
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
