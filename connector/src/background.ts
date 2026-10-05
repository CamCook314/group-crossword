// The connector's background page: relays between the content scripts on puzzle pages and the app tabs that host,
// and keeps each page's latest snapshot so an app tab that (re)connects gets them straight away. The toolbar button
// opens the app, ready to host.
import type { Solutions } from '../../shared/answers';
import { CONNECTOR_VERSION, type FromApp, type PageSnapshot, type ToApp } from '../../shared/connector';
import { GUEST_URL } from '../../shared/protocol';
import type { FromAdapter, ToAdapter } from './messages';

const pages = new Map<string, { port: browser.runtime.Port; snapshot: PageSnapshot | null }>();
const answers = new Map<string, Solutions | null>();
const apps = new Set<browser.runtime.Port>();
let nextPageId = 1;

const toApps = (msg: ToApp) => apps.forEach(app => app.postMessage(msg));

function greet(app: browser.runtime.Port) {
  app.postMessage({ type: 'hello', version: CONNECTOR_VERSION } satisfies ToApp);
  for (const [pageId, { snapshot }] of pages) if (snapshot) app.postMessage({ type: 'page', pageId, snapshot } satisfies ToApp);
  for (const [puzzleKey, solutions] of answers) app.postMessage({ type: 'answers', puzzleKey, solutions } satisfies ToApp);
}

async function fromApp(msg: FromApp, app: browser.runtime.Port) {
  if (msg.type === 'hello') return greet(app);
  const page = pages.get(msg.pageId);
  if (!page) return;
  if (msg.type === 'notice') page.port.postMessage({ type: 'notice', text: msg.text } satisfies ToAdapter);
  if (msg.type === 'fill') {
    // Bring the page's tab forward first: sites can ignore typing in a tab that isn't showing.
    const tab = page.port.sender?.tab;
    if (tab?.id !== undefined) {
      await browser.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
    }
    page.port.postMessage({ type: 'apply', cells: msg.cells } satisfies ToAdapter);
  }
}

browser.runtime.onConnect.addListener(port => {
  if (port.name === 'adapter') {
    const pageId = String(nextPageId++);
    pages.set(pageId, { port, snapshot: null });
    port.onMessage.addListener(m => {
      const msg = m as FromAdapter;
      if (msg.type === 'page') {
        const { type, ...snapshot } = msg;
        pages.get(pageId)!.snapshot = snapshot;
        toApps({ type: 'page', pageId, snapshot });
      }
      if (msg.type === 'answers') {
        answers.set(msg.puzzleKey, msg.solutions);
        toApps({ type: 'answers', puzzleKey: msg.puzzleKey, solutions: msg.solutions });
      }
    });
    port.onDisconnect.addListener(() => {
      pages.delete(pageId);
      toApps({ type: 'page-closed', pageId });
    });
  }
  if (port.name === 'app') {
    apps.add(port);
    port.onMessage.addListener(m => fromApp(m as FromApp, port));
    port.onDisconnect.addListener(() => apps.delete(port));
    greet(port);
  }
});

// The toolbar button: back to the app tab that's hosting, or a new one.
browser.browserAction.onClicked.addListener(async () => {
  const tab = [...apps].map(app => app.sender?.tab).find(Boolean);
  if (tab?.id === undefined) return browser.tabs.create({ url: GUEST_URL + '#host' });
  await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
});
