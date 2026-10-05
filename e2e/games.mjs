// End-to-end check of the games that need no puzzle, in real Firefox: the host plays from the app with no extension at
// all, and two guests join from the link.
//
//   npm run build && npm run e2e:games
//
// Set HEADED=1 to watch it, or SHOTS=1 to save screenshots.
import { writeFileSync } from 'node:fs';
import { By } from 'selenium-webdriver';
import { appUrl, launch, startAppServer, step, until } from './helpers.mjs';

const server = startAppServer();
const host = await launch(false);
const sam = await launch(false);
const ana = await launch(false);
const everyone = [host, sam, ana];
const shot = async (driver, file) => process.env.SHOTS && writeFileSync(`e2e/.artifacts/${file}.png`, await driver.takeScreenshot(), 'base64');
const button = (driver, label) => until(`${label} button`, () => driver.findElement(By.xpath(`//button[normalize-space(.)='${label}']`)));
const text = (driver, css) => driver.findElement(By.css(css)).getText();
const all = async check => (await Promise.all(everyone.map(check))).every(Boolean);

try {
  // --- The host starts a session with no extension; two guests join ---
  await host.get(appUrl());
  await (await button(host, 'Host a game')).click();
  await (await button(host, 'Start session')).click();
  await until('session live', async () => (await text(host, '.session-status')) === 'Live', 30000);
  const roomId = new URL(await host.findElement(By.css('.link input')).getAttribute('value')).hash.slice(1);
  for (const [guest, name] of [
    [sam, 'Sam'],
    [ana, 'Ana'],
  ]) {
    await guest.get(appUrl(roomId));
    await (await until('name box', () => guest.findElement(By.css('.join input')))).sendKeys(name);
    await guest.findElement(By.css('.join button[type=submit]')).click();
  }
  await until('the host sees both guests', async () => (await host.findElements(By.css('.players li'))).length >= 3, 30000);
  step(`the host started session ${roomId} from the home page, with no extension, and Sam and Ana joined`);

  // --- Bracket ---
  await (await button(host, 'Bracket')).click();
  await (await until('category box', () => host.findElement(By.css('.bracket-form input')))).sendKeys('Best biscuit');
  await (await button(host, 'Ask for options')).click();
  await until('everyone sees the category', () => all(async d => (await text(d, '.bracket h1')) === 'Best biscuit'));
  for (const [driver, option] of [
    [host, 'Hobnob'],
    [sam, 'Jaffa cake'],
    [ana, 'Bourbon'],
  ]) {
    const box = await until('option box', () => driver.findElement(By.css('.bracket-form input')));
    await box.sendKeys(option);
    await (await button(driver, 'Put it forward')).click();
  }
  await (await button(host, 'Make the bracket (3 options)')).click();
  await until('voting for everyone', () => all(async d => (await d.findElements(By.css('.bracket-side'))).length === 2));
  // During voting nobody can tell who suggested what.
  if ((await text(sam, '.bracket-rounds')).includes('·')) throw new Error('suggesters shown before the end');
  await shot(sam, 'games-bracket-vote');
  // Everyone votes for the first option in each match until there's a winner.
  for (let match = 0; match < 3 && !(await host.findElements(By.css('.bracket-winner'))).length; match++) {
    const current = await text(host, '.bracket-match.current');
    for (const d of everyone) await (await until('a side to vote for', async () => (await d.findElements(By.css('.bracket-side')))[0])).click();
    await until('the match decided', async () => (await host.findElements(By.css('.bracket-winner'))).length || (await text(host, '.bracket-match.current')) !== current);
  }
  const winner = await until('everyone sees the same winner', async () => {
    const names = await Promise.all(everyone.map(d => text(d, '.bracket-winner h2').catch(() => '')));
    return names[0] && names.every(n => n === names[0]) && names[0];
  });
  const by = await text(sam, '.bracket-winner');
  await shot(sam, 'games-bracket-done');
  step(`bracket: a category, an option each, voted through to "${winner}" (${by.split('\n').pop()}) for everyone`);
  await (await button(host, 'Play again')).click();
  await until('back to choosing a category', () => host.findElement(By.css('.bracket-form input')));

  console.log('\nAll game checks passed.');
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
  await Promise.allSettled(everyone.map(d => d.quit()));
  server.close();
}
