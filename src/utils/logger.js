const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JSON_LOGS = IS_PRODUCTION || process.env.LOG_FORMAT === 'json';

const ANSI = {
  reset: '\x1b[0m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  queue: '\x1b[34m',
  rag: '\x1b[35m',
  memory: '\x1b[36m',
  vector: '\x1b[94m',
  security: '\x1b[91m',
};

// Never log credentials/PII. Keys matching this are replaced with [REDACTED].
const REDACT_KEY = /(pass(word|wd)?|secret|token|authorization|api[_-]?key|jwt|cookie|refresh[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key|ssn|credit[_-]?card)/i;

function redact(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function emit(level, prefix, message, args) {
  if (JSON_LOGS) {
    const meta = args.length === 1 && typeof args[0] === 'object' && args[0] !== null ? redact(args[0])
      : args.length > 0 ? { extra: redact(args) } : {};
    const entry = { ts: new Date().toISOString(), level, service: 'flow-os', channel: prefix, msg: message, ...meta };
    if (level === 'error') process.stderr.write(JSON.stringify(entry) + '\n');
    else process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const ts = new Date().toISOString();
    const color = ANSI[prefix.toLowerCase()] || ANSI.info;
    const safeArgs = args.map((a) => (a && typeof a === 'object' ? redact(a) : a));
    const line = `${color}[${prefix}] [${ts}] ${message}${ANSI.reset}`;
    if (level === 'error') console.error(line, ...safeArgs);
    else console.log(line, ...safeArgs);
  }
}

export const logger = {
  info:     (msg, ...args) => emit('info',     'INFO',     msg, args),
  debug:    (msg, ...args) => { if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') emit('info', 'DEBUG', msg, args); },
  warn:     (msg, ...args) => emit('warn',     'WARN',     msg, args),
  error:    (msg, ...args) => emit('error',    'ERROR',    msg, args),
  queue:    (msg, ...args) => emit('info',     'QUEUE',    msg, args),
  rag:      (msg, ...args) => emit('info',     'RAG',      msg, args),
  memory:   (msg, ...args) => emit('info',     'MEMORY',   msg, args),
  vector:   (msg, ...args) => emit('info',     'VECTOR',   msg, args),
  security: (msg, ...args) => emit('warn',     'SECURITY', msg, args),
};

export { redact };
