/**
 * SettingsShell — universal wrapper for every /settings/* page.
 *
 * Provides: sticky page header + description, category sidebar nav,
 * search-within-settings, unsaved-changes detection, sticky save bar,
 * reset-to-defaults, import/export, and success confirmation toast.
 *
 * Usage:
 *   <SettingsShell
 *     title="Identity & Access"
 *     description="Manage users, roles, and workspace membership."
 *     category="access"
 *     isDirty={isDirty}
 *     onSave={handleSave}
 *     onReset={handleReset}
 *     saving={saving}
 *   >
 *     {children}
 *   </SettingsShell>
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Building, Users, Shield, CreditCard, Link2, Brain, FileText,
  Activity, Search, Save, RotateCcw, Download, Upload, Check,
  ChevronRight, AlertTriangle, Sliders, HelpCircle, Tag,
} from "lucide-react";

const NAV = [
  {
    group: "Workspace",
    items: [
      { label: "Overview",      path: "/settings",              icon: Building,  desc: "Organization and workspace configuration" },
      { label: "Workspaces",    path: "/settings/workspaces",   icon: Sliders,   desc: "Manage multiple workspaces" },
    ],
  },
  {
    group: "Access",
    items: [
      { label: "Identity & Access", path: "/settings/iam",       icon: Users,     desc: "Users, roles, and permissions" },
      { label: "Security",          path: "/settings/security",  icon: Shield,    desc: "Authentication and security settings" },
      { label: "Governance",        path: "/settings/governance",icon: FileText,  desc: "Policies, approvals, and audit rules" },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Integrations",    path: "/settings/integrations",   icon: Link2,     desc: "Connected tools and OAuth apps" },
      { label: "Permissions",     path: "/settings/permissions",    icon: Shield,    desc: "Resource allow/deny rules" },
      { label: "AI Orchestrator", path: "/settings/ai",             icon: Brain,     desc: "Model routing, prompts, evaluation" },
      { label: "Health",          path: "/settings/health",         icon: Activity,  desc: "Workspace and connector health" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "Billing",        path: "/settings/billing",     icon: CreditCard, desc: "Plan, usage, and invoices" },
      { label: "Marketplace",    path: "/settings/marketplace", icon: Tag,        desc: "Extensions and integrations" },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Audit Log",      path: "/settings/audit",       icon: FileText,   desc: "Activity history and compliance" },
      { label: "Import / Setup", path: "/settings/import",      icon: Download,   desc: "Workspace lifecycle and data import" },
      { label: "Release Notes",  path: "/settings/releases",    icon: Tag,        desc: "What's new, version history" },
      { label: "Help & Docs",    path: "/help",                 icon: HelpCircle, desc: "Documentation, shortcuts, support" },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap(g => g.items);

function useBeforeUnload(isDirty) {
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

export default function SettingsShell({
  title,
  description,
  category,
  isDirty = false,
  onSave,
  onReset,
  onExport,
  onImport,
  saving = false,
  saved = false,
  children,
  actions,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const fileRef = useRef();

  useBeforeUnload(isDirty);

  useEffect(() => {
    if (saved) {
      setShowSavedBanner(true);
      const t = setTimeout(() => setShowSavedBanner(false), 2800);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const filtered = search.trim()
    ? ALL_ITEMS.filter(i =>
        i.label.toLowerCase().includes(search.toLowerCase()) ||
        i.desc.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const handleNavClick = useCallback((path) => {
    if (isDirty && path !== location.pathname) {
      setPendingNav(path);
      setShowDiscardConfirm(true);
    } else {
      navigate(path);
    }
  }, [isDirty, location.pathname, navigate]);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { onImport(JSON.parse(ev.target.result)); } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const sidebarW = 208;

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-base)", position: "relative" }}>

      {/* ── Left sidebar nav ─────────────────────────────────────────── */}
      <aside style={{
        width: sidebarW, flexShrink: 0, borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", height: "100%", overflowY: "auto",
        background: "var(--bg-sidebar)",
      }}>
        {/* Search */}
        <div style={{ padding: "12px 10px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 8px" }}>
            <Search style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search settings…"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 11, color: "var(--t1)", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {/* Results or full nav */}
        <div style={{ flex: 1, padding: "0 6px 12px" }}>
          {filtered ? (
            <div>
              <p style={{ fontSize: 9, color: "var(--t5)", padding: "6px 8px 3px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
              {filtered.length === 0 ? (
                <p style={{ fontSize: 11, color: "var(--t4)", padding: "8px 8px" }}>No settings match "{search}"</p>
              ) : filtered.map(item => (
                <NavItem key={item.path} item={item} current={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
              ))}
            </div>
          ) : (
            NAV.map(group => (
              <div key={group.group} style={{ marginBottom: 6 }}>
                <p style={{ fontSize: 9, color: "var(--t5)", padding: "8px 8px 3px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
                  {group.group}
                </p>
                {group.items.map(item => (
                  <NavItem key={item.path} item={item} current={location.pathname === item.path} onClick={() => handleNavClick(item.path)} />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Page header */}
        <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "var(--t5)", cursor: "pointer" }} onClick={() => handleNavClick("/settings")}>Settings</span>
                {title && <><ChevronRight style={{ width: 9, height: 9, color: "var(--t5)" }} /><span style={{ fontSize: 10, color: "var(--t3)" }}>{title}</span></>}
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", margin: 0, letterSpacing: "-0.01em" }}>{title || "Settings"}</h1>
              {description && <p style={{ fontSize: 12, color: "var(--t4)", margin: "4px 0 0", lineHeight: 1.5 }}>{description}</p>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {actions}
              {onExport && (
                <ActionBtn icon={Download} label="Export" onClick={onExport} />
              )}
              {onImport && (
                <>
                  <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
                  <ActionBtn icon={Upload} label="Import" onClick={() => fileRef.current?.click()} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Unsaved changes banner */}
        {isDirty && (
          <div style={{
            background: "rgba(169,106,11,0.08)", borderBottom: "1px solid rgba(169,106,11,0.22)",
            padding: "8px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AlertTriangle style={{ width: 12, height: 12, color: "var(--p-high)" }} />
              <span style={{ fontSize: 12, color: "var(--p-high-text)", fontWeight: 500 }}>You have unsaved changes</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onReset && <button onClick={onReset} style={ghostSm}>Discard</button>}
              {onSave && <button onClick={onSave} disabled={saving} style={primarySm}>{saving ? "Saving…" : "Save now"}</button>}
            </div>
          </div>
        )}

        {/* Success banner */}
        {showSavedBanner && (
          <div style={{
            background: "rgba(30,127,79,0.08)", borderBottom: "1px solid rgba(30,127,79,0.22)",
            padding: "8px 28px", display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
          }}>
            <Check style={{ width: 12, height: 12, color: "var(--p-normal-text)" }} />
            <span style={{ fontSize: 12, color: "var(--p-normal-text)", fontWeight: 500 }}>Settings saved</span>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 80px" }}>
          {children}
        </div>

        {/* Sticky save bar */}
        {(onSave || onReset) && (
          <div style={{
            position: "sticky", bottom: 0, borderTop: "1px solid var(--border)",
            background: "var(--bg-sidebar)", padding: "10px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0, zIndex: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isDirty ? (
                <><AlertTriangle style={{ width: 11, height: 11, color: "var(--p-high)" }} />
                <span style={{ fontSize: 11, color: "var(--p-high-text)" }}>Unsaved changes</span></>
              ) : (
                <><Check style={{ width: 11, height: 11, color: "var(--p-normal-text)" }} />
                <span style={{ fontSize: 11, color: "var(--t4)" }}>All changes saved</span></>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onReset && (
                <button onClick={onReset} style={ghostSm}>
                  <RotateCcw style={{ width: 10, height: 10 }} /> Reset to defaults
                </button>
              )}
              {onSave && (
                <button onClick={onSave} disabled={saving || !isDirty} style={{ ...primarySm, opacity: (!isDirty || saving) ? 0.5 : 1, cursor: (!isDirty || saving) ? "not-allowed" : "pointer" }}>
                  <Save style={{ width: 10, height: 10 }} /> {saving ? "Saving…" : "Save changes"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Discard-changes confirm dialog */}
      {showDiscardConfirm && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.4)", zIndex: 1000 }} onClick={() => setShowDiscardConfirm(false)} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)",
            borderRadius: 8, padding: 24, width: 340, zIndex: 1001, boxShadow: "0 24px 48px rgba(31,27,22,0.15)",
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", margin: "0 0 8px" }}>Discard changes?</h3>
            <p style={{ fontSize: 12, color: "var(--t4)", margin: "0 0 20px", lineHeight: 1.5 }}>
              You have unsaved changes on this page. If you leave, they will be lost.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDiscardConfirm(false)} style={ghostSm}>Stay on page</button>
              <button onClick={() => { setShowDiscardConfirm(false); navigate(pendingNav); }} style={{ ...primarySm, background: "var(--p-critical)", borderColor: "var(--p-critical)" }}>
                Discard & leave
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NavItem({ item, current, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", borderRadius: 4, border: "none", cursor: "pointer", textAlign: "left",
        background: current ? "rgba(232,103,43,0.10)" : hovered ? "var(--bg-hover)" : "transparent",
        color: current ? "var(--brand-text)" : hovered ? "var(--t1)" : "var(--t3)",
        transition: "all 80ms",
      }}
    >
      <Icon style={{ width: 12, height: 12, flexShrink: 0, color: current ? "var(--brand)" : "inherit" }} />
      <span style={{ fontSize: 12, fontWeight: current ? 500 : 400 }}>{item.label}</span>
      {current && <ChevronRight style={{ width: 9, height: 9, marginLeft: "auto", color: "var(--brand)" }} />}
    </button>
  );
}

function ActionBtn({ icon: Icon, label, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
        fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: "pointer",
        border: "1px solid var(--border-strong)",
        background: h ? "var(--bg-hover)" : "var(--bg-card)",
        color: h ? "var(--t1)" : "var(--t3)",
        transition: "all 80ms",
      }}
    >
      <Icon style={{ width: 10, height: 10 }} /> {label}
    </button>
  );
}

const ghostSm = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: "pointer",
  border: "1px solid var(--border-strong)", background: "transparent", color: "var(--t2)",
};

const primarySm = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: "pointer",
  border: "1px solid var(--brand)", background: "var(--brand)", color: "#fff",
};
