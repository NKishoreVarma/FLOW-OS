import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck, ArrowLeft, RefreshCw, Loader2, Search, AlertTriangle,
  EyeOff, Lock, Plug, ChevronRight, Check,
} from "lucide-react";

import { PageContainer } from "../ui/PageContainer";
import { Skeleton }      from "../ui/Skeleton";
import { useToast }      from "../ui/ToastProvider";
import { permissionsApi } from "../../lib/permissionsApi";
import PermissionResourceTree from "./PermissionResourceTree";
import { key }              from "../../lib/permissionKey";

/* ── Primitives ────────────────────────────────────────────────────────────── */

function Pill({ children, tone = "muted" }) {
  const tones = {
    ok:      ["#22c55e", "rgba(34,197,94,0.09)",  "rgba(34,197,94,0.22)"],
    warn:    ["#f59e0b", "rgba(245,158,11,0.09)", "rgba(245,158,11,0.24)"],
    muted:   ["var(--t4, #6b7280)", "rgba(107,114,128,0.08)", "rgba(107,114,128,0.18)"],
    brand:   ["var(--brand, #6366f1)", "color-mix(in srgb, var(--brand, #6366f1) 10%, transparent)", "color-mix(in srgb, var(--brand, #6366f1) 26%, transparent)"],
  };
  const [color, bg, border] = tones[tone] || tones.muted;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10, fontWeight: 500, letterSpacing: "0.03em",
      padding: "3px 9px", borderRadius: 99,
      color, background: bg, border: `1px solid ${border}`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant = "ghost", disabled, icon: Icon, busy }) {
  const [hover, setHover] = useState(false);

  const styles = {
    primary: {
      background: disabled ? "var(--bg-3, rgba(31,27,22,0.06))" : "var(--brand, #6366f1)",
      color: disabled ? "var(--t4, #6b7280)" : "#fff",
      border: "1px solid transparent",
    },
    ghost: {
      background: hover ? "var(--bg-hover, rgba(31,27,22,0.06))" : "var(--bg-2, rgba(31,27,22,0.045))",
      color: "var(--t2, #9ca3af)",
      border: "1px solid var(--border, rgba(31,27,22,0.09))",
    },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles,
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: 500,
        padding: "7px 13px", borderRadius: 8,
        cursor: disabled || busy ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 120ms ease, transform 120ms ease",
        transform: hover && !disabled && !busy ? "translateY(-1px)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {busy
        ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
        : Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 36, height: 20, flexShrink: 0, padding: 2,
        borderRadius: 99, cursor: "pointer",
        background: on ? "var(--brand, #6366f1)" : "var(--bg-3, rgba(31,27,22,0.1))",
        border: "none",
        display: "flex", alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start",
        transition: "background 160ms ease",
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "transform 160ms ease",
      }} />
    </button>
  );
}

/* ── Overview: connector card ──────────────────────────────────────────────── */

function ConnectorCard({ c, onOpen }) {
  const [hover, setHover] = useState(false);
  const disabled = !c.available;

  const pct = c.total ? Math.round((c.allowed / c.total) * 100) : 0;

  return (
    <div
      onClick={() => !disabled && onOpen(c.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 18,
        borderRadius: 10,
        background: disabled
          ? "var(--bg-1, rgba(31,27,22,0.012))"
          : hover ? "var(--bg-hover, rgba(31,27,22,0.05))" : "var(--bg-card, rgba(31,27,22,0.022))",
        border: `1px solid ${hover && !disabled ? "var(--border-strong, rgba(31,27,22,0.16))" : "var(--border, rgba(31,27,22,0.075))"}`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 150ms ease, border-color 150ms ease, transform 150ms ease",
        transform: hover && !disabled ? "translateY(-2px)" : "none",
        display: "flex", flexDirection: "column", gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 10,
          display: "grid", placeItems: "center", fontSize: 18,
          background: "var(--bg-2, rgba(31,27,22,0.045))",
          border: "1px solid var(--border, rgba(31,27,22,0.06))",
        }}>
          {c.icon || "🔌"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t1, #f3f4f6)" }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "var(--t4, #6b7280)", marginTop: 1 }}>{c.category}</div>
        </div>

        {disabled      ? <Pill tone="muted">No connector</Pill>
         : c.ungoverned ? <Pill tone="warn">Ungoverned</Pill>
         : c.connected  ? <Pill tone="ok">Connected</Pill>
         :                <Pill tone="muted">Not connected</Pill>}
      </div>

      {disabled ? (
        <div style={{ fontSize: 11.5, color: "var(--t4, #6b7280)", lineHeight: 1.5 }}>
          Not yet available in FLOW. Nothing is read from this platform.
        </div>
      ) : c.total === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--t4, #6b7280)", lineHeight: 1.5 }}>
          {c.connected
            ? "No resources discovered yet. Open to discover what FLOW can see."
            : "Connect this integration to discover its resources."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{
              fontSize: 22, fontWeight: 500, color: "var(--t1, #f3f4f6)",
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            }}>
              {c.allowed}
            </span>
            <span style={{ fontSize: 12, color: "var(--t3, #9ca3af)" }}>
              of {c.total} allowed
            </span>
            {c.hidden > 0 && (
              <span style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, color: "var(--t4, #6b7280)",
              }}>
                <EyeOff size={11} /> {c.hidden} hidden
              </span>
            )}
          </div>

          <div style={{
            height: 3, borderRadius: 99, overflow: "hidden",
            background: "var(--bg-3, rgba(31,27,22,0.07))",
          }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: 99,
              background: "var(--brand, #6366f1)",
              transition: "width 400ms cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
        </>
      )}

      {!disabled && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 2,
        }}>
          <span style={{ fontSize: 10.5, color: "var(--t4, #6b7280)" }}>
            {c.lastDiscoveredAt
              ? `Discovered ${new Date(c.lastDiscoveredAt).toLocaleDateString()}`
              : "Never discovered"}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 11.5, fontWeight: 500,
            color: hover ? "var(--brand, #6366f1)" : "var(--t3, #9ca3af)",
            transition: "color 130ms ease",
          }}>
            Manage
            <ChevronRight size={12} style={{
              transform: hover ? "translateX(2px)" : "none",
              transition: "transform 130ms ease",
            }} />
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────────── */

function Overview({ data, loading, onOpen }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={158} style={{ borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  const { connectors = [], unavailable = [], totals = {} } = data || {};

  return (
    <>
      {/* Trust banner — the product promise, stated plainly. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "16px 18px", marginBottom: 24,
        borderRadius: 10,
        background: "color-mix(in srgb, var(--brand, #6366f1) 6%, transparent)",
        border: "1px solid color-mix(in srgb, var(--brand, #6366f1) 20%, transparent)",
      }}>
        <div style={{
          width: 36, height: 36, flexShrink: 0, borderRadius: 10,
          display: "grid", placeItems: "center",
          background: "color-mix(in srgb, var(--brand, #6366f1) 14%, transparent)",
        }}>
          <ShieldCheck size={17} color="var(--brand, #6366f1)" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1, #f3f4f6)" }}>
            FLOW only understands what you explicitly authorize
          </div>
          <div style={{ fontSize: 12, color: "var(--t3, #9ca3af)", marginTop: 2, lineHeight: 1.5 }}>
            Connecting an integration does not grant FLOW access to its contents. Anything hidden here is
            never indexed, embedded, or reasoned over.
          </div>
        </div>

        <div style={{ display: "flex", gap: 22, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontWeight: 500, color: "var(--t1, #f3f4f6)", fontVariantNumeric: "tabular-nums" }}>
              {totals.allowed ?? 0}
            </div>
            <div style={{ fontSize: 10, color: "var(--t4, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
              Allowed
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 19, fontWeight: 500, color: "var(--t3, #9ca3af)", fontVariantNumeric: "tabular-nums" }}>
              {totals.hidden ?? 0}
            </div>
            <div style={{ fontSize: 10, color: "var(--t4, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>
              Hidden
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {connectors.map(c => <ConnectorCard key={c.id} c={c} onOpen={onOpen} />)}
      </div>

      {unavailable.length > 0 && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            marginTop: 32, marginBottom: 14,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
              textTransform: "uppercase", color: "var(--t4, #6b7280)",
            }}>
              Not yet available
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border, rgba(31,27,22,0.07))" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {unavailable.map(c => <ConnectorCard key={c.id} c={c} onOpen={() => {}} />)}
          </div>
        </>
      )}
    </>
  );
}

/* ── Detail ────────────────────────────────────────────────────────────────── */

const FILTERS = [
  { id: "all",     label: "All" },
  { id: "allowed", label: "Allowed" },
  { id: "hidden",  label: "Hidden" },
];

const DM_OPTIONS = [
  { id: "NEVER",    label: "Never",          hint: "FLOW never reads direct messages" },
  { id: "BOT_ONLY", label: "Only FLOW bot",  hint: "Only DMs sent to the FLOW bot" },
  { id: "SELECTED", label: "Selected people", hint: "Only DMs you explicitly allow" },
  { id: "ALL",      label: "All DMs",        hint: "Every direct message is readable" },
];

function Detail({ connectorId, onBack, onChanged }) {
  const { showToast } = useToast();
  const ok  = (m) => showToast(m, "success");
  const bad = (m) => showToast(m, "error");

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [query,      setQuery]      = useState("");
  const [filter,     setFilter]     = useState("all");
  const [draft,      setDraft]      = useState({});   // `${type}:${id}` → boolean
  const [reloadToken, setReloadToken] = useState(0);

  // Handlers bump the token; the effect below is the single fetch path.
  const load = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await permissionsApi.connector(connectorId);
        if (cancelled) return;
        setData(next);
        setDraft({});
      } catch (err) {
        if (!cancelled) showToast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [connectorId, reloadToken, showToast]);

  const discover = async () => {
    setDiscovering(true);
    try {
      const res = await permissionsApi.discover(connectorId);
      ok(
        res.seededAllowed
          ? `${res.discovered} resources discovered — existing access preserved, new resources will be hidden by default`
          : `${res.discovered} resources discovered (${res.created} new)`,
      );
      await load();
      onChanged?.();
    } catch (err) {
      bad(
        err.code === "NOT_CONNECTED"
          ? `${connectorId} is not connected. Connect it in Integrations first.`
          : err.message,
      );
    } finally {
      setDiscovering(false);
    }
  };

  const pending = useMemo(() => {
    if (!data) return [];
    return data.resources
      .filter(r => draft[key(r)] !== undefined && draft[key(r)] !== r.allowed)
      .map(r => ({ resourceType: r.resourceType, resourceId: r.resourceId, allowed: draft[key(r)] }));
  }, [data, draft]);

  const save = async () => {
    setSaving(true);
    try {
      await permissionsApi.save(connectorId, pending);
      ok(`${pending.length} permission${pending.length === 1 ? "" : "s"} updated`);
      await load();
      onChanged?.();
    } catch (err) {
      bad(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setDm = async (dmPolicy) => {
    try {
      await permissionsApi.settings(connectorId, { dmPolicy });
      setData(d => ({ ...d, settings: { ...d.settings, dmPolicy } }));
      ok("Direct message policy updated");
    } catch (err) {
      bad(err.message);
    }
  };

  const setAutoAllow = async (autoAllowNew) => {
    try {
      await permissionsApi.settings(connectorId, { autoAllowNew });
      setData(d => ({ ...d, settings: { ...d.settings, autoAllowNew } }));
      ok(
        autoAllowNew
          ? "New resources will be allowed automatically"
          : "New resources will stay hidden until you allow them",
      );
    } catch (err) {
      bad(err.message);
    }
  };

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();

    return data.resources.filter(r => {
      const on = draft[key(r)] ?? r.allowed;
      if (filter === "allowed" && !on) return false;
      if (filter === "hidden"  &&  on) return false;
      if (q && !r.resourceName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, filter, draft]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: "80px 0" }}>
        <Loader2 size={20} color="var(--t4)" style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }
  if (!data) return null;

  const { connector, settings, summary, connected, resources } = data;

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            width: 30, height: 30, flexShrink: 0, borderRadius: 8,
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "var(--bg-2, rgba(31,27,22,0.035))",
            border: "1px solid var(--border, rgba(31,27,22,0.08))",
            color: "var(--t2, #9ca3af)",
          }}
        >
          <ArrowLeft size={14} />
        </button>

        <div style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 10,
          display: "grid", placeItems: "center", fontSize: 18,
          background: "var(--bg-2, rgba(31,27,22,0.045))",
          border: "1px solid var(--border, rgba(31,27,22,0.06))",
        }}>
          {connector.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <h1 style={{ fontSize: 19, fontWeight: 650, color: "var(--t1, #f3f4f6)", letterSpacing: "-0.02em" }}>
              {connector.name}
            </h1>
            {connected ? <Pill tone="ok">Connected</Pill> : <Pill tone="muted">Not connected</Pill>}
          </div>
          <div style={{ fontSize: 12, color: "var(--t4, #6b7280)", marginTop: 2 }}>
            {summary.allowed} of {summary.total} resources allowed · {summary.hidden} hidden
          </div>
        </div>

        <Btn onClick={discover} busy={discovering} icon={RefreshCw}>
          {summary.total ? "Re-discover" : "Discover resources"}
        </Btn>
      </div>

      {/* Ungoverned warning — this connector still reads everything. */}
      {settings.ungoverned && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 11,
          padding: "13px 15px", marginBottom: 18, borderRadius: 10,
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.22)",
        }}>
          <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--t2, #9ca3af)", lineHeight: 1.55 }}>
            <strong style={{ color: "#f59e0b", fontWeight: 500 }}>This integration is not yet governed.</strong>{" "}
            It was connected before Integration Permissions existed, so FLOW currently reads everything it can
            access. Run <strong style={{ color: "var(--t1)" }}>Discover resources</strong> to bring it under
            governance — your current access is preserved, and anything new stays hidden by default.
          </div>
        </div>
      )}

      {/* Not connected → nothing to show. No invented resources. */}
      {!connected && resources.length === 0 ? (
        <div style={{
          display: "grid", placeItems: "center", gap: 12,
          padding: "60px 20px", borderRadius: 10,
          background: "var(--bg-card, rgba(31,27,22,0.04))",
          border: "1px dashed var(--border, rgba(31,27,22,0.09))",
          textAlign: "center",
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center",
            background: "var(--bg-2, rgba(31,27,22,0.05))",
          }}>
            <Plug size={17} color="var(--t4, #6b7280)" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t2, #9ca3af)" }}>
            {connector.name} is not connected
          </div>
          <div style={{ fontSize: 12.5, color: "var(--t4, #6b7280)", maxWidth: 380, lineHeight: 1.55 }}>
            Connect it from the Integrations page. FLOW will then discover the real resources it can see —
            and read none of them until you say so.
          </div>
        </div>
      ) : resources.length === 0 ? (
        <div style={{
          display: "grid", placeItems: "center", gap: 12,
          padding: "60px 20px", borderRadius: 10,
          background: "var(--bg-card, rgba(31,27,22,0.04))",
          border: "1px dashed var(--border, rgba(31,27,22,0.09))",
          textAlign: "center",
        }}>
          <Search size={18} color="var(--t4, #6b7280)" />
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t2, #9ca3af)" }}>No resources discovered yet</div>
          <div style={{ fontSize: 12.5, color: "var(--t4, #6b7280)", maxWidth: 380, lineHeight: 1.55 }}>
            Run discovery to ask {connector.name} what it holds. Nothing is read until you allow it.
          </div>
          <div style={{ marginTop: 4 }}>
            <Btn variant="primary" onClick={discover} busy={discovering} icon={RefreshCw}>
              Discover resources
            </Btn>
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <Search
                size={13}
                color="var(--t4, #6b7280)"
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${resources.length} resources…`}
                style={{
                  width: "100%", padding: "8px 12px 8px 31px",
                  fontSize: 12.5, borderRadius: 9,
                  background: "var(--bg-input, rgba(31,27,22,0.045))",
                  border: "1px solid var(--border, rgba(31,27,22,0.09))",
                  color: "var(--t1, #f3f4f6)", outline: "none",
                }}
              />
            </div>

            {/* Segmented filter */}
            <div style={{
              display: "flex", gap: 2, padding: 2, borderRadius: 9,
              background: "var(--bg-2, rgba(31,27,22,0.045))",
              border: "1px solid var(--border, rgba(31,27,22,0.07))",
            }}>
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    padding: "5px 12px", fontSize: 11.5, fontWeight: 500,
                    borderRadius: 7, border: "none", cursor: "pointer",
                    background: filter === f.id ? "var(--bg-4, rgba(31,27,22,0.09))" : "transparent",
                    color: filter === f.id ? "var(--t1, #f3f4f6)" : "var(--t4, #6b7280)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {f.label}
                  {f.id === "allowed" && ` (${summary.allowed})`}
                  {f.id === "hidden"  && ` (${summary.hidden})`}
                </button>
              ))}
            </div>

            <Btn onClick={() => bulk(true)}  icon={Check}>Allow all</Btn>
            <Btn onClick={() => bulk(false)} icon={EyeOff}>Hide all</Btn>
          </div>

          {/* Tree */}
          {visible.length === 0 ? (
            <div style={{ padding: "44px 0", textAlign: "center", fontSize: 12.5, color: "var(--t4, #6b7280)" }}>
              No resources match “{query || filter}”.
            </div>
          ) : (
            <PermissionResourceTree
              resources={visible}
              resourceTypes={connector.resourceTypes}
              draft={draft}
              onToggle={(r, next) => setDraft(d => ({ ...d, [key(r)]: next }))}
              onToggleAll={(rs, next) =>
                setDraft(d => {
                  const patch = { ...d };
                  for (const r of rs) patch[key(r)] = next;
                  return patch;
                })
              }
            />
          )}

          {/* Slack DM policy */}
          {connector.supportsDmPolicy && (
            <div style={{
              marginTop: 26, padding: 16, borderRadius: 10,
              background: "var(--bg-card, rgba(31,27,22,0.022))",
              border: "1px solid var(--border, rgba(31,27,22,0.075))",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <Lock size={12} color="var(--t3, #9ca3af)" />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--t1, #f3f4f6)" }}>
                  Direct messages
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--t4, #6b7280)", marginBottom: 13, lineHeight: 1.5 }}>
                DMs are the most sensitive surface in {connector.name}. They are governed by a policy, not a checkbox.
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {DM_OPTIONS.map(o => {
                  const on = settings.dmPolicy === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setDm(o.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 11,
                        padding: "10px 12px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                        background: on ? "color-mix(in srgb, var(--brand, #6366f1) 8%, transparent)" : "transparent",
                        border: `1px solid ${on ? "color-mix(in srgb, var(--brand, #6366f1) 32%, transparent)" : "var(--border, rgba(31,27,22,0.07))"}`,
                        transition: "background 130ms ease, border-color 130ms ease",
                      }}
                    >
                      <span style={{
                        width: 15, height: 15, flexShrink: 0, borderRadius: "50%",
                        display: "grid", placeItems: "center",
                        border: `1.5px solid ${on ? "var(--brand, #6366f1)" : "var(--border-strong, rgba(31,27,22,0.2))"}`,
                        transition: "border-color 130ms ease",
                      }}>
                        {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--brand, #6366f1)" }} />}
                      </span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: on ? "var(--t1, #f3f4f6)" : "var(--t2, #9ca3af)" }}>
                          {o.label}
                        </span>
                        <span style={{ display: "block", fontSize: 11, color: "var(--t4, #6b7280)", marginTop: 1 }}>
                          {o.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-allow new */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            marginTop: 14, padding: 16, borderRadius: 10,
            background: "var(--bg-card, rgba(31,27,22,0.022))",
            border: "1px solid var(--border, rgba(31,27,22,0.075))",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--t1, #f3f4f6)" }}>
                Automatically allow new resources
              </div>
              <div style={{ fontSize: 11.5, color: "var(--t4, #6b7280)", marginTop: 2, lineHeight: 1.5 }}>
                {settings.autoAllowNew
                  ? `New ${connector.name} resources will be readable as soon as they appear.`
                  : `New ${connector.name} resources stay hidden until you allow them. Recommended.`}
              </div>
            </div>
            <Toggle on={settings.autoAllowNew} onChange={setAutoAllow} />
          </div>
        </>
      )}

      {/* Sticky save bar */}
      {pending.length > 0 && (
        <div style={{
          position: "sticky", bottom: 18, zIndex: 20,
          display: "flex", alignItems: "center", gap: 14,
          marginTop: 22, padding: "12px 16px", borderRadius: 10,
          background: "var(--bg-panel, rgba(20,20,24,0.94))",
          border: "1px solid var(--border-strong, rgba(31,27,22,0.16))",
          boxShadow: "0 10px 34px rgba(31,27,22,0.12)",
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--t2, #9ca3af)" }}>
            <strong style={{ color: "var(--t1, #f3f4f6)", fontWeight: 650 }}>
              {pending.length} change{pending.length === 1 ? "" : "s"}
            </strong>{" "}
            pending — nothing is applied until you save.
          </div>
          <Btn onClick={() => setDraft({})}>Discard</Btn>
          <Btn variant="primary" onClick={save} busy={saving} icon={ShieldCheck}>
            Save permissions
          </Btn>
        </div>
      )}
    </>
  );

  async function bulk(allowed) {
    try {
      await permissionsApi.bulk(connectorId, allowed);
      ok(allowed ? "All resources allowed" : "All resources hidden");
      await load();
      onChanged?.();
    } catch (err) {
      bad(err.message);
    }
  }
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function IntegrationPermissions() {
  const { showToast } = useToast();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await permissionsApi.overview();
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) showToast(err.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [reloadToken, showToast]);

  return (
    <PageContainer>
      {!selected && (
        <div style={{ marginBottom: 26 }}>
          <h1 style={{
            fontSize: 24, fontWeight: 650, color: "var(--t1, #f3f4f6)",
            letterSpacing: "-0.03em",
          }}>
            Integration Permissions
          </h1>
          <p style={{ fontSize: 13, color: "var(--t3, #9ca3af)", marginTop: 5, lineHeight: 1.55, maxWidth: 640 }}>
            Decide exactly which channels, repositories, labels, calendars, pages, and projects FLOW is allowed
            to understand. OAuth only lets FLOW connect — permissions decide what it can read.
          </p>
        </div>
      )}

      {selected
        ? <Detail connectorId={selected} onBack={() => { setSelected(null); load(); }} onChanged={load} />
        : <Overview data={data} loading={loading} onOpen={setSelected} />}
    </PageContainer>
  );
}
