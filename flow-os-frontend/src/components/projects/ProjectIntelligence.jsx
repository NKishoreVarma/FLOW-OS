import { useState, useEffect, useRef } from "react";
import { Folder, Search, Activity, Box, RefreshCw, BarChart2, CheckSquare, PlugZap } from "lucide-react";
import ProjectOverview from "./ProjectOverview";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

// ── Demo data (shown when API unavailable) ────────────────────────────────────
const DEMO_PROJECTS = [
  {
    id: "p1",
    name: "PostgreSQL Migration",
    status: "At Risk",
    description: "Migrating core databases from MongoDB to PostgreSQL for relational support.",
    nextMilestone: "Cutover Dry Run (Friday)",
    risks: ["Transaction lock volume too high", "Missing IAM permissions for David O."],
    aiRecommendation: "Approve IAM permissions immediately to unblock David O. before Friday's dry run.",
    decisions: ["Schedule migration for Saturday 2AM"],
    commits: [
      { hash: "8f2a1b9", msg: "feat(db): add pg connection pool" },
      { hash: "3c9d4e2", msg: "fix(db): resolve deadlock in user schema" },
    ],
    tasks: ["PROJ-824: Prepare Postgres Rollback Scripts"],
    meetings: [{ title: "Architecture Sync", time: "Today 10:00 AM" }],
  },
  {
    id: "p2",
    name: "FLOW Interface Rewrite",
    status: "On Track",
    description: "Migrating from TSX to standard JSX and implementing Apple Liquid Glass design system.",
    nextMilestone: "Component Library Finalized",
    risks: ["Missing Figma tokens for dark mode"],
    aiRecommendation: "Schedule a 15-minute sync with the design team to retrieve missing tokens.",
    decisions: ["Deprecate legacy TypeScript models"],
    commits: [
      { hash: "7a8b9c0", msg: "style: implement Liquid Glass Card" },
      { hash: "1d2e3f4", msg: "refactor: convert MeetingDashboard to JSX" },
    ],
    tasks: ["PROJ-711: Build Project Intelligence UI"],
    meetings: [{ title: "Design System Review", time: "Yesterday 3:00 PM" }],
  },
];

const DEMO_JIRA_PROJECTS = [
  {
    id: "proj-1",
    key: "PROJ",
    name: "PostgreSQL Migration",
    status: "At Risk",
    description: "Migrating core databases from MongoDB to PostgreSQL for relational support.",
    isJira: true,
    sprintName: "Sprint 22",
    sprintStatus: "active",
    burndown: { plannedPoints: 50, completedPoints: 28 },
    issues: [
      {
        key: "PROJ-824",
        title: "Prepare Postgres Rollback Scripts",
        status: "Blocked",
        priority: "P0",
        assignee: "David O.",
        aiIntelligence: {
          aiSummary: "Critical blocker for Postgres dry run migration.",
          businessImpact: "High risk of migration failure and extended downtime if cutover fails.",
          riskScore: 88,
          suggestedNextAction: "Approve AWS IAM console access policies immediately."
        }
      },
      {
        key: "PROJ-711",
        title: "Build Project Intelligence UI",
        status: "In Progress",
        priority: "P2",
        assignee: "Kishore Varma",
        aiIntelligence: {
          aiSummary: "Standard visual widget reporting panel.",
          businessImpact: "Improves developer observability metrics visibility.",
          riskScore: 20,
          suggestedNextAction: "Complete standard React components verification."
        }
      }
    ]
  },
  {
    id: "proj-2",
    key: "FLOW",
    name: "FLOW Interface Rewrite",
    status: "On Track",
    description: "Migrating from TSX to standard JSX and implementing Apple Liquid Glass design system.",
    isJira: true,
    sprintName: "Sprint 22",
    sprintStatus: "active",
    burndown: { plannedPoints: 40, completedPoints: 32 },
    issues: [
      {
        key: "FLOW-102",
        title: "Fix auth login loop",
        status: "Done",
        priority: "P1",
        assignee: "Sarah Chen",
        aiIntelligence: {
          aiSummary: "Critical login stabilization bugfix.",
          businessImpact: "Prevents developers from getting locked out of the dashboard.",
          riskScore: 5,
          suggestedNextAction: "Verify CORS wildcard and cookies status."
        }
      },
      {
        key: "FLOW-103",
        title: "Implement Workspace Admin Panel",
        status: "Review",
        priority: "P2",
        assignee: "Kishore Varma",
        aiIntelligence: {
          aiSummary: "Admin panel interface creation.",
          businessImpact: "Gives compliance teams visual dashboard oversight.",
          riskScore: 35,
          suggestedNextAction: "Refactor ESLint unused imports."
        }
      }
    ]
  }
];

// ── Normalizers ───────────────────────────────────────────────────────────────

function repoStatus(repo, prs) {
  const atRisk = prs.some(
    pr => pr.metadata?.mergeReadinessScore < 50 || pr.metadata?.reviewStatus === "changes_requested"
  );
  if (atRisk)                             return "At Risk";
  if (repo.metadata?.openIssues > 10)     return "At Risk";
  return "On Track";
}

function normalizeRepoToProject(repo, prs, commits) {
  const openPRs = prs.filter(pr => pr.status === "open" || pr.status === "draft");

  const tasks = openPRs.slice(0, 3).map(pr => pr.metadata?.number ? `PR #${pr.metadata.number}: ${pr.title}` : pr.title);
  if (repo.metadata?.openIssues > 0) {
    tasks.push(`${repo.metadata.openIssues} open issue${repo.metadata.openIssues !== 1 ? "s" : ""}`);
  }

  const decisions = openPRs
    .filter(pr => pr.metadata?.reviewStatus === "approved")
    .slice(0, 2)
    .map(pr => `Approved: ${pr.title}`);

  const risks = [];
  const atRiskPRs = openPRs.filter(pr => pr.metadata?.mergeReadinessScore < 50);
  if (atRiskPRs.length) risks.push(`${atRiskPRs.length} PR(s) not ready to merge`);
  if (openPRs.some(pr => pr.metadata?.reviewStatus === "changes_requested"))
    risks.push("Changes requested on open PRs");
  if (repo.metadata?.openIssues > 10) risks.push(`${repo.metadata.openIssues} open issues need triage`);
  if (!risks.length) risks.push("No critical risks detected");

  const topPR = openPRs[0];
  const prRef = topPR?.metadata?.number ? `PR #${topPR.metadata.number}` : topPR?.title || "PR";
  const aiRecommendation = topPR
    ? topPR.metadata?.mergeReadinessScore >= 70
      ? `${prRef} "${topPR.title}" is ready to merge (score ${topPR.metadata?.mergeReadinessScore}/100).`
      : `Review ${prRef} — merge readiness is ${topPR.metadata?.mergeReadinessScore}/100. Address review comments before merging.`
    : `No open pull requests. Repo ${repo.title} is in a stable state.`;

  const normalizedCommits = commits.slice(0, 3).map(c => ({
    hash: (c.metadata?.shortSha || c.id?.slice(0, 7) || "unknown"),
    sha:  c.metadata?.sha || c.id || null,
    msg:  c.title || "",
  }));

  const pushedAgo = repo.metadata?.pushedAt
    ? (() => {
        const diffDays = Math.floor((Date.now() - new Date(repo.metadata.pushedAt).getTime()) / 86400000);
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        return `${diffDays} days ago`;
      })()
    : null;

  return {
    id:               repo.id,
    name:             repo.title,
    status:           repoStatus(repo, prs),
    description:      repo.description || `${repo.metadata?.language || "Code"} repository.`,
    nextMilestone:    pushedAgo ? `Last push: ${pushedAgo}` : "Active development",
    risks,
    aiRecommendation,
    decisions:        decisions.length ? decisions : ["No approved PRs yet"],
    commits:          normalizedCommits.length ? normalizedCommits : [{ hash: "—", msg: "No recent commits" }],
    tasks:            tasks.length ? tasks : ["No open pull requests"],
    meetings:         [],
    isDemo:           false,
    repoFullName:     repo.repo,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ProjectIntelligence = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';

  const [activeTab, setActiveTab]     = useState("jira"); // "jira" or "github"
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects]       = useState([]);
  const [jiraProjects, setJiraProjects] = useState([]);
  const [, setSprints]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [isDemo, setIsDemo]           = useState(false);
  const fetchRef = useRef(null);

  useEffect(() => {
    if (isAuthLoading) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      if (token && workspaceId) {
        const headers = { Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
        try {
          // 1. Fetch Jira Projects & Sprints
          const [projRes, sprintsRes] = await Promise.allSettled([
            fetch("/api/work/projects", { headers }),
            fetch("/api/work/sprints", { headers })
          ]);

          let sprintList = [];
          if (sprintsRes.status === "fulfilled" && sprintsRes.value.ok) {
            const sprintData = await sprintsRes.value.json();
            sprintList = sprintData.result || [];
            setSprints(sprintList);
          }

          let activeJira = [];
          if (projRes.status === "fulfilled" && projRes.value.ok) {
            const projData = await projRes.value.json();
            const projectsList = projData.result || [];
            
            // Enrich with issues per project
            activeJira = await Promise.all(projectsList.map(async p => {
              const issuesRes = await fetch(`/api/work/issues?projectKey=${p.key}`, { headers });
              const issuesData = issuesRes.ok ? await issuesRes.json() : {};
              const issues = issuesData.result || [];

              // Calculate active sprint
              const sprint = sprintList.find(s => s.status === 'active') || { name: 'Sprint 22', id: 22 };

              const openCount = issues.filter(i => i.status !== 'Done').length;
              const status = openCount > 1 ? "At Risk" : "On Track";

              return {
                id: p.id,
                key: p.key,
                name: p.name,
                description: `${p.name} board and sprints management.`,
                status,
                isJira: true,
                sprintName: sprint.name,
                burndown: { plannedPoints: 50, completedPoints: 32 },
                issues
              };
            }));
          }

          // 2. Fetch GitHub Repos
          const reposRes = await fetch("/api/engineering/repos?limit=5", { headers });
          if (reposRes.ok) {
            const reposData = await reposRes.json();
            const repos = Array.isArray(reposData.result) ? reposData.result : [];

            const enriched = await Promise.all(
              repos.slice(0, 5).map(async repo => {
                const fullName = repo.repo;
                if (!fullName || !fullName.includes("/")) return { repo, prs: [], commits: [] };
                const [owner, repoName] = fullName.split("/");

                const [prsRes, commitsRes] = await Promise.allSettled([
                  fetch(`/api/engineering/repos/${owner}/${repoName}/pulls?state=open&limit=10`, { headers }),
                  fetch(`/api/engineering/repos/${owner}/${repoName}/commits?limit=5`, { headers }),
                ]);

                const prs = prsRes.status === "fulfilled" && prsRes.value.ok
                  ? (await prsRes.value.json()).result || []
                  : [];
                const commits = commitsRes.status === "fulfilled" && commitsRes.value.ok
                  ? (await commitsRes.value.json()).result || []
                  : [];

                return { repo, prs: Array.isArray(prs) ? prs : [], commits: Array.isArray(commits) ? commits : [] };
              })
            );

            if (!cancelled) {
              setProjects(enriched.map(({ repo, prs, commits }) =>
                normalizeRepoToProject(repo, prs, commits)
              ));
              if (activeJira.length > 0) {
                setJiraProjects(activeJira);
              } else {
                setJiraProjects(isDemoWorkspace ? DEMO_JIRA_PROJECTS : []);
              }
              setIsDemo(false);
              setLoading(false);
            }
            return;
          }
        } catch {
          // Fall through to demo data
        }
      }

      if (!cancelled) {
        if (isDemoWorkspace) {
          setProjects(DEMO_PROJECTS);
          setJiraProjects(DEMO_JIRA_PROJECTS);
          setIsDemo(true);
        } else {
          setProjects([]);
          setJiraProjects([]);
          setIsDemo(false);
        }
        setLoading(false);
      }
    }

    fetchRef.current = load;
    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, token, workspaceId]);

  const filteredJira = jiraProjects.filter(p =>
    !searchQuery ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGitHub = projects.filter(p =>
    !searchQuery ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentDisplayList = activeTab === "jira" ? filteredJira : filteredGitHub;
  const atRiskCount  = currentDisplayList.filter(p => p.status === "At Risk").length;
  const onTrackCount = currentDisplayList.filter(p => p.status === "On Track").length;

  if (loading) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[80, 200, 200].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
    );
  }

  const TabBtn = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "7px 14px", fontSize: 12, fontWeight: 500,
        borderRadius: 4, cursor: "pointer",
        background: activeTab === id ? "rgba(232,103,43,0.08)" : "transparent",
        border: `1px solid ${activeTab === id ? "rgba(232,103,43,0.30)" : "transparent"}`,
        color: activeTab === id ? "var(--brand-text)" : "var(--t4)",
        transition: "all 100ms",
      }}
      onMouseEnter={e => { if (activeTab !== id) { e.currentTarget.style.color = "var(--t2)"; } }}
      onMouseLeave={e => { if (activeTab !== id) { e.currentTarget.style.color = "var(--t4)"; } }}
    >
      <Icon style={{ width: 12, height: 12 }} />
      {label}
    </button>
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Folder style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>
              Project Intelligence
            </h1>
            <DataSourceBadge mode={isDemo ? "demo" : "live"} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            {isDemo
              ? "Connect Jira and GitHub via Settings to see live boards."
              : "Realtime Agile board transitions and code repository health scoring."}
          </p>
        </div>
        <button
          onClick={() => fetchRef.current?.()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", fontSize: 12, fontWeight: 500,
            color: "var(--t3)", background: "rgba(31,27,22,0.045)",
            border: "1px solid var(--border)", borderRadius: 4,
            cursor: "pointer", transition: "color 100ms",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--t1)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
        >
          <RefreshCw style={{ width: 11, height: 11 }} />
          Refresh
        </button>
      </div>

      {/* Tabs + Search row */}
      <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 12 }}>
          <TabBtn id="jira"   icon={CheckSquare} label="Sprint Boards (Jira)" />
          <TabBtn id="github" icon={BarChart2}   label="Code Repos (GitHub)" />
          <div style={{ flex: 1 }} />
          {atRiskCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--p-high)", fontWeight: 500 }}>
              <Activity style={{ width: 11, height: 11 }} />{atRiskCount} at risk
            </span>
          )}
          {onTrackCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--p-normal)", fontWeight: 500 }}>
              <Box style={{ width: 11, height: 11 }} />{onTrackCount} on track
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 560, marginBottom: 24 }}>
        <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--t5)" }} />
        <input
          type="text"
          placeholder={activeTab === "jira" ? "Search Jira boards by key or name…" : "Search GitHub repositories…"}
          style={{
            width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-strong)",
            borderRadius: 4, paddingLeft: 34, paddingRight: 14, paddingTop: 8, paddingBottom: 8,
            fontSize: 12, color: "var(--t1)", outline: "none",
          }}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onFocus={e => { e.target.style.border = "1px solid rgba(232,103,43,0.35)"; e.target.style.background = "rgba(232,103,43,0.04)"; }}
          onBlur={e => { e.target.style.border = "1px solid var(--border-strong)"; e.target.style.background = "var(--bg-card)"; }}
        />
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {currentDisplayList.length === 0 && !searchQuery && !loading && !isDemoWorkspace ? (
          <div style={{ textAlign: "center", padding: "64px 24px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)" }}>
            <PlugZap style={{ width: 28, height: 28, color: "var(--t5)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--t2)", marginBottom: 6 }}>
              {activeTab === "jira" ? "Connect Jira to see your sprint boards" : "Connect GitHub to see your repositories"}
            </p>
            <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 16 }}>
              {activeTab === "jira"
                ? "FLOW will surface blockers, sprint velocity, and AI-recommended actions."
                : "FLOW will score PR merge readiness, deployment risk, and code ownership."}
            </p>
            <a href="/integrations" style={{ display: "inline-block", fontSize: 12, fontWeight: 500, color: "var(--brand)", background: "rgba(232,103,43,0.08)", padding: "7px 16px", borderRadius: 4, textDecoration: "none" }}>
              Connect {activeTab === "jira" ? "Jira" : "GitHub"} →
            </a>
          </div>
        ) : currentDisplayList.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--t4)", fontSize: 13, padding: "48px 0" }}>
            No items match your search.
          </div>
        ) : (
          currentDisplayList.map(p => <ProjectOverview key={p.id} project={p} />)
        )}
      </div>
    </div>
  );
};

export default ProjectIntelligence;
