// End-to-end check in real Firefox: the extension on live crossword sites as the host,
// plus a guest page in a second Firefox, connected over WebRTC through the public PeerJS server.
//
//   npm run build && npm run e2e              both sites
//   npm run e2e -- puzzleme                   just one (crosshare | puzzleme)
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots of the overlay and guest view.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { Builder, By, Key } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const EXTENSION_ID = 'group-crossword@camcook314';
const GUEST_PORT = 8123;

/** How to open each test crossword, and how to find its cells, from the host's side. */
const SITES = {
  crosshare: {
    async open(host) {
      await host.get('https://crosshare.org/crosswords/3ytH7Kn9THCUVJgHtwRu/cryptic-51');
      await (await until('Begin Puzzle button', () => host.findElement(By.xpath("//button[normalize-space(.)='Begin Puzzle']")))).click();
    },
    enter: async () => {},
    cells: '[aria-label^="cell"]',
    letter: '[class*="__contents"]',
  },
  // Vox's free crossword uses PuzzleMe, the same player Courier Mail embeds.
  puzzleme: {
    async open(host) {
      await host.get('https://www.vox.com/crossword');
      const picker = await until('PuzzleMe picker', () => host.findElement(By.css('iframe[src*="amuselabs"]')), 40000);
      await host.switchTo().frame(picker);
      await (await until('first puzzle', () => host.findElement(By.css('.puzzle-link')))).click();
      await this.enter(host);
      await until('Play button', async () => {
        const play = (await host.findElements(By.xpath("//button[contains(translate(., 'PLAY', 'play'), 'play')]")))[0];
        if (play && (await play.isDisplayed())) await play.click();
        return (await host.findElements(By.css('.crossword .box'))).length > 0;
      }, 30000);
    },
    async enter(host) {
      await host.switchTo().defaultContent();
      // The picker iframe navigates to the crossword in place, so its src attribute still says date-picker.
      await host.switchTo().frame(await host.findElement(By.css('iframe[src*="amuselabs"]')));
    },
    cells: '.crossword > .box',
    letter: '.letter-in-box',
  },
};

const chosen = process.argv.slice(2).filter(a => a in SITES);
const sites = chosen.length ? chosen : Object.keys(SITES);

execSync('npx web-ext build -s extension/dist -a e2e/.artifacts -n group-crossword.zip --overwrite-dest', { stdio: 'ignore' });

// Serve the built guest page locally.
const server = http
  .createServer((req, res) => {
    const file = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    try {
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'content-type': type }).end(readFileSync(`guest/dist/${file}`));
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(GUEST_PORT);

async function launch(withExtension) {
  const options = new firefox.Options();
  if (!process.env.HEADED) options.addArguments('-headless');
  // System access lets the test open the extension's sidebar page, which WebDriver can't navigate to directly.
  const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  if (withExtension) await driver.installAddon('e2e/.artifacts/group-crossword.zip', true);
  return driver;
}

/** Polls until fn returns something truthy. */
async function until(what, fn, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for: ${what} (last: ${JSON.stringify(last)})`);
}

/** Opens the sidebar page in a new tab. Call it while the browser has a single window. */
async function openSidebarTab(driver) {
  const before = await driver.getAllWindowHandles();
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `const url = WebExtensionPolicy.getByID(arguments[0]).getURL('sidebar.html');
     const { gBrowser } = Services.wm.getMostRecentWindow('navigator:browser');
     gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
    EXTENSION_ID,
  );
  await driver.setContext(firefox.Context.CONTENT);
  const handle = await until('sidebar tab', async () => (await driver.getAllWindowHandles()).find(h => !before.includes(h)));
  await driver.switchTo().window(handle);
  return handle;
}

const step = msg => console.log(`  ✓ ${msg}`);
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
    await guest.get(`http://localhost:${GUEST_PORT}/#${roomId}`);
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
    step(`guests see the ${siteCellCount}-cell grid and ${clueCount} clues`);

    // The extension found this puzzle's answers (every white square), for race mode.
    const whiteSquares = (await sam.findElements(By.css('.grid .cell:not(.block)'))).length;
    await sidebar();
    await until(`sidebar shows ${whiteSquares} answers`, async () => (await host.findElement(By.css('.answers')).getText()) === `Answers: ${whiteSquares} squares ✓`, 30000);
    step(`the extension read the answers: ${whiteSquares} squares`);

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

    // Ana makes the same 1A suggestion as Sam: the letters combine into one grey letter each, top-right,
    // and the host sees one combined card at the top of the list (above Ana's earlier 1D).
    await ana.findElement(By.css('li[data-clue="1A"]')).click();
    await ana.actions().sendKeys(Key.ARROW_LEFT, 'wm', Key.ENTER).perform();
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
    step(`Ana suggested the same 1A: grey W and M on the guests and the overlay (${agreedOverlay.length} marks), and "${(await cards[0].getText()).replace(/\s+/g, ' ')}" tops the sidebar`);

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
