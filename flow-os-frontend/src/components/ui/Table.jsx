/**
 * Table — consistent data table primitive.
 *
 * Usage:
 *   <Table columns={["Name", "Status", "Date"]} rows={data}
 *     renderRow={(row, i) => (
 *       <Table.Row key={i}>
 *         <Table.Cell>{row.name}</Table.Cell>
 *         <Table.Cell><Badge status="healthy" /></Table.Cell>
 *         <Table.Cell muted>{row.date}</Table.Cell>
 *       </Table.Row>
 *     )}
 *   />
 */

import { useState } from "react";

const TH = { fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const TD = { padding: "11px 12px 11px 0", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

export default function Table({ columns = [], rows = [], renderRow, emptyMessage = "No data", loading = false, loadingRows = 4 }) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div key={i} style={{ height: 42, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0 && !renderRow) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: "var(--t5)", fontSize: 12 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      {columns.length > 0 && (
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ ...TH, paddingLeft: i === 0 ? 0 : undefined }}>{typeof col === "string" ? col : col.label}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {renderRow ? rows.map((row, i) => renderRow(row, i)) : null}
      </tbody>
    </table>
  );
}

Table.Row = function TableRow({ children, onClick, highlighted }) {
  const [h, setH] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ background: highlighted ? "rgba(232,103,43,0.05)" : h && onClick ? "rgba(31,27,22,0.03)" : "transparent", cursor: onClick ? "pointer" : "default", transition: "background 80ms" }}
    >
      {children}
    </tr>
  );
};

Table.Cell = function TableCell({ children, muted, mono, first, align = "left" }) {
  return (
    <td style={{
      ...TD,
      paddingLeft: first ? 0 : undefined,
      textAlign: align,
      fontSize: muted ? 10 : 12,
      color: muted ? "var(--t5)" : "var(--t2)",
      fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
      fontWeight: 400,
    }}>
      {children}
    </td>
  );
};
