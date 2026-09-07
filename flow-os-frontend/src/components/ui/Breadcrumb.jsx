import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

// Path → human-readable label. Exact matches first, then prefix patterns.
const PATH_LABELS = {
  "/":                   null,          // Home has no breadcrumb (it's the root)
  "/inbox":              ["Inbox"],
  "/projects":           ["Engineering"],
  "/meetings":           ["Meetings"],
  "/knowledge":          ["Knowledge"],
  "/chief":              ["Chief of Staff"],
  "/review":             ["Weekly Review"],
  "/people":             ["People"],
  "/customers":          ["Customers"],
  "/council":            ["Executive Council"],
  "/integrations":       ["Integrations"],
  "/activity":           ["Activity"],
  "/success":            ["Value"],
  "/entity":             ["Entity"],
  "/welcome":            null,
  "/query":              ["Developer Console"],
  "/help":               ["Help"],
  // Settings sub-pages
  "/settings":           ["Settings"],
  "/settings/iam":       ["Settings", "IAM"],
  "/settings/governance":["Settings", "Governance"],
  "/settings/audit":     ["Settings", "Audit"],
  "/settings/security":  ["Settings", "Security"],
  "/settings/health":    ["Settings", "Health"],
  "/settings/billing":   ["Settings", "Billing"],
  "/settings/team":      ["Settings", "Team"],
  "/settings/permissions": ["Settings", "Permissions"],
  "/settings/integrations": ["Settings", "Integrations"],
  "/settings/import":    ["Settings", "Import"],
  "/settings/onboarding":["Settings", "Onboarding"],
  "/settings/evaluation":["Settings", "Evaluation"],
  "/settings/marketplace":["Settings", "Marketplace"],
  "/settings/workspaces":["Settings", "Workspaces"],
};

function getCrumbs(pathname) {
  // Exact match
  if (PATH_LABELS[pathname] !== undefined) return PATH_LABELS[pathname];

  // Meetings sub-pages: /meetings/:id/prep|live|summary
  if (pathname.startsWith("/meetings/")) {
    const seg = pathname.split("/");
    const sub = seg[3]; // prep | live | summary
    if (sub === "prep")    return ["Meetings", "Preparation"];
    if (sub === "live")    return ["Meetings", "Live"];
    if (sub === "summary") return ["Meetings", "Summary"];
    return ["Meetings"];
  }

  // Entity deep-links
  if (pathname.startsWith("/entity/")) return ["Entity"];

  // Fallback: tokenize path
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "));
}

export function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const crumbs = getCrumbs(pathname);
  if (!crumbs || crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 24px",
        borderBottom: "1px solid var(--line-0)",
        background: "var(--surface-0)",
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => navigate("/")}
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          fontWeight: 300,
          color: "var(--t4)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
        }}
        aria-label="Go to Home"
      >
        Home
      </button>
      {crumbs.map((label, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronRight style={{ width: 10, height: 10, color: "var(--t5)", flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: isLast ? 400 : 300,
                color: isLast ? "var(--t2)" : "var(--t4)",
                lineHeight: 1,
              }}
              aria-current={isLast ? "page" : undefined}
            >
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
