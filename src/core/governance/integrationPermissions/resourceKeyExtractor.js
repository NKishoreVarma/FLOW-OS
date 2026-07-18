/**
 * FLOW OS — Resource Key Extractor (Phase 13.1)
 *
 * Answers one question: "which resource governs this item?"
 *
 * Given a sync item (from a *SyncAdapter) or a raw webhook payload, returns the
 * candidate resource keys that could authorize it. The gate allows the item if
 * ANY candidate is allowed — a Gmail message carrying both `Engineering` and
 * `INBOX` is readable if either label is permitted.
 *
 * Returning an EMPTY candidate list means "cannot attribute this item to any
 * resource". The gate treats that as DENY: an item we cannot govern is an item
 * we do not ingest. Failing open here would silently defeat the whole feature.
 */

/** Slack conversation ids are prefixed by type: C=public, G=private/group, D=DM. */
function slackTypeFromId(id = '') {
  if (id.startsWith('D')) return 'dm';
  if (id.startsWith('G')) return 'private_channel';
  return 'channel';
}

/** `pulls:acme/api` → `acme/api` */
function repoFromChannel(channel = '') {
  const idx = channel.indexOf(':');
  return idx === -1 ? null : channel.slice(idx + 1) || null;
}

/** `PROJ-123` → `PROJ` */
function projectFromIssueKey(key = '') {
  const idx = key.indexOf('-');
  return idx === -1 ? null : key.slice(0, idx) || null;
}

function candidate(resourceType, resourceId) {
  return resourceId ? [{ resourceType, resourceId: String(resourceId) }] : [];
}

// ── Sync items ────────────────────────────────────────────────────────────────

const SYNC_EXTRACTORS = {
  slack(item) {
    const m  = item.metadata || {};
    const id = m.channelId;
    if (!id) return [];
    return candidate(slackTypeFromId(id), id);
  },

  github(item) {
    const m = item.metadata || {};
    // repositories emit `fullName`; pulls/issues/commits/releases emit `repo`.
    const repo = m.fullName || m.repo || repoFromChannel(item.channel);
    return candidate('repository', repo);
  },

  gmail(item) {
    const m = item.metadata || {};
    // Label catalog rows govern themselves; messages/threads carry a label array.
    if (m.labelId) return candidate('label', m.labelId);
    const labels = Array.isArray(m.labels) ? m.labels : [];
    return labels.map(l => ({ resourceType: 'label', resourceId: String(l) }));
  },

  'google-calendar'(item) {
    const m = item.metadata || {};
    return candidate('calendar', m.calendarId);
  },

  notion(item) {
    const m = item.metadata || {};
    if (m.databaseId) return candidate('database', m.databaseId);
    return candidate('page', m.pageId);
  },

  jira(item) {
    const m = item.metadata || {};
    const key =
      m.project                              // issues + (patched) comments
      || m.key && projectFromIssueKey(m.key) // webhook items carry the issue key
      || m.issueKey && projectFromIssueKey(m.issueKey)
      || repoFromChannel(item.channel);      // `issues:PROJ` / `comments:PROJ`
    return candidate('project', key);
  },
};

/**
 * Jira project catalog rows are the project itself — `metadata.key` there is the
 * PROJECT key (e.g. "FLOW"), not an issue key, so projectFromIssueKey would
 * mangle it. Detect the catalog row by its channel and short-circuit.
 */
function jiraCatalogOverride(item) {
  if (item.channel === 'projects' && item.metadata?.key) {
    return candidate('project', item.metadata.key);
  }
  return null;
}

/**
 * @param {string} connector
 * @param {object} item — a sync item as emitted by a *SyncAdapter
 * @returns {Array<{resourceType: string, resourceId: string}>}
 */
export function extractFromSyncItem(connector, item) {
  if (!item) return [];

  if (connector === 'jira') {
    const override = jiraCatalogOverride(item);
    if (override) return override;
  }

  const fn = SYNC_EXTRACTORS[connector];
  return fn ? fn(item) : [];
}

// ── Webhook payloads ──────────────────────────────────────────────────────────
//
// Webhooks bypass the sync engine entirely, so they need their own extraction
// against the RAW provider payload.

const WEBHOOK_EXTRACTORS = {
  slack(payload) {
    const ev = payload?.event || payload || {};
    const id = ev.channel?.id || ev.channel || payload?.channel_id;
    if (!id || typeof id !== 'string') return [];
    return candidate(slackTypeFromId(id), id);
  },

  github(payload) {
    const repo = payload?.repository?.full_name;
    return candidate('repository', repo);
  },

  gmail(payload) {
    // Gmail push notifications carry only an emailAddress + historyId — no label.
    // Nothing to attribute, so nothing is authorized: the sync path (which does
    // carry labels) is the only way Gmail content enters FLOW.
    const labels = payload?.labelIds || payload?.labels;
    if (!Array.isArray(labels)) return [];
    return labels.map(l => ({ resourceType: 'label', resourceId: String(l) }));
  },

  'google-calendar'(payload) {
    const id = payload?.calendarId || payload?.resourceId;
    return candidate('calendar', id);
  },

  notion(payload) {
    const id = payload?.page?.id || payload?.pageId;
    if (id) return candidate('page', id);
    return candidate('database', payload?.database?.id || payload?.databaseId);
  },

  jira(payload) {
    const key =
      payload?.issue?.fields?.project?.key
      || payload?.project?.key
      || (payload?.issue?.key && projectFromIssueKey(payload.issue.key));
    return candidate('project', key);
  },
};

/**
 * @param {string} connector
 * @param {object} payload — raw provider webhook payload
 * @returns {Array<{resourceType: string, resourceId: string}>}
 */
export function extractFromWebhook(connector, payload) {
  const fn = WEBHOOK_EXTRACTORS[connector];
  return fn ? fn(payload || {}) : [];
}
