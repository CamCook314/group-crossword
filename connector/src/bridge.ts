// Runs on the app's own page: passes messages between the app (window.postMessage) and the connector's background
// page, since Firefox doesn't let a web page message an extension directly. Only the app's address loads it.
import { FROM_APP, TO_APP, type FromApp, type ToApp } from '../../shared/connector';

let port: browser.runtime.Port;

function connect() {
  port = browser.runtime.connect({ name: 'app' });
  port.onMessage.addListener(m => postMessage({ source: TO_APP, msg: m as ToApp }, location.origin));
  // The background page may not be running yet, so keep trying.
  port.onDisconnect.addListener(() => setTimeout(connect, 500));
}
connect();

addEventListener('message', e => {
  if (e.source === window && e.data?.source === FROM_APP) port.postMessage(e.data.msg as FromApp);
});
