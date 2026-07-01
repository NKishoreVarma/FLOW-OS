import os from 'os';
import path from 'path';

// Values that would be present from an accidentally-committed template or README example.
const INSECURE_JWT_DEFAULTS = new Set([
  'flow-os-dev-secret-change-in-production',
  'secret',
  'changeme',
  'dev-secret',
  'your-secret-here',
  'jwt-secret',
]);

export function validateEnv() {
  const required = [
    { name: 'DATABASE_URL', desc: 'PostgreSQL connection URI (e.g. postgresql://user:pass@host:port/db)' },
    { name: 'REDIS_URL', desc: 'Redis connection URL (e.g. redis://127.0.0.1:6379)' },
    { name: 'JWT_SECRET', desc: 'JWT signing secret — generate with: openssl rand -hex 32' },
    { name: 'COMPOSIO_API_KEY', desc: 'Composio API key for live tool integration OAuth handlers' }
  ];

  const missing = [];

  for (const req of required) {
    if (!process.env[req.name]) {
      missing.push(req);
    }
  }

  // JWT_SECRET quality checks (only when the key is present; absence already caught above).
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      missing.push({
        name: 'JWT_SECRET',
        desc: `Too short (${process.env.JWT_SECRET.length} chars). Minimum 32 characters required. Run: openssl rand -hex 32`
      });
    } else if (INSECURE_JWT_DEFAULTS.has(process.env.JWT_SECRET)) {
      missing.push({
        name: 'JWT_SECRET',
        desc: 'Set to a known insecure default. Generate a cryptographically random value: openssl rand -hex 32'
      });
    }
  }

  // Gemini or OpenAI keys - check that at least one is present
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    missing.push({
      name: 'GEMINI_API_KEY / OPENAI_API_KEY',
      desc: 'At least one AI model provider key must be set (GEMINI_API_KEY or OPENAI_API_KEY)'
    });
  }

  if (missing.length > 0) {
    console.error('\n=================================================');
    console.error('❌ FATAL: CRITICAL ENVIRONMENT CONFIGURATION ERROR');
    console.error('=================================================');
    for (const item of missing) {
      console.error(`- Missing/Invalid: ${item.name}`);
      console.error(`  ${item.desc}`);
    }
    console.error('=================================================');
    console.error('Configure missing variables in your .env file and restart.');
    console.error('Server startup halted.\n');
    process.exit(1);
  }

  // Warn if Gmail (Communication Capability) is not configured — non-fatal.
  const hasGoogleCreds =
    (process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID) &&
    (process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET);
  if (!hasGoogleCreds) {
    console.warn('⚠️  Gmail credentials not set (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET). ' +
      'Communication Capability will return 503 until configured.');
  }

  // Warn if GitHub (Engineering Capability) is not configured — non-fatal.
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN not set. Engineering Capability will return 503 until a ' +
      'token is configured via POST /api/engineering/auth or the GITHUB_TOKEN env var.');
  }

  // Log effective vault root so operators know where files will land.
  const vaultRoot = process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS');
  console.log(`📁 Vault storage root: ${vaultRoot}`);

  // Warn operators when CORS is open-wildcard in production.
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    console.warn('⚠️  CORS_ORIGIN is not set. In production, set CORS_ORIGIN=https://your-frontend.domain to restrict cross-origin access.');
  }
  if (process.env.CORS_ORIGIN) {
    console.log(`🌐 CORS origin: ${process.env.CORS_ORIGIN}`);
  }
}
