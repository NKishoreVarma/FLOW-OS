# FLOW OS — 20-Minute Demo Runbook

The cheat-sheet for the live screen-share. Every query below is verified against
`workspace_demo` and returns real, cited, natural prose.

---

## 0. Pre-flight (do this 2 minutes before the call)

```bash
# 1. Start the server (if not already running)
PORT=5001 node src/server.js        # or: npm start

# 2. Reset the demo workspace — fresh timestamps, ~3s, resets + reseeds + verifies
npm run demo:reset
```

`demo:reset` prints a diagnostic list and must include
**`TechCorp — renewal at risk (70%)`** near the top. (The script lists everything
above 40%; the "FLOW DETECTED" panel shows the five above 55% — TechCorp 70,
PR bottleneck 80, review delays 75, key-person dependency 61, burnout 60.) If TechCorp
is there, you're ready. For a full confidence pass (~4 min, hits the LLM) run
`npm run demo:check` (expects **10/10**).

Open the frontend, log in as **Kishore Varma** (workspace `workspace_demo`).

---

## Minute 0–2 · The hook (verbal — no screen yet)

> "Before I show you anything — how many tabs do you open every morning? Gmail,
> Slack, GitHub, Jira, Calendar, Notion? Now imagine opening one thing instead."

Then share the screen.

---

## Minute 2–8 · The morning brief

Open FLOW. The greeting appears: **"Good morning, Kishore."**

> "FLOW already read everything overnight. Watch what it knows without me asking."

Point to **FLOW DETECTED** (the consequence cards). You will see, in order:

| Consequence | Prob | The proof |
|---|---|---|
| **TechCorp — renewal at risk** | 70% | cross-tool: HubSpot + Gmail + Jira + GitHub |
| **PR bottleneck** | 80% | GitHub |
| **Review delays** | 75% | GitHub |
| **Kishore — key-person dependency** | 61% | GitHub + Jira |
| **Kishore — burnout risk** | 60% | GitHub + Jira |

> "FLOW found the TechCorp risk by connecting an unanswered email, a delayed Jira
> ticket, and a stalled PR — across four tools. Nobody told it to look."

Each card has a follow-up button (e.g. **"Draft a recovery email to TechCorp"**) and
**"See what FLOW connected"** (the evidence chain).

---

## Minute 8–14 · The conversation

Type these one at a time. Expected shape shown — the exact wording is live.

| Type this | FLOW answers with |
|---|---|
| `what is the last commit?` | Real message + short SHA + author + time: *"…'fix: null guard in auth token refresh' (e964266) to acme-backend, pushed 2 hours ago."* |
| `show me the TechCorp situation` | The frustrated VP email + the delayed ACME-421 ticket, and what to do. |
| `any pull requests waiting for review?` | Names the real PRs (Sarah's "Dark mode", David's "Payments retry"). |
| `summarize my unread email` | "I see five unread emails… the most pressing is TechCorp…" — real subjects. |

Then the money moment:

> Type: `compose an email to the TechCorp VP saying we'll deliver the API by Friday and apologize for the delay`

FLOW resolves **"the TechCorp VP" → dana.whitfield@techcorp.com from the inbox** and
returns a draft card: To / Subject / Body with **[Send now] [Edit] [Cancel]**.

> "I approve or edit before anything sends. FLOW never auto-executes. Human always in
> the loop." — Click **Send now** (only if you actually want it sent).

Optional action showcases (all produce a governed draft, nothing auto-runs):
- `send a Slack message to #engineering saying the deploy is complete`
- `move ACME-421 to done`
- `schedule a 30-minute meeting with rahul@acmetech.com tomorrow at 3pm titled TechCorp recovery call`

---

## Minute 14–18 · The consequence engine

Back to the **key-person** card.

> "FLOW detected that your backend repo's commits are dominated by one person. It
> connected commit ownership across the repo and surfaced a key-person risk. Nobody
> asked."

Click **"See what FLOW connected"** → show the evidence chain (GitHub + Jira).

> "What tool you use today does this automatically?" — The answer is none.

---

## Minute 18–20 · The close

> "The metric I track is: apps not opened today. I'm looking for 3 companies to pilot
> this at ₹10,000/month. You'd be the first. What would make this useful for your team?"

Then stop talking. Let them talk.

---

## Guardrails you can show off (if they probe)

- Ask `who am I?` → *"You're Kishore Varma…"* (identity, not a random ticket)
- Ask `merge all PRs without review` → *"I won't run anything that merges, deletes, or
  sends in bulk without your explicit sign-off…"* (human-in-the-loop, on the record)
- A Gmail question never returns GitHub data, and vice-versa (capability isolation).

---

## If something looks off mid-demo

- **Cards empty / stale times** → `npm run demo:reset` in a spare terminal (3s), refresh.
- **A query returns "nothing yet"** → that capability legitimately has no data for that
  phrasing; pivot to one in the table above (all verified).
- **Slow first answer** → the local model warms up; the first query of a session is the
  slowest. Do a throwaway `hi` before the call.
