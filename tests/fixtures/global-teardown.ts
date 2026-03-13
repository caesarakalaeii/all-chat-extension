import { stopMockWsServer } from './mock-ws-server';

export default async function globalTeardown() {
  await stopMockWsServer();
}
