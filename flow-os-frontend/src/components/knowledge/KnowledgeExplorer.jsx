import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  User, Shield, FileText, Box, Building, Briefcase,
  ShoppingCart, CheckCircle, Search, Network,
  Cpu, Zap, X, ChevronRight, Eye, RefreshCw, ExternalLink, PlugZap
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

const NODES = [
  { id: "n1",  label: "Kishore Varma",          type: "PERSON",     x: 320, y: 160, importance: 0.95 },
  { id: "n2",  label: "Sarah Chen",              type: "PERSON",     x: 140, y: 290, importance: 0.8  },
  { id: "n3",  label: "James K. (CTO)",          type: "PERSON",     x: 480, y: 120, importance: 0.9  },
  { id: "n4",  label: "David O.",                type: "PERSON",     x: 180, y: 160, importance: 0.7  },
  { id: "n5",  label: "PostgreSQL Migration",    type: "PROJECT",    x: 360, y: 320, importance: 0.85 },
  { id: "n6",  label: "pgvector Index",          type: "PROJECT",    x: 520, y: 280, importance: 0.75 },
  { id: "n7",  label: "Migrate Saturday 2AM",    type: "DECISION",   x: 300, y: 240, importance: 0.9  },
  { id: "n8",  label: "Redis Cluster Adoption",  type: "DECISION",   x: 440, y: 200, importance: 0.85 },
  { id: "n9",  label: "DB Latency Report",       type: "DOCUMENT",   x: 240, y: 380, importance: 0.7  },
  { id: "n10", label: "Architecture Sync",       type: "EVENT",      x: 140, y: 400, importance: 0.65 },
  { id: "n11", label: "Engineering Dept",        type: "DEPARTMENT", x: 100, y: 200, importance: 0.8  },
  { id: "n12", label: "TechCorp",                type: "CUSTOMER",   x: 580, y: 360, importance: 0.85 },
  { id: "n13", label: "AWS",                     type: "VENDOR",     x: 560, y: 160, importance: 0.7  },
  { id: "n14", label: "INC-A3F2 Outage",         type: "INCIDENT",   x: 420, y: 380, importance: 0.95 },
  { id: "n15", label: "SOC2 Compliance",         type: "DOCUMENT",   x: 200, y: 80,  importance: 0.9  },
  { id: "n16", label: "Enterprise Pricing",      type: "DOCUMENT",   x: 300, y: 80,  importance: 0.85 },
  { id: "n17", label: "OAuth SSO Spec",          type: "DOCUMENT",   x: 400, y: 80,  importance: 0.9  },
];

const EDGES = [
  { from: "n1",  to: "n7",  label: "Approved"      },
  { from: "n2",  to: "n7",  label: "Proposed"      },
  { from: "n3",  to: "n7",  label: "Authorized"    },
  { from: "n7",  to: "n5",  label: "Impacts"       },
  { from: "n9",  to: "n5",  label: "Context for"   },
  { from: "n1",  to: "n10", label: "Attended"      },
  { from: "n10", to: "n7",  label: "Discussed in"  },
  { from: "n11", to: "n5",  label: "Owns"          },
  { from: "n1",  to: "n11", label: "Works in"      },
  { from: "n12", to: "n9",  label: "Reported"      },
  { from: "n13", to: "n5",  label: "Depends on"    },
  { from: "n3",  to: "n8",  label: "Decided"       },
  { from: "n8",  to: "n6",  label: "Enables"       },
  { from: "n14", to: "n5",  label: "Blocked by"    },
  { from: "n4",  to: "n14", label: "Investigating" },
  { from: "n12", to: "n14", label: "Affected by"   },
  { from: "n15", to: "n1",  label: "Audited by"    },
  { from: "n15", to: "n5",  label: "Context for"   },
  { from: "n16", to: "n2",  label: "Authored by"   },
  { from: "n17", to: "n3",  label: "Authored by"   },
];

const TYPE_CONFIG = {
  PERSON:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',   label: 'Person',     icon: User,         ring: '#3b82f6' },
  PROJECT:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   label: 'Project',    icon: Box,          ring: '#f59e0b' },
  DECISION:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)',   label: 'Decision',   icon: Shield,       ring: '#10b981' },
  DOCUMENT:   { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   label: 'Document',   icon: FileText,     ring: '#8b5cf6' },
  EVENT:      { color: '#64748b', bg: 'rgba(100,116,139,0.12)',  label: 'Event',      icon: CheckCircle,  ring: '#64748b' },
  DEPARTMENT: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  label: 'Department', icon: Building,     ring: '#a78bfa' },
  CUSTOMER:   { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',    label: 'Customer',   icon: Briefcase,    ring: '#f43f5e' },
  VENDOR:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   label: 'Vendor',     icon: ShoppingCart, ring: '#f59e0b' },
  INCIDENT:   { color: '#f43f5e', bg: 'rgba(244,63,94,0.2)',     label: 'Incident',   icon: Zap,          ring: '#f43f5e' },
};

const NODE_RADIUS = 28;

function docToNode(doc, idx) {
  return {
    id: doc.id,
    label: doc.title?.slice(0, 25) || 'Document',
    type: 'DOCUMENT',
    x: 80 + (idx % 4) * 140,
    y: 380 + Math.floor(idx / 4) * 80,
    importance: 0.7,
    meta: doc,
  };
}

export const KnowledgeExplorer = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';

  const [extraNodes, setExtraNodes] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBrief, setAiBrief] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const svgRef = useRef(null);
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(NODES.map(n => [n.id, { x: n.x, y: n.y }]))
  );
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState(new Set(Object.keys(TYPE_CONFIG)));
  const animFrameRef = useRef(null);
  const offsetsRef = useRef({});

  const baseNodes = isDemoWorkspace ? NODES : [];
  const allNodes = useMemo(() => [...baseNodes, ...extraNodes], [extraNodes, isDemoWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps
  const allNodesRef = useRef(allNodes);
  useEffect(() => { allNodesRef.current = allNodes; }, [allNodes]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'workspace-id': workspaceId || '',
    'Content-Type': 'application/json',
  }), [token, workspaceId]);

  const loadDocuments = useCallback(async () => {
    if (isAuthLoading || !token) { setIsDemo(isDemoWorkspace); return; }
    try {
      const res = await fetch('/api/knowledge/documents?provider=notion', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const docs = data.result?.documents || [];
      if (docs.length > 0) {
        const newNodes = docs.map(docToNode);
        setExtraNodes(newNodes);
        setIsDemo(false);
        setPositions(prev => {
          const next = { ...prev };
          newNodes.forEach(n => { if (!next[n.id]) next[n.id] = { x: n.x, y: n.y }; });
          return next;
        });
      } else {
        setIsDemo(isDemoWorkspace);
      }
    } catch {
      setIsDemo(isDemoWorkspace);
    }
  }, [isAuthLoading, token, headers, isDemoWorkspace]);

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => loadDocuments(), 0);
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize offsets for new nodes as they arrive
  useEffect(() => {
    allNodes.forEach(n => {
      if (!offsetsRef.current[n.id]) {
        offsetsRef.current[n.id] = { phase: Math.random() * Math.PI * 2, amp: 3 + Math.random() * 4 };
      }
    });
  }, [allNodes]);

  // Float animation — runs once, reads allNodesRef to pick up new nodes without restarting
  useEffect(() => {
    NODES.forEach(n => {
      offsetsRef.current[n.id] = { phase: Math.random() * Math.PI * 2, amp: 3 + Math.random() * 4 };
    });
    let t = 0;
    const animate = () => {
      t += 0.008;
      setPositions(Object.fromEntries(
        allNodesRef.current.map(n => {
          const off = offsetsRef.current[n.id] || { phase: 0, amp: 3 };
          return [n.id, {
            x: n.x + Math.sin(t + off.phase) * off.amp,
            y: n.y + Math.cos(t * 0.7 + off.phase) * off.amp * 0.6,
          }];
        })
      ));
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // AI brief on node selection
  useEffect(() => {
    setTimeout(() => {
      if (!selectedNode || !token || isAuthLoading) { setAiBrief(null); return; }
      setAiLoading(true);
      setAiBrief(null);
      (async () => {
        try {
          const res = await fetch('/api/brain/copilot', {
            method: 'POST',
            headers,
            body: JSON.stringify({ question: `What do we know about ${selectedNode.label}?` }),
          });
          if (res.ok) {
            const data = await res.json();
            setAiBrief(data.answer || data.message || null);
          }
        } catch {
          // silently fail
        } finally {
          setAiLoading(false);
        }
      })();
    }, 0);
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  };

  const filteredNodes = allNodes.filter(n =>
    activeTypes.has(n.type) &&
    (!searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = EDGES.filter(e => filteredIds.has(e.from) && filteredIds.has(e.to));

  const connectedIds = selectedNode
    ? new Set([selectedNode.id, ...EDGES.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).flatMap(e => [e.from, e.to])])
    : null;

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const nodeRelations = selectedNode
    ? EDGES.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).map(e => {
        const otherId = e.from === selectedNode.id ? e.to : e.from;
        const other = allNodes.find(n => n.id === otherId);
        const direction = e.from === selectedNode.id ? '→' : '←';
        return { label: e.label, node: other, direction };
      })
    : [];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 4rem)", overflow: "hidden", background: "var(--bg-base)" }}>
      {/* Graph Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Controls */}
        <div style={{ position: "absolute", top: 14, left: 14, right: 14, zIndex: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--t5)" }} />
            <input
              type="text"
              placeholder="Search entities…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-strong)",
                borderRadius: 4, paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                fontSize: 12, color: "var(--t1)", outline: "none",
              }}
            />
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              width: 30, height: 30, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", color: "var(--t4)", cursor: "pointer",
            }}
            title="Refresh Notion documents"
          >
            <RefreshCw style={{ width: 13, height: 13, ...(refreshing ? { animation: "spin 1s linear infinite" } : {}) }} />
          </button>

          <DataSourceBadge mode={isDemo ? "demo" : "live"} />

          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                style={{
                  fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.06em", padding: "3px 7px", borderRadius: 3,
                  cursor: "pointer", transition: "opacity 150ms",
                  border: `1px solid ${activeTypes.has(type) ? cfg.color : "var(--border)"}`,
                  color: activeTypes.has(type) ? cfg.color : "var(--t5)",
                  background: activeTypes.has(type) ? cfg.bg : "transparent",
                  opacity: activeTypes.has(type) ? 1 : 0.5,
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Real workspace empty state */}
        {!isDemoWorkspace && allNodes.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", textAlign: "center" }}>
            <PlugZap style={{ width: 32, height: 32, color: "var(--t5)", marginBottom: 14 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--t2)", marginBottom: 6 }}>Connect Notion or Confluence to build your knowledge graph</p>
            <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 18, maxWidth: 360 }}>FLOW will index your documents, wikis, and pages into an interactive entity graph.</p>
            <a href="/integrations" style={{ display: "inline-block", fontSize: 12, fontWeight: 500, color: "var(--brand)", background: "rgba(232,103,43,0.08)", padding: "7px 16px", borderRadius: 4, textDecoration: "none" }}>
              Connect knowledge tools →
            </a>
          </div>
        )}

        {/* SVG Graph */}
        {(isDemoWorkspace || allNodes.length > 0) && <svg
          ref={svgRef}
          style={{ width: "100%", height: "100%" }}
          viewBox="0 0 700 520"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <radialGradient key={type} id={`grad-${type}`} cx="30%" cy="30%">
                <stop offset="0%" stopColor={cfg.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={cfg.color} stopOpacity="0.05" />
              </radialGradient>
            ))}
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(31,27,22,0.12)" />
            </marker>
          </defs>

          {/* Edges */}
          {filteredEdges.map((edge, i) => {
            const fromPos = positions[edge.from];
            const toPos = positions[edge.to];
            if (!fromPos || !toPos) return null;
            const isHighlighted = connectedIds && connectedIds.has(edge.from) && connectedIds.has(edge.to);
            const dx = toPos.x - fromPos.x;
            const dy = toPos.y - fromPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nx = dx / dist;
            const ny = dy / dist;
            const x1 = fromPos.x + nx * NODE_RADIUS;
            const y1 = fromPos.y + ny * NODE_RADIUS;
            const x2 = toPos.x - nx * (NODE_RADIUS + 4);
            const y2 = toPos.y - ny * (NODE_RADIUS + 4);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g key={i} opacity={connectedIds ? (isHighlighted ? 1 : 0.08) : 0.25}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={isHighlighted ? 'rgba(139,92,246,0.6)' : 'rgba(31,27,22,0.1)'}
                  strokeWidth={isHighlighted ? 1.5 : 0.8}
                  markerEnd="url(#arrow)"
                  strokeDasharray={isHighlighted ? 'none' : '4 4'}
                />
                {isHighlighted && (
                  <text x={midX} y={midY} textAnchor="middle" fill="rgba(139,92,246,0.7)" fontSize="8" fontWeight="600" dy="-4">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {filteredNodes.map(node => {
            const pos = positions[node.id];
            if (!pos) return null;
            const cfg = TYPE_CONFIG[node.type] || TYPE_CONFIG.DOCUMENT;
            const isSelected = selectedNode?.id === node.id;
            const isHovered = hoveredNode === node.id;
            const isDimmed = connectedIds && !connectedIds.has(node.id);
            const r = NODE_RADIUS + (isSelected ? 4 : 0);

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => setSelectedNode(isSelected ? null : node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer', opacity: isDimmed ? 0.2 : 1, transition: 'opacity 0.3s' }}
              >
                {(isSelected || isHovered) && (
                  <circle r={r + 8} fill={cfg.color} opacity="0.08" />
                )}
                {isSelected && (
                  <circle r={r + 4} fill="none" stroke={cfg.color} strokeWidth="1.5" opacity="0.5" strokeDasharray="4 4">
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle r={r} fill={`url(#grad-${node.type})`} stroke={cfg.color} strokeWidth={isSelected ? 2 : 1} opacity={isSelected ? 1 : 0.8} />
                {node.type === 'INCIDENT' && (
                  <circle r={r} fill="none" stroke={cfg.color} strokeWidth="1">
                    <animate attributeName="r" from={r} to={r + 12} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <text
                  textAnchor="middle"
                  dy={r + 14}
                  fill={isSelected ? cfg.color : 'rgba(248,250,252,0.75)'}
                  fontSize={isSelected ? "9" : "8"}
                  fontWeight={isSelected ? "700" : "500"}
                  style={{ pointerEvents: 'none', letterSpacing: '0.02em' }}
                >
                  {node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}
                </text>
              </g>
            );
          })}
        </svg>}

        {/* Stats overlay */}
        <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>
            <Network style={{ width: 11, height: 11 }} />{filteredNodes.length} nodes
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>
            <Cpu style={{ width: 11, height: 11 }} />{filteredEdges.length} edges
          </span>
          {extraNodes.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--brand-text)" }}>
              +{extraNodes.length} from Notion
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--t5)" }}>Click any node to explore</span>
        </div>
      </div>

      {/* Side panel */}
      <div style={{
        flexShrink: 0, width: selectedNode ? 300 : 0, overflow: "hidden",
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
        transition: "width 250ms ease",
      }}>
        {selectedNode && (() => {
          const cfg = TYPE_CONFIG[selectedNode.type] || TYPE_CONFIG.DOCUMENT;
          const Icon = cfg.icon;
          const docMeta = selectedNode.meta;

          return (
            <div style={{ padding: 16, height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
                    <Icon style={{ width: 13, height: 13, color: cfg.color }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.color }}>{selectedNode.type}</span>
                    <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35 }}>{selectedNode.label}</h3>
                  </div>
                </div>
                <button onClick={() => setSelectedNode(null)} style={{ padding: 4, borderRadius: 3, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              </div>

              {/* Notion doc metadata */}
              {docMeta && (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px" }}>
                  {docMeta.content && (
                    <p style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 8 }}>
                      {docMeta.content.slice(0, 200)}{docMeta.content.length > 200 ? "…" : ""}
                    </p>
                  )}
                  {docMeta.tags?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {docMeta.tags.slice(0, 5).map(tag => (
                        <span key={tag} style={{
                          fontSize: 9, fontWeight: 500,
                          padding: "2px 5px", borderRadius: 3,
                          background: "rgba(232,103,43,0.08)", color: "var(--brand-text)",
                          border: "1px solid var(--brand-line)",
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {docMeta.url && /^https?:\/\//.test(docMeta.url) && (
                    <a href={docMeta.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--brand-text)", textDecoration: "none" }}>
                      <ExternalLink style={{ width: 10, height: 10 }} /> View in Notion
                    </a>
                  )}
                  {docMeta.author && (
                    <p style={{ fontSize: 10, color: "var(--t5)", marginTop: 4 }}>By {docMeta.author}</p>
                  )}
                </div>
              )}

              {/* Connected entities */}
              {nodeRelations.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <Eye style={{ width: 10, height: 10 }} />Connected ({nodeRelations.length})
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {nodeRelations.map((rel, i) => {
                      if (!rel.node) return null;
                      const relCfg = TYPE_CONFIG[rel.node.type] || TYPE_CONFIG.DOCUMENT;
                      const RelIcon = relCfg.icon;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedNode(rel.node)}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 10px", borderRadius: 4, background: "transparent",
                            border: "none", cursor: "pointer", textAlign: "left",
                            transition: "background 100ms",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(31,27,22,0.045)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: relCfg.bg }}>
                            <RelIcon style={{ width: 11, height: 11, color: relCfg.color }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rel.node.label}</p>
                            <p style={{ fontSize: 10, color: "var(--t4)" }}>{rel.direction} {rel.label}</p>
                          </div>
                          <ChevronRight style={{ width: 11, height: 11, color: "var(--t5)" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Memory confidence */}
              <div style={{ background: "var(--bg-card)", borderRadius: 4, padding: "10px 12px", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 8 }}>Memory Confidence</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 3, background: "rgba(31,27,22,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "var(--brand)", width: `${Math.round(selectedNode.importance * 100)}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--brand-text)" }}>{Math.round(selectedNode.importance * 100)}%</span>
                </div>
              </div>

              {/* AI brief */}
              <div style={{ background: "var(--bg-card)", borderRadius: 4, padding: "10px 12px", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <Zap style={{ width: 10, height: 10, color: "var(--brand)" }} /> AI Brief
                </p>
                {aiLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[100, 80, 60].map((w, i) => (
                      <div key={i} style={{ height: 7, borderRadius: 2, width: `${w}%`, background: "linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)", backgroundSize: "200% 100%", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                    ))}
                  </div>
                ) : aiBrief ? (
                  <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.65 }}>{aiBrief}</p>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--t5)", fontStyle: "italic" }}>
                    {token ? "No context available." : "Sign in to enable AI context."}
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default KnowledgeExplorer;
