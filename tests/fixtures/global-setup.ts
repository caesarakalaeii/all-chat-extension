import { startMockWsServer } from './mock-ws-server';

export default async function globalSetup() {
  await startMockWsServer(8080);
}
