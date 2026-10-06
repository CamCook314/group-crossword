// End-to-end check of a co-op sudoku in real Firefox: the host plays in the app, with the connector reading a PuzzleMe
// sudoku (Amuse Labs' public demo: the player Courier Mail uses), plus two guests.
//
//   npm run build && npm run e2e:sudoku
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots.
import { writeFileSync } from 'node:fs';
import { By, Key } from 'selenium-webdriver';
import { appUrl, buildConnector, launch, quit, startAppServer, step, until } from './helpers.mjs';

const SUDOKU = 'https://puzzleme.amuselabs.com/pmm/sudoku?id=al-sudoku-medium-20210109&set=demo-sudoku';

buildConnector();
const server = startAppServer();
const host = await launch(true);
const sam = await launch(false);
const ana = await launch(false);
const shot = async (driver, file) => process.env.SHOTS && writeFileSync(`e2e/.artifacts/${file}.png`, await driver.takeScreenshot(), 'base64');
const button = (driver, label) => until(`${label} button`, () => driver.findElement(By.xpath(`//button[normalize-space(.)='${label}']`)));
const both = async check => (await check(sam)) && (await check(ana));
const square = (driver, cell) => driver.findElement(By.css(`.sudoku-grid .cell[data-cell="${cell}"]`));
/** The digit a square shows, and what kind: given, entry or draft. */
const digit = async (driver, cell) => {
  const letter = await (await square(driver, cell)).findElements(By.css('.letter'));
  return letter.length ? `${await letter[0].getText()}:${(await letter[0].getAttribute('class')).split(' ')[1]}` : '';
};
/** The PuzzleMe page's digits, row by row. */
const siteDigits = driver => driver.executeScript(`return [...document.querySelectorAll('.crossword > .box')].map(b => b.querySelector('.letter-in-box')?.textContent.trim() || '').join('')`);
const play = async driver => {
  for (const b of await driver.findElements(By.xpath("//button[contains(translate(., 'PLAY', 'play'), 'play')]"))) if (await b.isDisplayed()) await b.click();
};

try {
  // The host's app tab and the sudoku get a window each.
  await host.get(appUrl('host'));
  const hostWindow = await host.getWindowHandle();
  await host.manage().window().setRect({ width: 1500, height: 1000 });
  await host.switchTo().newWindow('window');
  const siteWindow = await host.getWindowHandle();
  await host.get(SUDOKU);
  await until('the sudoku', async () => (await play(host), (await host.findElements(By.css('.crossword > .box'))).length === 81), 30000);
  const hostTab = () => host.switchTo().window(hostWindow);
  await hostTab();

  await (await button(host, 'Start session')).click();
  await until('session live', async () => (await host.findElement(By.css('.session-status')).getText()) === 'Live', 30000);
  const roomId = new URL(await host.findElement(By.css('.link input')).getAttribute('value')).hash.slice(1);
  for (const [guest, name] of [
    [sam, 'Sam'],
    [ana, 'Ana'],
  ]) {
    await guest.get(appUrl(roomId));
    await (await until('name box', () => guest.findElement(By.css('.join input')))).sendKeys(name);
    await guest.findElement(By.css('.join button[type=submit]')).click();
  }
  await until('both guests see the sudoku and its givens', () =>
    both(async g => (await g.findElements(By.css('.sudoku-grid .cell'))).length === 81 && (await g.findElements(By.css('.sudoku-grid .letter.given'))).length === 25),
  30000);
  await until('the host has its answers', async () => (await host.findElement(By.css('.answers')).getText()) === 'Answers: 81 squares ✓', 30000);
  const givens = await sam.executeScript(`return [...document.querySelectorAll('.sudoku-grid .cell')].map(c => c.querySelector('.letter.given')?.textContent || '')`);
  step('guests see the 9×9 sudoku with its 25 givens; the connector read the answers (81 squares)');

  // Sam suggests a digit in the first empty square; Ana agrees; the host accepts.
  const empty = givens.findIndex(g => !g);
  await (await square(sam, empty)).click();
  await sam.actions().sendKeys('5').perform();
  await until("Sam's draft", async () => (await digit(sam, empty)) === '5:draft');
  await sam.actions().sendKeys(Key.ENTER).perform();
  await until("Ana sees Sam's suggestion", async () => (await (await square(ana, empty)).findElement(By.css('.suggestions')).getText()).includes('5'));
  await (await square(ana, empty)).click();
  await (await until('agree', () => ana.findElement(By.css('.agree-item button.agree')))).click();
  await hostTab();
  await until('one card, two agreeing', async () => (await host.findElement(By.css('.suggestion .who')).getText()).includes('Sam + Ana'));
  const card = await host.findElement(By.css('.suggestion .who b')).getText();
  await (await button(host, 'Accept')).click();
  await until('the 5 in for everyone', () => both(async g => (await digit(g, empty)) === '5:entry'));
  step(`Sam suggested 5 at ${card}, Ana agreed, the host accepted: it's in for everyone`);

  // A clash: the same digit twice in a row is marked.
  const row = Math.floor(empty / 9);
  const given = [...Array(9).keys()].map(c => row * 9 + c).find(c => givens[c]);
  const other = [...Array(9).keys()].map(c => row * 9 + c).find(c => !givens[c] && c !== empty);
  await (await square(sam, other)).click();
  await sam.actions().sendKeys(givens[given]).perform();
  await until('the clash marked', async () => (await (await square(sam, other)).findElements(By.css('.letter.clash'))).length === 1);
  await sam.actions().sendKeys(Key.ESCAPE).perform();
  step(`a draft ${givens[given]} beside the given ${givens[given]} in the same row was marked as a clash`);

  // Ana shares her pencil marks: Sam sees them.
  await (await button(ana, 'Share my marks')).click();
  await (await square(ana, other)).click();
  await (await button(ana, 'Corner')).click();
  await ana.actions().sendKeys('1', '2').perform();
  await until("Sam sees Ana's corner marks", async () => (await (await square(sam, other)).findElements(By.css('.corner'))).length === 2);
  await (await button(ana, 'Share my marks')).click();
  await until("Ana's marks gone again for Sam", async () => (await (await square(sam, other)).findElements(By.css('.corner'))).length === 0);
  step("Ana shared her corner marks 1 and 2 and Sam saw them; unsharing took them away");

  // The host checks the grid.
  await hostTab();
  await (await until('Check grid', () => host.findElement(By.xpath("//span[@class='check']/button[normalize-space(.)='Grid']")))).click();
  const checked = await until('the check for the guests', async () => {
    const t = await sam.findElements(By.css('.toast-item'));
    return t.length && (await t[0].getText()).startsWith('Checked the grid') && (await t[0].getText());
  });
  step(`host checked the grid: "${checked}"`);

  // Solving: Ana reveals the solution on the site in a window of her own; the host writes the rest in.
  const guestWindow = await ana.getWindowHandle();
  await ana.switchTo().newWindow('window');
  await ana.get(SUDOKU);
  await until('the sudoku for Ana', async () => (await play(ana), (await ana.findElements(By.css('.crossword > .box'))).length === 81), 30000);
  await ana.executeScript(`[...document.querySelectorAll('.text-item')].find(e => e.textContent.trim() === 'Reveal grid').closest('a, button, li').click()`);
  await until('confirm reveal', () => ana.executeScript(`const ok = [...document.querySelectorAll('button.confirm-yes')].find(b => b.offsetParent); ok?.click(); return Boolean(ok);`));
  const solution = await until('the revealed solution', async () => {
    const s = await siteDigits(ana);
    return s.length === 81 && s;
  });
  await ana.close();
  await ana.switchTo().window(guestWindow);
  await hostTab();
  const squares = await host.findElements(By.css('.sudoku-grid .cell'));
  let typing = host.actions();
  for (const [cell, d] of [...solution].entries()) if (!givens[cell]) typing = typing.move({ origin: squares[cell] }).press().release().sendKeys(d);
  await typing.perform();
  await until('everyone sees it solved', () => both(async g => (await g.findElements(By.css('.toast-item.solved'))).length === 1), 30000);
  await shot(sam, 'sudoku-solved');
  await shot(host, 'sudoku-host');
  await (await button(host, 'Fill in the sudoku')).click();
  await host.switchTo().window(siteWindow);
  await until('the site filled in', async () => (await siteDigits(host)) === solution, 30000);
  step('solved: everyone saw "Solved! 🎉", and Fill in typed every digit into the PuzzleMe page');

  console.log('\nAll sudoku checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
  for (const [name, driver] of [
    ['host', host],
    ['sam', sam],
    ['ana', ana],
  ])
    writeFileSync(`e2e/.artifacts/failure-${name}.png`, await driver.takeScreenshot(), 'base64');
  console.error('Screenshots saved in e2e/.artifacts/');
} finally {
  await Promise.allSettled([host, sam, ana].map(quit));
  server.close();
}
