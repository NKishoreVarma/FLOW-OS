import crypto from 'node:crypto';

/**
 * SignatureValidator — verifies extension package integrity.
 *
 * FLOW signs published extension packages with its private key.
 * Customers verify the signature before loading any extension code.
 *
 * For self-hosted / dev extensions the signature check can be bypassed
 * by setting EXTENSION_SKIP_SIGNATURE=true in the environment.  This is
 * never allowed in production (NODE_ENV === 'production').
 *
 * Signing algorithm: ECDSA P-256, SHA-256 digest.
 * Signature is a hex-encoded DER buffer stored in the manifest under
 * _signature.  The signed payload is the canonical JSON of the manifest
 * (all fields except _signature, sorted by key, no whitespace).
 */

const SIGNING_ALG  = 'SHA256';
const TRUSTED_KEYS = (process.env.EXTENSION_TRUST_KEYS || '').split(',').filter(Boolean);

function canonicalPayload(manifest) {
  const clean = Object.fromEntries(
    Object.entries(manifest)
      .filter(([k]) => k !== '_signature' && k !== '_raw')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(clean);
}

export function validateSignature(manifest, publicKeyPem) {
  if (process.env.NODE_ENV !== 'production' && process.env.EXTENSION_SKIP_SIGNATURE === 'true') {
    return { valid: true, skipped: true };
  }

  const signature = manifest._signature;
  if (!signature) {
    return { valid: false, reason: 'No _signature field in manifest' };
  }

  const payload = canonicalPayload(manifest);

  try {
    const verify = crypto.createVerify(SIGNING_ALG);
    verify.update(payload, 'utf8');
    const sigBuf = Buffer.from(signature, 'hex');
    const valid  = verify.verify(publicKeyPem, sigBuf);
    return { valid, reason: valid ? null : 'Signature verification failed' };
  } catch (err) {
    return { valid: false, reason: `Signature error: ${err.message}` };
  }
}

/**
 * Generate a manifest signature (used by the CLI packager, not by the loader).
 */
export function signManifest(manifest, privateKeyPem) {
  const payload = canonicalPayload(manifest);
  const sign    = crypto.createSign(SIGNING_ALG);
  sign.update(payload, 'utf8');
  return sign.sign(privateKeyPem, 'hex');
}

/**
 * Compute a SHA-256 checksum of the extension bundle bytes.
 * Stored in the package metadata so the loader can detect corruption.
 */
export function checksumBundle(bundleBuffer) {
  return crypto.createHash('sha256').update(bundleBuffer).digest('hex');
}

export function verifyChecksum(bundleBuffer, expectedHex) {
  const actual = checksumBundle(bundleBuffer);
  return {
    valid:    actual === expectedHex,
    actual,
    expected: expectedHex,
  };
}

export function isTrustedPublisher(publisherId) {
  return TRUSTED_KEYS.length === 0 || TRUSTED_KEYS.includes(publisherId);
}
