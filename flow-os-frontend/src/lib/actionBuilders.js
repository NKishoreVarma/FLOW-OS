/**
 * Domain-specific ActionCard factories (Sprint R3).
 * Each builder returns a card object compatible with inbox/ActionCard.jsx.
 * Actions route through executionApi → governed execution pipeline (Phase 14).
 */

function makeSteps(connector, actionType, payload, title) {
  return [{ connector, actionType, payload, title }];
}

// ── Engineering ────────────────────────────────────────────────────────────────
export function buildEngineeringCard({ recommendation, pr, repo, risks = [] }) {
  const title = recommendation || (pr ? `Review PR #${pr.metadata?.number || pr.number}` : "Engineering action needed");
  const number = pr?.metadata?.number || pr?.number;
  const repoName = repo?.repo || repo?.title || repo?.name || "";
  const mergeScore = pr?.metadata?.mergeReadinessScore;

  const actions = [];

  if (pr && number) {
    if (mergeScore != null && mergeScore >= 70) {
      actions.push({
        label: "Merge PR",
        workflowId: "merge_pr",
        risk: "MEDIUM",
        steps: makeSteps("github", "MERGE_PULL_REQUEST", { owner: repo?.owner, repo: repo?.name, pullNumber: number, mergeMethod: "squash" }, `Merge PR #${number}`),
        isPrimary: true,
      });
    } else {
      actions.push({
        label: "Request Review",
        workflowId: "request_review",
        risk: "LOW",
        steps: makeSteps("github", "CREATE_REVIEW", { owner: repo?.owner, repo: repo?.name, pullNumber: number, event: "REQUEST_CHANGES" }, `Review PR #${number}`),
        isPrimary: true,
      });
    }
    actions.push({
      label: "Assign Reviewer",
      workflowId: "assign_reviewer",
      risk: "LOW",
      steps: makeSteps("github", "ASSIGN_REVIEWER", { owner: repo?.owner, repo: repo?.name, pullNumber: number }, `Assign reviewer`),
      isPrimary: false,
    });
  } else {
    actions.push({
      label: "Open Engineering",
      workflowId: "navigate",
      risk: "LOW",
      steps: makeSteps("system", "NAVIGATE", { route: "/projects" }, "Open Engineering"),
      isPrimary: true,
    });
  }

  actions.push({
    label: "Create Jira Ticket",
    workflowId: "create_jira",
    risk: "LOW",
    steps: [],
    isPrimary: false,
    onClick: () => window.dispatchEvent(new CustomEvent("flow:create-jira", {
      detail: { title: pr ? `Track: PR #${number} — ${pr.title || ""}` : title },
    })),
  });

  actions.push({
    label: "Open Incident",
    workflowId: "open_incident",
    risk: "HIGH",
    steps: makeSteps("system", "NAVIGATE", { route: "/inbox" }, "Open Incident"),
    isPrimary: false,
  });

  return {
    id: `eng-${pr?.id || Date.now()}`,
    type: "engineering",
    title,
    subtitle: [repoName, mergeScore != null ? `Merge readiness: ${mergeScore}/100` : null].filter(Boolean).join(" · "),
    impact: risks.filter((r) => r && !r.includes("No critical")).length > 1 ? "high" : "medium",
    impactLabel: risks.filter((r) => r && !r.includes("No critical")).length > 1 ? "High Impact" : "Medium Impact",
    evidenceLines: risks.filter(Boolean).filter((r) => !r.includes("No critical")).slice(0, 3),
    actions,
    source: "github",
    actionRoute: "/projects",
  };
}

// ── Meetings ───────────────────────────────────────────────────────────────────
export function buildMeetingCard({ event, eventId }) {
  const title = event?.title || event?.summary || "Meeting action";
  const videoUrl = event?.videoUrl || event?.metadata?.videoUrl;
  const id = eventId || event?.id;

  return {
    id: `meet-${id || Date.now()}`,
    type: "meeting",
    title: `Prepare for: ${title}`,
    subtitle: event?.startTime
      ? new Date(event.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "",
    impact: "medium",
    impactLabel: "Medium Impact",
    evidenceLines: [
      event?.attendees?.length ? `${event.attendees.length} attendee(s)` : null,
      "No preparation brief generated yet",
    ].filter(Boolean),
    actions: [
      {
        label: "Generate Agenda",
        workflowId: "generate_agenda",
        risk: "LOW",
        steps: makeSteps("google-calendar", "UPDATE_EVENT", { eventId: id, generateAgenda: true }, "Generate meeting agenda"),
        isPrimary: true,
      },
      videoUrl
        ? { label: "Join Meeting", workflowId: "join_meeting", risk: "LOW", steps: [], isPrimary: false, onClick: () => window.open(videoUrl, "_blank") }
        : null,
      {
        label: "View Prep Brief",
        workflowId: "navigate",
        risk: "LOW",
        steps: makeSteps("system", "NAVIGATE", { route: id ? `/meetings/${id}/prep` : "/meetings" }, "View prep brief"),
        isPrimary: false,
      },
      {
        label: "Assign Follow-ups",
        workflowId: "assign_followups",
        risk: "LOW",
        steps: makeSteps("jira", "BULK_CREATE", { source: "meeting", eventId: id }, "Assign follow-up tasks"),
        isPrimary: false,
      },
    ].filter(Boolean),
    source: "google-calendar",
    actionRoute: id ? `/meetings/${id}/prep` : "/meetings",
  };
}

// ── Inbox ──────────────────────────────────────────────────────────────────────
export function buildInboxCard({ item, messageId }) {
  return {
    id: `inbox-${messageId || item?.id || Date.now()}`,
    type: "inbox",
    title: item?.subject || item?.title || "Inbox item",
    subtitle: item?.from || item?.sender || "",
    impact: "medium",
    impactLabel: "Medium Impact",
    evidenceLines: [item?.snippet || item?.preview || ""].filter(Boolean),
    actions: [
      {
        label: "Draft Reply",
        workflowId: "draft_reply",
        risk: "LOW",
        steps: messageId
          ? makeSteps("gmail", "DRAFT_REPLY", { messageId }, "Draft reply")
          : [],
        isPrimary: true,
        onClick: !messageId ? () => window.dispatchEvent(new CustomEvent("flow:open-compose")) : undefined,
      },
      {
        label: "Archive",
        workflowId: "archive",
        risk: "LOW",
        steps: messageId
          ? makeSteps("gmail", "LABEL_MESSAGE", { messageId, action: "archive" }, "Archive message")
          : [],
        isPrimary: false,
      },
      {
        label: "Flag",
        workflowId: "flag",
        risk: "LOW",
        steps: messageId
          ? makeSteps("gmail", "LABEL_MESSAGE", { messageId, action: "star" }, "Flag message")
          : [],
        isPrimary: false,
      },
      {
        label: "Create Task",
        workflowId: "create_task",
        risk: "LOW",
        steps: [],
        isPrimary: false,
        onClick: () => window.dispatchEvent(new CustomEvent("flow:create-jira", {
          detail: { title: item?.subject || "Task from email" },
        })),
      },
    ],
    source: "gmail",
    actionRoute: "/inbox",
  };
}

// ── Customer ──────────────────────────────────────────────────────────────────
export function buildCustomerCard({ account, suggestedAction }) {
  const title = suggestedAction || account?.aiIntelligence?.suggestedNextActions || `Review ${account?.name || "account"}`;
  const churnRisk = account?.aiIntelligence?.churnRisk;
  const name = account?.name || "";

  return {
    id: `cust-${account?.id || Date.now()}`,
    type: "customer",
    title,
    subtitle: name,
    impact: churnRisk === "HIGH" ? "critical" : churnRisk === "MEDIUM" ? "high" : "medium",
    impactLabel: churnRisk === "HIGH" ? "Critical Impact" : churnRisk === "MEDIUM" ? "High Impact" : "Medium Impact",
    evidenceLines: [
      churnRisk ? `Churn risk: ${churnRisk}` : null,
      ...(account?.aiIntelligence?.outstandingCommitments || []).slice(0, 2),
    ].filter(Boolean),
    actions: [
      {
        label: "Draft Reply",
        workflowId: "draft_customer_reply",
        risk: "LOW",
        steps: makeSteps("gmail", "DRAFT", { subject: `Re: ${name}`, to: account?.email || "" }, "Draft customer reply"),
        isPrimary: true,
        onClick: () => window.dispatchEvent(new CustomEvent("flow:open-compose")),
      },
      {
        label: "Create Escalation",
        workflowId: "create_escalation",
        risk: "MEDIUM",
        steps: [],
        isPrimary: false,
        onClick: () => window.dispatchEvent(new CustomEvent("flow:create-jira", {
          detail: { title: `Escalation: ${name}` },
        })),
      },
      {
        label: "Schedule Check-in",
        workflowId: "schedule_checkin",
        risk: "LOW",
        steps: makeSteps("google-calendar", "CREATE_EVENT", {
          title: `Check-in: ${name}`,
          durationMins: 30,
          description: `Follow-up call for ${name}`,
        }, "Schedule customer check-in"),
        isPrimary: false,
      },
      {
        label: "Assign Owner",
        workflowId: "assign_owner",
        risk: "LOW",
        steps: makeSteps("system", "ASSIGN_OWNER", { entityId: account?.id, entityType: "customer" }, "Assign account owner"),
        isPrimary: false,
      },
    ],
    source: "crm",
    actionRoute: "/customers",
  };
}

// ── Knowledge ─────────────────────────────────────────────────────────────────
export function buildKnowledgeCard({ entity, topic }) {
  const title = topic
    ? `Document: ${topic}`
    : entity?.name ? `Update docs: ${entity.name}` : "Knowledge action";

  return {
    id: `know-${entity?.id || Date.now()}`,
    type: "knowledge",
    title,
    subtitle: entity?.type || "Knowledge",
    impact: "low",
    impactLabel: "Low Impact",
    evidenceLines: entity?.description ? [String(entity.description).slice(0, 120)] : [],
    actions: [
      {
        label: "Generate Document",
        workflowId: "generate_document",
        risk: "LOW",
        steps: makeSteps("notion", "CREATE_PAGE", { title, parentId: "workspace" }, "Generate document in Notion"),
        isPrimary: true,
      },
      {
        label: "Create RFC",
        workflowId: "create_rfc",
        risk: "LOW",
        steps: makeSteps("notion", "CREATE_PAGE", { title: `RFC: ${topic || entity?.name || ""}` }, "Create RFC"),
        isPrimary: false,
      },
      {
        label: "Link Decision",
        workflowId: "link_decision",
        risk: "LOW",
        steps: makeSteps("system", "LINK_DECISION", { entityId: entity?.id, topic }, "Link to a decision"),
        isPrimary: false,
      },
      {
        label: "Find Related",
        workflowId: "find_related",
        risk: "LOW",
        steps: makeSteps("system", "NAVIGATE", { route: entity?.id ? `/entity/${entity.id}` : "/knowledge" }, "Find related knowledge"),
        isPrimary: false,
      },
    ],
    source: "knowledge",
    actionRoute: entity?.id ? `/entity/${entity.id}` : "/knowledge",
  };
}
