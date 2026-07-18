# Meeting Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Phase 5.5 (GoogleCalendarAdapter — production)

---

## Problem Statement

Meetings are the most expensive and least documented activity in any company. A 10-person company meeting costs approximately $500/hour in combined salary. A Series B company runs 200+ hours of meetings per week. Almost none of the context generated in those meetings is captured, searchable, or connected to the work it affects.

After a meeting: decisions made are forgotten by half the attendees within 24 hours. Action items are texted in Slack, then lost. The context built in the meeting — why a decision was made, what alternatives were considered — is gone before the meeting room door closes.

Calendar tools schedule meetings. No tool understands them. FLOW does.

---

## Module Scope

```
Meeting Intelligence
├── Pre-Meeting Preparation         — AI context brief before every meeting
├── Real-Time Intelligence          — live action item + decision capture
├── Post-Meeting Processing         — structured summary + decision extraction
├── Action Item Tracking            — follow-up intelligence across meetings
├── Meeting ROI Analysis            — cost vs. outcome scoring
└── Meeting Network Analysis        — who meets with whom and why
```

---

## Signature Workflows

### 1. Pre-Meeting Intelligence Brief

**Trigger:** Meeting starts in 30 minutes (scheduled job) or manual request  
**FLOW action:**
- RAG query over workspace intelligence using meeting title + attendee names
- Pull: related Jira issues, recent emails from attendees, decisions referenced in meeting title, last meeting with same group (outcomes, open action items)
- Generate structured brief:
  - **Context:** what this meeting is about, relevant history
  - **Key Participants:** who they are, their recent activity on this topic
  - **Open Items from Last Meeting:** action items that weren't closed
  - **Suggested Questions:** based on what FLOW knows about the topic
  - **Related Decisions:** prior decisions that this meeting may revisit or be affected by

**Example — "Q3 Roadmap Review" meeting:**  
> "3 decisions from your last roadmap review are still open. The auth rewrite (decided 2024-11-15) was meant to complete by Q1 but the GitHub milestone is 0% complete. Sarah C. is attending — she owns the auth rewrite. Consider asking for a timeline update."

### 2. AI Meeting Notes Capture

**Trigger:** Live Meeting view open (`/meetings/live/:eventId`) + speech-to-text (requires STT API)  
**FLOW action (current — without STT):**
- HR/facilitator types notes during the meeting into FLOW
- FLOW auto-classifies each note as: ACTION_ITEM | DECISION | CONTEXT | RISK | BLOCKER
- Suggests: "This sounds like a decision — should I store it in the Decision Register?"
- Tags: assigns owner to action items based on who is mentioned
- Cross-references: "This decision conflicts with a prior decision from 2024-11-15 — @author made the original decision. Include them?"

**FLOW action (future — with STT API):**
- Live transcription via Google Speech-to-Text or Whisper API
- Real-time extraction: every DECISION and ACTION_ITEM surfaced instantly
- Speaker identification: "Sarah: Let's push the auth rewrite to Q4" → DECISION extracted, attributed to Sarah

### 3. Post-Meeting Summary & Distribution

**Trigger:** Meeting ends (calendar event past end time)  
**FLOW action:**
- Synthesize all captured notes into: Summary, Decisions Made, Action Items (with owner + deadline), Open Questions, Risks Identified
- Auto-populate Notion page (if Notion connected) or Google Doc
- Sync to Jira: create Jira issues from action items tagged as TASK
- Sync to CRM: if external customer attendees, update CRM account with meeting summary + action items
- Distribute: email to attendees (or Slack DM) with summary + action items

### 4. Action Item Intelligence

**Trigger:** Continuous + weekly check-in  
**FLOW action:**
- Track all meeting action items across the workspace
- Monitor: is the action item mentioned in any subsequent communication? Has a PR been opened that resolves it?
- Alert: "Action item from 2026-06-15 'Deploy auth service to staging' is 7 days past deadline. No mention in Slack or GitHub in the past 5 days. Owner: David O."
- Surface in daily briefing: open action items by due date
- Link: "This Jira issue was created from the Q3 Planning meeting action item."

### 5. Meeting ROI Analysis

**Trigger:** Monthly report; on-demand  
**FLOW action:**
- Compute per meeting: cost (attendees × salary rate × duration), decisions made, action items generated, follow-up rate (% of action items closed within 7 days)
- Score: `ROI = (decisions × businessImpact) + (closedActionItems × 10) — (costOfMeeting)`
- Surface: "Your team ran 34 meetings last month. Total cost: ~$28,000. 12 meetings produced no tracked decisions or action items ($8,200 with unclear ROI). Consider converting to async updates."
- Identify: recurring meetings with consistently low ROI → recommend cancellation or format change

---

## Reused FLOW Components

| Component | Role |
|---|---|
| GoogleCalendarAdapter | Event lifecycle + extended properties for notes/actions |
| GmailAdapter | Post-meeting email distribution |
| JiraAdapter | Action item → Jira issue creation |
| NotionAdapter | Summary → Notion page |
| HubSpotAdapter | Customer meeting → CRM update |
| Operational Brain | Pre-meeting RAG context + copilot during meetings |
| Decision Engine | Decision capture + conflict detection |
| Org Memory | Historical meeting + decision memory |
| Vector Store | Semantic search for meeting context |
| Meeting Components (MeetingDashboard, LiveMeeting, MeetingSummary) | Frontend — already built in Phase 5.5 |

---

## New Services Required

| Service | Purpose |
|---|---|
| `meetingBriefService.js` | Extend existing briefing engine with meeting-specific context |
| `actionItemTrackingService.js` | Cross-meeting action item tracking + closure detection |
| `meetingRoiService.js` | Cost calculation + outcome scoring |
| `noteClassifierService.js` | Auto-classify notes as ACTION/DECISION/CONTEXT/RISK |
| `sttIntegrationService.js` | (Future) Speech-to-text API adapter |

---

## Data Architecture Additions

```prisma
model MeetingActionItem {
  id          String   @id @default(cuid())
  orgId       String
  workspaceId String
  eventId     String                       // Google Calendar event ID
  text        String
  ownerId     String?                      // FLOW User.id
  deadline    DateTime?
  jiraIssueId String?
  status      ActionItemStatus @default(OPEN)
  closedAt    DateTime?
  closedBy    String?                      // how it was closed (JIRA | SLACK | MANUAL)
  evidence    String?                      // text snippet that shows it was closed
  createdAt   DateTime @default(now())
}

enum ActionItemStatus { OPEN OVERDUE CLOSED CANCELLED }
```

---

## API Additions

```
GET  /api/meetings/intelligence/action-items       — All open action items for workspace
GET  /api/meetings/intelligence/roi                — Meeting ROI report for period
GET  /api/meetings/intelligence/network            — Meeting network graph (who meets with whom)
POST /api/meetings/event/:id/notes/classify        — Auto-classify free-text notes
```

---

## Competitive Differentiation

**vs. Otter.ai / Fireflies.ai:** They transcribe and summarize. FLOW connects the summary to the work: the Jira issue that was blocked, the CRM customer who was discussed, the decision from 3 months ago that this meeting revisited.

**vs. Notion AI (meeting notes):** FLOW surfaces context *before* the meeting, not just after. It knows what open action items carry into this meeting.

**vs. Zoom AI Companion:** Zoom-only. FLOW works across Google Meet, Zoom, Teams by extracting intelligence from the calendar event and associated communication — not from the call itself.

**FLOW's moat:** Cross-system context. "The TechCorp renewal meeting has 3 open action items from 6 weeks ago that were never completed. The customer health score is 42/100. The CSM hasn't responded to their last email in 8 days. Going into this meeting cold is a risk." No meeting tool says this because no meeting tool knows any of it.

---

## Roadmap Stage

**Phase 5.5** (Current): Calendar integration, meeting CRUD, pre-meeting RAG context — production  
**Phase 7.0** (Current): AI copilot in meetings, decision capture — production  
**Phase 8.0** (Beta): Action item tracking, post-meeting distribution  
**Phase 11.6** (Post-Beta): Meeting ROI analysis, network analysis, STT integration

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
