// Shared by the end-to-end checks: starting Firefox with the extension, serving the guest page, and the test sites.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

export const EXTENSION_ID = 'group-crossword@camcook314';
export const GUEST_PORT = 8123;
export const guestUrl = roomId => `http://localhost:${GUEST_PORT}/#${roomId}`;

/** How to open each test crossword, find its cells, and reveal its answers, from the host's side. */
export const SITES = {
  crosshare: {
    async open(host) {
      await host.get('https://crosshare.org/crosswords/3ytH7Kn9THCUVJgHtwRu/cryptic-51');
      await (await until('Begin Puzzle button', () => host.findElement(By.xpath("//button[normalize-space(.)='Begin Puzzle']")))).click();
    },
    enter: async () => {},
    async reveal(host) {
      await host.findElement(By.xpath("//button[normalize-space(.)='Reveal']")).click();
      await (await until('Reveal Puzzle', () => host.findElement(By.xpath("//*[normalize-space(.)='Reveal Puzzle']")))).click();
    },
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
    async reveal(host) {
      // Assist → Reveal grid, then confirm. The menu doesn't open for WebDriver clicks, so click the item directly.
      await host.executeScript(`[...document.querySelectorAll('.text-item')].find(e => e.textContent.trim() === 'Reveal grid').closest('a, button, li').click()`);
      // The confirm dialog can sit out of view inside the frame, so click its button directly too.
      await until('confirm reveal', () =>
        host.executeScript(`const ok = [...document.querySelectorAll('button.confirm-yes')].find(b => b.offsetParent); ok?.click(); return Boolean(ok);`),
      );
    },
    cells: '.crossword > .box',
    letter: '.letter-in-box',
  },
};

/** The sites named on the command line, or all of them. */
export function chosenSites() {
  const chosen = process.argv.slice(2).filter(a => a in SITES);
  return chosen.length ? chosen : Object.keys(SITES);
}

/** Every square's letter on the site ('' for empty or black), row by row. Call it while switched into the site. */
export const readSite = (host, site) =>
  host.executeScript(
    `return [...document.querySelectorAll(arguments[0])].map(c => c.querySelector(arguments[1])?.textContent.trim().toUpperCase() || '');`,
    site.cells,
    site.letter,
  );

export function buildExtension() {
  execSync('npx web-ext build -s extension/dist -a e2e/.artifacts -n group-crossword.zip --overwrite-dest', { stdio: 'ignore' });
}

/** Serves the built guest page locally. */
export function startGuestServer() {
  return http
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
}

export async function launch(withExtension) {
  const options = new firefox.Options();
  if (!process.env.HEADED) options.addArguments('-headless');
  // System access lets the test open the extension's pages, which WebDriver can't navigate to directly.
  const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  if (withExtension) await driver.installAddon('e2e/.artifacts/group-crossword.zip', true);
  return driver;
}

/** Polls until fn returns something truthy. */
export async function until(what, fn, timeout = 20000) {
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
export async function openSidebarTab(driver) {
  const before = await driver.getAllWindowHandles();
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `const url = WebExtensionPolicy.getByID(arguments[0]).getURL('sidebar.html');
     const { gBrowser } = Services.wm.getMostRecentWindow('navigator:browser');
     gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
    EXTENSION_ID,
  );
  await driver.setContext(firefox.Context.CONTENT);
  return switchToNewWindow(driver, before, 'sidebar tab');
}

/** Waits for a tab or window that wasn't in `before`, and switches to it. */
export async function switchToNewWindow(driver, before, what) {
  const handle = await until(what, async () => (await driver.getAllWindowHandles()).find(h => !before.includes(h)));
  await driver.switchTo().window(handle);
  return handle;
}

export const step = msg => console.log(`  ✓ ${msg}`);
