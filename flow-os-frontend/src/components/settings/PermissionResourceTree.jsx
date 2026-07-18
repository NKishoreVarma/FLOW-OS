import { useState, useMemo } from "react";
import { ChevronRight, Lock, Hash, Check, Minus } from "lucide-react";
import { key } from "../../lib/permissionKey";

/* ── Checkbox ──────────────────────────────────────────────────────────────── */

export function Checkbox({ checked, indeterminate = false, onChange, size = 17 }) {
  const [hover, setHover] = useState(false);
  const on = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, flexShrink: 0,
        display: "grid", placeItems: "center",
        borderRadius: 5,
        cursor: "pointer",
        background: on ? "var(--brand, #6366f1)" : "transparent",
        border: `1.5px solid ${
          on ? "var(--brand, #6366f1)"
             : hover ? "var(--border-strong, rgba(31,27,22,0.28))"
                     : "var(--border, rgba(31,27,22,0.14))"
        }`,
        transition: "background 120ms ease, border-color 120ms ease, transform 120ms ease",
        transform: hover ? "scale(1.06)" : "scale(1)",
      }}
    >
      {indeterminate
        ? <Minus size={11} strokeWidth={3.5} color="#fff" />
        : checked
        ? <Check size={11} strokeWidth={3.5} color="#fff" />
        : null}
    </button>
  );
}

/* ── Resource row ──────────────────────────────────────────────────────────── */

function ResourceRow({ resource, checked, onToggle }) {
  const [hover, setHover] = useState(false);
  const m = resource.metadata || {};

  const isPrivate = m.private === true || resource.resourceType === "private_channel";

  // Only facts the provider actually gave us — never invented detail.
  const facts = [
    m.memberCount != null   && `${m.memberCount} members`,
    m.language              && m.language,
    m.labelType === "system" && "System label",
    m.projectType           && m.projectType,
    m.accessRole            && m.accessRole,
    m.primary               && "Primary",
    m.archived              && "Archived",
  ].filter(Boolean);

  const subtitle = m.topic || m.purpose || m.description || facts.join(" · ");

  return (
    <div
      onClick={() => onToggle(!checked)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "9px 12px",
        borderRadius: 9,
        cursor: "pointer",
        background: hover ? "var(--bg-hover, rgba(31,27,22,0.035))" : "transparent",
        transition: "background 110ms ease",
      }}
    >
      <Checkbox checked={checked} onChange={onToggle} />

      <div style={{
        width: 24, height: 24, flexShrink: 0, borderRadius: 6,
        display: "grid", placeItems: "center",
        background: checked
          ? "color-mix(in srgb, var(--brand, #6366f1) 14%, transparent)"
          : "var(--bg-2, rgba(31,27,22,0.05))",
        transition: "background 140ms ease",
      }}>
        {isPrivate
          ? <Lock size={11} color={checked ? "var(--brand, #6366f1)" : "var(--t4, #6b7280)"} />
          : <Hash size={11} color={checked ? "var(--brand, #6366f1)" : "var(--t4, #6b7280)"} />}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: checked ? "var(--t1, #f3f4f6)" : "var(--t3, #9ca3af)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color 140ms ease",
        }}>
          {resource.resourceName}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11, color: "var(--t4, #6b7280)", marginTop: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, fontSize: 10, color: "var(--t4, #6b7280)", fontVariantNumeric: "tabular-nums" }}>
        {resource.lastSyncedAt
          ? `Synced ${timeAgo(resource.lastSyncedAt)}`
          : <span style={{ opacity: 0.65 }}>Never synced</span>}
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)     return "just now";
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── Group (one resource type) ─────────────────────────────────────────────── */

function ResourceGroup({ label, resources, draft, onToggle, onToggleAll }) {
  const [open, setOpen] = useState(true);

  const allowedCount = resources.filter(r => draft[key(r)] ?? r.allowed).length;
  const allOn  = allowedCount === resources.length && resources.length > 0;
  const someOn = allowedCount > 0 && !allOn;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px",
          borderRadius: 9,
          background: "var(--bg-2, rgba(31,27,22,0.04))",
        }}
      >
        <Checkbox
          checked={allOn}
          indeterminate={someOn}
          onChange={() => onToggleAll(resources, !allOn)}
        />

        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer", padding: 0, flex: 1,
            textAlign: "left",
          }}
        >
          <ChevronRight
            size={13}
            color="var(--t4, #6b7280)"
            style={{
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
            }}
          />
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--t2, #9ca3af)",
          }}>
            {label}
          </span>
          <span style={{ fontSize: 11, color: "var(--t4, #6b7280)", fontVariantNumeric: "tabular-nums" }}>
            {allowedCount}/{resources.length}
          </span>
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 2 }}>
          {resources.map(r => (
            <ResourceRow
              key={key(r)}
              resource={r}
              checked={draft[key(r)] ?? r.allowed}
              onToggle={(next) => onToggle(r, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tree ──────────────────────────────────────────────────────────────────── */

export default function PermissionResourceTree({ resources, resourceTypes, draft, onToggle, onToggleAll }) {
  const groups = useMemo(() => {
    const byType = new Map();
    for (const r of resources) {
      if (!byType.has(r.resourceType)) byType.set(r.resourceType, []);
      byType.get(r.resourceType).push(r);
    }
    // Preserve the taxonomy's declared order, then anything unexpected.
    const ordered = [];
    for (const t of resourceTypes) {
      if (byType.has(t.type)) {
        ordered.push({ label: t.label, resources: byType.get(t.type) });
        byType.delete(t.type);
      }
    }
    for (const [type, rs] of byType) ordered.push({ label: type, resources: rs });
    return ordered;
  }, [resources, resourceTypes]);

  return (
    <div>
      {groups.map(g => (
        <ResourceGroup
          key={g.label}
          label={g.label}
          resources={g.resources}
          draft={draft}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
        />
      ))}
    </div>
  );
}
