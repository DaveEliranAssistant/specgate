// SYNTHETIC FIXTURE harness. Not part of route discovery.
// Listens on 127.0.0.1 only. resetStore clears the in-process dependency.

import { app } from './service.mjs';
import { resetStore } from './store.mjs';

export { resetStore };

function assertBoundLoopback(baseURL, address) {
  const url = new URL(baseURL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('Refusing non-loopback base URL');
  }
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    throw new Error('Refusing non-loopback socket');
  }
}

export function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    const fail = (error) => {
      server.close();
      reject(error);
    };
    server.once('error', fail);
    server.once('listening', () => {
      try {
        const address = server.address();
        const baseURL = `http://127.0.0.1:${address.port}`;
        assertBoundLoopback(baseURL, address);
        resolve({
          baseURL,
          close() {
            return new Promise((done, rejectClose) => server.close((error) => (error ? rejectClose(error) : done())));
          },
        });
      } catch (error) {
        fail(error);
      }
    });
  });
}
