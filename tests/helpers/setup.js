import request from 'supertest';
import 'dotenv/config';

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

export function getAgent() {
  return request(BASE_URL);
}

export async function startTestServer() {
  // Connect to already-running server (integration tests require npm run dev to be running)
  const agent = request(BASE_URL);
  const close = () => Promise.resolve(); // no-op — we didn't start the server
  return { agent, close, port: PORT };
}
