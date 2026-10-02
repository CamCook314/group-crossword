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

const host = await launch(true);
const guest = await launch(false);
try {
  // The sidebar and the crossword get a window each, so the crossword tab stays visible.
  const sidebarWindow = await openSidebarTab(host);
  await host.switchTo().newWindow('window');
  const siteWindow = await host.getWindowHandle();
  await host.switchTo().window(sidebarWindow);

  // --- Host starts a session; guest joins ---
  await (await until('Start button', () => host.findElement(By.xpath("//button[normalize-space(.)='Start session']")))).click();
  await until('session live', async () => (await host.findElement(By.css('.status')).getText()) === 'Live', 30000);
  const roomId = new URL(await host.findElement(By.css('.link input')).getAttribute('value')).hash.slice(1);
  await guest.get(`http://localhost:${GUEST_PORT}/#${roomId}`);
  await (await until('name box', () => guest.findElement(By.css('.join input')))).sendKeys('Sam');
  await guest.findElement(By.css('.join button[type=submit]')).click();
  await until('guest waiting for a puzzle', async () => (await guest.findElement(By.css('body')).getText()).includes('Waiting for the host'), 30000);
  step(`session ${roomId} is live and the guest joined`);

  const guestLetter = cell => guest.findElement(By.css(`.cell[data-cell="${cell}"] .letter`)).getText();
  const guestMarks = async () => (await guest.findElements(By.css('.mark'))).length;
  const sidebar = async () => host.switchTo().window(sidebarWindow);

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
    const siteCellCount = await host.executeScript(`return document.querySelectorAll(arguments[0]).length`, site.cells);
    await until('guest has the same grid', async () => (await guest.findElements(By.css('.grid .cell'))).length === siteCellCount, 30000);
    const clueCount = (await guest.findElements(By.css('.clue-list li'))).length;
    if (clueCount < 20) throw new Error(`only ${clueCount} clues`);
    if ((await guest.findElement(By.css('.cell[data-cell="0"] .num')).getText()) !== '1') throw new Error('test assumes 1A starts in cell 0');
    step(`guest sees the ${siteCellCount}-cell grid and ${clueCount} clues`);

    // Host types on the real site.
    await onSite();
    await (await host.findElements(By.css(site.cells)))[0].click();
    await host.actions().sendKeys('q').perform();
    await until('guest sees host letter', async () => (await guestLetter(0)) === 'Q');
    step('host typed Q on the site and the guest sees it');

    // Guest suggests 1A, overwriting the host's Q. Clicking 1A jumps to its first empty square, so step back first.
    await guest.findElement(By.css('li[data-clue="1A"]')).click();
    await guest.actions().sendKeys(Key.ARROW_LEFT, 'br', Key.ENTER).perform();
    await until('guest sees own corner marks', async () => (await guestMarks()) === 2);
    await sidebar();
    await until('sidebar shows suggestion', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    const clashes = (await host.findElements(By.css('.suggestion .clash'))).length;
    await onSite();
    const overlay = await until('overlay', async () => {
      const r = await host.executeScript(`
        const root = document.getElementById('group-crossword-overlay')?.shadowRoot;
        return root && { marks: [...root.querySelectorAll('.mark')].map(m => m.textContent), badges: [...root.querySelectorAll('.badge')].map(b => b.title) };`);
      return r && r.marks.length === 2 && r.badges.length === 1 && r;
    });
    if (process.env.SHOTS) {
      await host.switchTo().defaultContent();
      const frame = (await host.findElements(By.css('iframe[src*="amuselabs"]')))[0];
      writeFileSync(`e2e/.artifacts/${name}-host.png`, await (frame ?? host).takeScreenshot(true), 'base64');
      writeFileSync(`e2e/.artifacts/${name}-guest.png`, await guest.takeScreenshot(), 'base64');
      await sidebar();
      await host.manage().window().setRect({ width: 360, height: 760 });
      writeFileSync(`e2e/.artifacts/${name}-sidebar.png`, await host.takeScreenshot(), 'base64');
    }
    step(`guest suggested BR; sidebar shows it (${clashes} clash), overlay shows ${overlay.marks.join(',')} and ${overlay.badges[0]}'s badge`);

    // Host accepts.
    await sidebar();
    await host.findElement(By.xpath("//button[normalize-space(.)='Accept']")).click();
    await until('site has BR', async () => (await siteLetters(0, 1)) === 'BR');
    await until('guest sees BR, marks gone', async () => (await guestLetter(0)) + (await guestLetter(1)) === 'BR' && (await guestMarks()) === 0);
    await sidebar();
    await until('sidebar queue empty', async () => (await host.findElements(By.css('.suggestion'))).length === 0);
    step('host accepted: BR was typed into the site and synced back to the guest');

    // Guest suggests 1D; host rejects.
    await guest.findElement(By.css('li[data-clue="1D"]')).click();
    await guest.actions().sendKeys('zz', Key.ENTER).perform();
    await sidebar();
    await until('sidebar shows 1D suggestion', async () => (await host.findElements(By.css('.suggestion'))).length === 1);
    await host.findElement(By.xpath("//button[normalize-space(.)='Reject']")).click();
    await until('guest told about rejection', async () => (await guest.findElement(By.css('.toast')).getText()).includes('rejected'));
    if ((await siteLetters(0, 1)) !== 'BR' || (await guestMarks()) !== 0) throw new Error('rejected suggestion changed something');
    step('host rejected 1D: guest was told and nothing was typed');
  }
  console.log('\nAll end-to-end checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
  for (const [name, driver] of [['host', host], ['guest', guest]]) {
    await driver.switchTo().defaultContent().catch(() => {});
    writeFileSync(`e2e/.artifacts/failure-${name}.png`, await driver.takeScreenshot(), 'base64');
  }
  console.error('Screenshots saved in e2e/.artifacts/');
} finally {
  await Promise.allSettled([host.quit(), guest.quit()]);
  server.close();
}
