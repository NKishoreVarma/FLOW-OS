import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  User, Shield, FileText, Box, Building, Briefcase,
  ShoppingCart, CheckCircle, Search, Network,
  Cpu, Zap, X, ChevronRight, Eye, RefreshCw, ExternalLink
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

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

  const allNodes = useMemo(() => [...NODES, ...extraNodes], [extraNodes]);
  const allNodesRef = useRef(allNodes);
  useEffect(() => { allNodesRef.current = allNodes; }, [allNodes]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'workspace-id': workspaceId || 'workspace_corp_alpha',
    'Content-Type': 'application/json',
  }), [token, workspaceId]);

  const loadDocuments = useCallback(async () => {
    if (isAuthLoading || !token) { setIsDemo(true); return; }
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
        setIsDemo(true);
      }
    } catch {
      setIsDemo(true);
    }
  }, [isAuthLoading, token, headers]);

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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-bg-primary">
      {/* Graph Canvas */}
      <div className="flex-1 relative">
        {/* Controls */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search entities…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-bg-card border border-border-flow rounded-xl pl-9 pr-4 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-flow-purple/40 focus:ring-2 focus:ring-flow-purple/10"
            />
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-bg-card border border-border-flow text-text-muted hover:text-text-primary hover:border-flow-purple/40 transition-all"
            title="Refresh Notion documents"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {isDemo && (
            <span className="text-xs text-text-muted bg-bg-card border border-border-flow px-2 py-0.5 rounded-full whitespace-nowrap">
              Demo mode
            </span>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all ${
                  activeTypes.has(type)
                    ? 'border-current opacity-100'
                    : 'border-white/10 opacity-30'
                }`}
                style={activeTypes.has(type) ? { color: cfg.color, borderColor: cfg.color, background: cfg.bg } : {}}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Graph */}
        <svg
          ref={svgRef}
          className="w-full h-full"
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
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.12)" />
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
                  stroke={isHighlighted ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)'}
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
        </svg>

        {/* Stats overlay */}
        <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[10px] text-text-muted">
          <span className="flex items-center gap-1"><Network className="w-3 h-3" />{filteredNodes.length} nodes</span>
          <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{filteredEdges.length} edges</span>
          {extraNodes.length > 0 && (
            <span className="text-[9px] text-flow-purple">+{extraNodes.length} from Notion</span>
          )}
          <span className="text-[9px]">Click any node to explore</span>
        </div>
      </div>

      {/* Side panel */}
      <div className={`flex-shrink-0 border-l border-border-flow bg-bg-secondary/50 transition-all duration-300 ${selectedNode ? 'w-80' : 'w-0 overflow-hidden'}`}>
        {selectedNode && (() => {
          const cfg = TYPE_CONFIG[selectedNode.type] || TYPE_CONFIG.DOCUMENT;
          const Icon = cfg.icon;
          const docMeta = selectedNode.meta;

          return (
            <div className="p-4 h-full overflow-y-auto space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{selectedNode.type}</span>
                    <h3 className="text-[13px] font-bold text-text-primary leading-tight">{selectedNode.label}</h3>
                  </div>
                </div>
                <button onClick={() => setSelectedNode(null)} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Notion doc metadata (only for real API nodes) */}
              {docMeta && (
                <div className="bg-bg-card rounded-xl border border-border-flow p-3 space-y-2">
                  {docMeta.content && (
                    <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-4">
                      {docMeta.content.slice(0, 200)}{docMeta.content.length > 200 ? '…' : ''}
                    </p>
                  )}
                  {docMeta.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {docMeta.tags.slice(0, 5).map(tag => (
                        <span key={tag} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-flow-purple/10 text-flow-purple border border-flow-purple/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {docMeta.url && /^https?:\/\//.test(docMeta.url) && (
                    <a
                      href={docMeta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-flow-purple hover:underline mt-1"
                    >
                      <ExternalLink className="w-3 h-3" /> View in Notion
                    </a>
                  )}
                  {docMeta.author && (
                    <p className="text-[9px] text-text-muted">By {docMeta.author}</p>
                  )}
                </div>
              )}

              {/* Connected entities */}
              {nodeRelations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Eye className="w-3 h-3" />Connected entities ({nodeRelations.length})
                  </p>
                  {nodeRelations.map((rel, i) => {
                    if (!rel.node) return null;
                    const relCfg = TYPE_CONFIG[rel.node.type] || TYPE_CONFIG.DOCUMENT;
                    const RelIcon = relCfg.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedNode(rel.node)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: relCfg.bg }}>
                          <RelIcon className="w-3 h-3" style={{ color: relCfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-text-primary truncate group-hover:text-white">{rel.node.label}</p>
                          <p className="text-[9px] text-text-muted">{rel.direction} {rel.label}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Memory confidence */}
              <div className="bg-bg-card rounded-xl p-3 border border-border-flow">
                <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-2">Memory Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-flow-purple" style={{ width: `${Math.round(selectedNode.importance * 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-flow-purple">{Math.round(selectedNode.importance * 100)}%</span>
                </div>
              </div>

              {/* AI brief */}
              <div className="bg-bg-card rounded-xl border border-border-flow p-3 space-y-2">
                <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-flow-purple" /> AI Brief
                </p>
                {aiLoading ? (
                  <div className="space-y-1.5">
                    <div className="h-2 bg-white/5 rounded animate-pulse" />
                    <div className="h-2 bg-white/5 rounded animate-pulse w-4/5" />
                    <div className="h-2 bg-white/5 rounded animate-pulse w-3/5" />
                  </div>
                ) : aiBrief ? (
                  <p className="text-[11px] text-text-secondary leading-relaxed">{aiBrief}</p>
                ) : (
                  <p className="text-[10px] text-text-muted italic">
                    {token ? 'No context available.' : 'Sign in to enable AI context.'}
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
