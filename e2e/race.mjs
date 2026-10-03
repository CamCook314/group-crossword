// End-to-end race in real Firefox: the host runs races from the race view on live crosswords, two racers race on
// the guest page, and each site's own Reveal supplies the answers they type (so the extension's answers are checked
// against the site, not against themselves).
//
//   npm run build && npm run e2e:race          both sites
//   npm run e2e:race -- crosshare              just one (crosshare | puzzleme)
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots of the race view and racers' pages.
import { writeFileSync } from 'node:fs';
import { By, Key } from 'selenium-webdriver';
import { buildExtension, chosenSites, guestUrl, launch, openSidebarTab, readSite, SITES, startGuestServer, step, switchToNewWindow, until } from './helpers.mjs';

const PENALTY = 8; // seconds; short, so the test can check the cooldown

const sites = chosenSites();
buildExtension();
const server = startGuestServer();
const host = await launch(true);
const sam = await launch(false);
const ana = await launch(false);
for (const racer of [sam, ana]) await racer.manage().window().setRect({ width: 1400, height: 1300 });

const text = async (driver, css) => driver.findElement(By.css(css)).getText();
const button = (driver, label) => until(`${label} button`, () => driver.findElement(By.xpath(`//button[normalize-space(.)='${label}']`)));
/** The letters in a racer's own grid, by square. */
const racerLetters = racer => racer.executeScript(`return [...document.querySelectorAll('.solver .grid .cell')].map(c => c.querySelector('.letter')?.textContent ?? '')`);
/** Types into a racer's grid square by square: [square, letter] pairs. */
async function type(racer, entries) {
  const cells = await racer.findElements(By.css('.solver .grid .cell'));
  let actions = racer.actions();
  for (const [cell, letter] of entries) actions = actions.move({ origin: cells[cell] }).press().release().sendKeys(letter.toLowerCase());
  await actions.perform();
}
const both = async check => (await check(sam)) && (await check(ana));
const shot = async (driver, file) => process.env.SHOTS && writeFileSync(`e2e/.artifacts/${file}.png`, await driver.takeScreenshot(), 'base64');

try {
  // The sidebar and the crossword get a window each, so the crossword tab stays visible.
  const sidebarWindow = await openSidebarTab(host);
  await host.switchTo().newWindow('window');
  const siteWindow = await host.getWindowHandle();

  // --- Race mode, the race view, a session ---
  await host.switchTo().window(sidebarWindow);
  await (await button(host, 'Race')).click();
  const before = await host.getAllWindowHandles();
  await (await button(host, 'Open full view')).click();
  const raceWindow = await switchToNewWindow(host, before, 'full view');
  const raceView = () => host.switchTo().window(raceWindow);
  await (await button(host, 'Start session')).click();
  await until('session live', async () => (await text(host, '.session-status')) === 'Live', 30000);
  const roomId = new URL(await host.findElement(By.css('.link input')).getAttribute('value')).hash.slice(1);
  step(`race mode on; race view open; session ${roomId} live`);

  async function join(racer, name) {
    await racer.get(guestUrl(roomId));
    await (await until('name box', () => racer.findElement(By.css('.join input')))).sendKeys(name);
    await racer.findElement(By.css('.join button[type=submit]')).click();
  }
  await join(sam, 'Sam');
  await until('Sam in the lobby', async () => (await sam.findElement(By.css('body')).getText()).includes('Waiting for the host to start'), 30000);
  await raceView();
  await until('race view lists Sam', async () => (await text(host, '.waiting')).includes('Sam'));

  // --- Lobby settings: a short penalty ---
  await host.findElement(By.xpath("//label[contains(., 'Time penalty')]/input[@type='checkbox']")).click();
  const seconds = await until('penalty seconds box', async () => {
    const box = await host.findElement(By.css('input.seconds'));
    return (await box.isEnabled()) && box;
  });
  await seconds.sendKeys(Key.END, Key.BACK_SPACE, Key.BACK_SPACE, Key.BACK_SPACE, String(PENALTY), Key.TAB);
  await until('Sam sees the penalty rule', async () => (await text(sam, '.rules')).includes(`costs ${PENALTY} s`));
  step(`Sam is in the lobby; host set a ${PENALTY} s penalty and Sam sees the rule`);

  let anaJoined = false;
  for (const name of sites) {
    const site = SITES[name];
    console.log(`${name}:`);
    await host.switchTo().window(siteWindow);
    await site.open(host);
    const squares = await host.executeScript(`return document.querySelectorAll(arguments[0]).length`, site.cells);
    await raceView();
    // Wait for this puzzle (not the previous one) and its answers.
    const side = Math.sqrt(squares);
    const answerStatus = await until('answers found', async () => {
      const t = await text(host, '.puzzle');
      return t.includes(`(${side}×${side})`) && t.includes('squares ✓') && t;
    }, 30000);

    // Play opens the racer's page for the host, in a new window, with their name filled in.
    if (name === sites[0]) {
      const windows = await host.getAllWindowHandles();
      await (await button(host, 'Play')).click();
      await switchToNewWindow(host, windows, 'Play window');
      const url = await until('Play window address', async () => {
        const u = await host.getCurrentUrl();
        return u.includes(roomId) && u;
      });
      if (!url.includes(`#${roomId}?name=Host&color=`)) throw new Error(`Play opened ${url}`);
      await host.close();
      await raceView();
      step('Play opens the race page in a new window with the host’s name and colour filled in');
    }

    // --- Start: countdown, then the grid ---
    await (await button(host, 'Start race')).click();
    await until('race view counts down', () => host.findElement(By.css('.countdown')));
    await until('Sam sees the countdown', () => sam.findElement(By.css('.countdown')));
    await until('Sam gets the grid', async () => (await sam.findElements(By.css('.solver .grid .cell'))).length === squares, 10000);
    step(`${answerStatus.split('· ')[1]}; Start ran a 3-2-1 countdown, then Sam got the ${squares}-square grid`);

    // --- The answers, from the site's own Reveal (the race already has its own copy) ---
    await host.switchTo().window(siteWindow);
    await site.enter(host);
    await site.reveal(host);
    const white = (await sam.findElements(By.css('.solver .grid .cell:not(.block)'))).length;
    const answers = await until('revealed grid', async () => {
      const a = await readSite(host, site);
      return a.filter(Boolean).length === white && a;
    });
    const entries = answers.map((letter, cell) => [cell, letter]).filter(([, letter]) => letter);

    // --- Ana joins late, the first time: empty grid, clock already running ---
    if (!anaJoined) {
      await join(ana, 'Ana');
      anaJoined = true;
      await until('Ana joins mid-race', async () => {
        const letters = await racerLetters(ana);
        return letters.length === squares && letters.every(l => !l) && (await text(ana, '.race-clock')) !== '0:00';
      }, 30000);
      step('Ana joined mid-race: empty grid, clock already running');
    }

    // --- Sam fills half, reloads the page, and gets his grid back ---
    const half = Math.floor(entries.length / 2);
    await type(sam, entries.slice(0, half));
    await until('half of Sam’s grid reached the host', async () => {
      await raceView();
      return (await text(host, '.card[data-racer="Sam"]')).includes(`${Math.round((100 * half) / white)}% filled`);
    });
    await sam.navigate().refresh();
    await (await until('Sam’s join form', () => sam.findElement(By.css('.join button[type=submit]')))).click();
    await until('Sam’s grid restored', async () => {
      const letters = await racerLetters(sam);
      return entries.slice(0, half).every(([cell, letter]) => letters[cell] === letter);
    }, 30000);
    step(`Sam filled ${half} squares, reloaded the page, rejoined, and got his grid back`);

    // --- A full but wrong grid: not quite + penalty; another wrong within the cooldown is free ---
    const [lastCell, lastLetter] = entries.at(-1);
    const wrong = lastLetter === 'Z' ? 'Y' : 'Z';
    const wrongAgain = lastLetter === 'X' ? 'W' : 'X';
    await type(sam, [...entries.slice(half, -1), [lastCell, wrong]]);
    await until('Sam is told not quite, with a penalty', async () => {
      const t = await text(sam, '.notice');
      return t.startsWith('Not quite') && t.includes(`+0:0${PENALTY} penalty`);
    });
    await type(sam, [[lastCell, wrongAgain]]);
    await until('the second wrong grid costs nothing', async () => {
      const notices = await Promise.all((await sam.findElements(By.css('.notice'))).map(n => n.getText()));
      return notices.some(t => t.startsWith('Not quite') && !t.includes('penalty')) && notices.some(t => t.startsWith('Free fixes'));
    });
    await raceView();
    await until('race view shows Sam’s penalty, and that his grid is full but not all correct', async () => {
      const t = await text(host, '.card[data-racer="Sam"]');
      return t.includes(`+0:0${PENALTY} penalties`) && t.includes('100% filled') && !t.includes('100% correct');
    });
    step(`Sam’s full but wrong grid: "Not quite" with +${PENALTY} s; a second wrong grid during the cooldown was free`);

    await type(sam, [[lastCell, lastLetter]]);
    await until('Sam finished first', async () => (await text(sam, '.race-clock')).includes('Finished 1st'));

    // --- Ana gets a few in, one wrong; the others' progress shows on her page ---
    const third = entries[2];
    await type(ana, [entries[0], entries[1], [third[0], third[1] === 'Z' ? 'Y' : 'Z']]);
    await until('Ana sees Sam has finished', async () => (await text(ana, '.progress-row[data-player="Sam"] .pct')).includes('Finished 1st'));
    await raceView();
    await until('race view marks Ana’s wrong square', async () => (await host.findElements(By.css('.card[data-racer="Ana"] .cell.wrong'))).length === 1);
    await shot(host, `race-${name}-view`);
    await shot(ana, `race-${name}-ana`);
    step('Sam finished 1st; Ana sees it in the progress bars; the race view marks Ana’s wrong square');

    // --- The host ends the race: results for everyone ---
    await (await button(host, 'End race')).click();
    await until('Sam sees the results', () => sam.findElement(By.css('.race-results')), 10000);
    const standings = await Promise.all((await sam.findElements(By.css('.standings li'))).map(li => li.getText()));
    if (!standings[0].startsWith('Sam') || !standings[0].includes('(incl. +0:0') || !standings[1].includes('Ana') || !standings[1].includes('didn’t finish')) {
      throw new Error(`standings: ${standings.join(' / ')}`);
    }
    const heading = await sam.findElement(By.xpath("//h2[starts-with(normalize-space(.), 'Solution')]")).getText();
    const solution = await sam.executeScript(`return [...document.querySelectorAll('.race-results > .board .cell')].map(c => c.querySelector('.letter')?.textContent ?? '')`);
    if (!heading.toLowerCase().includes('sam’s board')) throw new Error(`solution heading: ${heading}`);
    if (solution.join() !== answers.join()) throw new Error('the solution board doesn’t match the site’s revealed answers');
    const boards = await sam.findElements(By.css('.boards figure'));
    const anaWrong = await ana.findElements(By.xpath("//figure[contains(., 'Ana')]//div[contains(@class, 'wrong')]"));
    if (boards.length !== 2 || anaWrong.length !== 1) throw new Error(`boards: ${boards.length}, Ana's wrong squares: ${anaWrong.length}`);
    if (!standings[1].includes(`correct`)) throw new Error(`Ana isn't ranked by squares correct: ${standings[1]}`);
    step(`results: ${standings.join(' / ').replace(/\n/g, ' ')}; Sam's board shown as the solution; both final boards, Ana's mistake marked`);

    // The replay, scrubbed to the end: Sam's board complete and marked finished.
    await sam.executeScript(`const s = document.querySelector('.race-results .replay-scrubber'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await until('the replay ends with Sam finished', async () =>
      sam.executeScript(
        `const fig = [...document.querySelectorAll('.replay-boards figure')].find(f => f.textContent.includes('Sam'));
         return fig.querySelector('.replay-finished') && [...fig.querySelectorAll('.letter')].filter(l => l.textContent).length === arguments[0];`,
        white,
      ),
    );
    await raceView();
    if (!(await host.findElements(By.css('.results .replay'))).length) throw new Error('no replay on the race view');
    step('replay: scrubbed to the end, Sam\'s board is complete and marked finished; the race view has it too');

    await shot(sam, `race-${name}-results`);
    await raceView();
    await shot(host, `race-${name}-view-results`);
    // --- New race: everyone back in the lobby ---
    await raceView();
    await (await button(host, 'New race')).click();
    await until('racers back in the lobby', () => both(async r => (await r.findElement(By.css('body')).getText()).includes('Waiting for the host to start')));
    step('New race: everyone is back in the lobby');
  }
  console.log('\nAll race checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
  for (const [name, driver] of [['host', host], ['sam', sam], ['ana', ana]]) {
    await driver.switchTo().defaultContent().catch(() => {});
    writeFileSync(`e2e/.artifacts/race-failure-${name}.png`, await driver.takeScreenshot(), 'base64');
  }
  console.error('Screenshots saved in e2e/.artifacts/');
} finally {
  await Promise.allSettled([host.quit(), sam.quit(), ana.quit()]);
  server.close();
}
