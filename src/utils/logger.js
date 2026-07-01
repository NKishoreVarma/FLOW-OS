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

function emit(level, prefix, message, args) {
  if (JSON_LOGS) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      service: 'flow-os',
      msg: message,
      ...(args.length === 1 && typeof args[0] === 'object' ? args[0] : args.length > 0 ? { extra: args } : {}),
    };
    if (level === 'error') process.stderr.write(JSON.stringify(entry) + '\n');
    else process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const ts = new Date().toISOString();
    const color = ANSI[prefix.toLowerCase()] || ANSI.info;
    const line = `${color}[${prefix}] [${ts}] ${message}${ANSI.reset}`;
    if (level === 'error') console.error(line, ...args);
    else console.log(line, ...args);
  }
}

export const logger = {
  info:     (msg, ...args) => emit('info',     'INFO',     msg, args),
  warn:     (msg, ...args) => emit('warn',     'WARN',     msg, args),
  error:    (msg, ...args) => emit('error',    'ERROR',    msg, args),
  queue:    (msg, ...args) => emit('info',     'QUEUE',    msg, args),
  rag:      (msg, ...args) => emit('info',     'RAG',      msg, args),
  memory:   (msg, ...args) => emit('info',     'MEMORY',   msg, args),
  vector:   (msg, ...args) => emit('info',     'VECTOR',   msg, args),
  security: (msg, ...args) => emit('warn',     'SECURITY', msg, args),
};
