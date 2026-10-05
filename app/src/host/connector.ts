// The app's side of the connector extension: messages through its bridge script on this page.
import { FROM_APP, TO_APP, type FromApp, type ToApp } from '../../../shared/connector';

/** Listens to the connector and says hello; returns how to send to it. Without the extension, nothing arrives. */
export function connectToConnector(onMessage: (msg: ToApp) => void): (msg: FromApp) => void {
  addEventListener('message', e => {
    if (e.source === window && e.data?.source === TO_APP) onMessage(e.data.msg as ToApp);
  });
  const send = (msg: FromApp) => postMessage({ source: FROM_APP, msg }, location.origin);
  send({ type: 'hello' });
  return send;
}
