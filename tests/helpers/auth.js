import jwt from 'jsonwebtoken';
import 'dotenv/config';

const SECRET = process.env.JWT_SECRET;

export function signTestToken(userId = 'user-test-001', orgId = 'org-test-001', role = 'OWNER') {
  return jwt.sign({ userId, orgId, role }, SECRET, { expiresIn: '1h' });
}

export const TEST_WORKSPACE_ID = `test_ws_${Date.now()}`;
export const TEST_ORG_ID = 'org-test-001';
export const TEST_USER_ID = 'user-test-001';
