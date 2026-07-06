import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import LiveFeedPanel from "./LiveFeedPanel";
import CommandPalette from "../ui/CommandPalette";
import ShortcutModal from "../ui/ShortcutModal";
import EntityContextPanel from "../workspace/EntityContextPanel";
import { WebSocketProvider, useWebSocket } from "../../hooks/useWebSocket";
import ToastProvider, { useToast } from "../ui/ToastProvider";
import { ToastContainer, useFlowToasts } from "../ui/FlowToast";
import { WifiOff, FileText, Send } from "lucide-react";

const LayoutInner = ({ children }) => {
  const { connectionStatus, isAuthLoading, events: wsEvents } = useWebSocket();
  const { showToast } = useToast();
  const { toasts, addToast, dismissToast } = useFlowToasts();
  const seenRef = useRef(new Set());

  const [isSearchOpen, setIsSearchOpen]   = useState(false);
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const [panelOpen, setPanelOpen]         = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);

  const [isNoteOpen, setIsNoteOpen]       = useState(false);
  const [noteTitle, setNoteTitle]         = useState("");
  const [noteContent, setNoteContent]     = useState("");

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [emailTo, setEmailTo]             = useState("");
  const [emailSubject, setEmailSubject]   = useState("");
  const [emailBody, setEmailBody]         = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;
      if (e.key.toLowerCase() === "k")      { e.preventDefault(); setIsSearchOpen((p) => !p); }
      else if (e.key.toLowerCase() === "b") { e.preventDefault(); window.dispatchEvent(new CustomEvent("flow:toggle-sidebar")); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); setIsNoteOpen(true); }
      else if (e.key.toLowerCase() === "e") { e.preventDefault(); setIsComposeOpen(true); }
      else if (e.key === "/")               { e.preventDefault(); setIsShortcutOpen(true); }
      else if (e.key === "\\")              { e.preventDefault(); setPanelOpen((p) => !p); }
    };
    const openSearch  = () => setIsSearchOpen(true);
    const openCompose = () => setIsComposeOpen(true);
    const openNote    = () => setIsNoteOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("flow:open-search",  openSearch);
    window.addEventListener("flow:open-compose", openCompose);
    window.addEventListener("flow:open-note",    openNote);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("flow:open-search",  openSearch);
      window.removeEventListener("flow:open-compose", openCompose);
      window.removeEventListener("flow:open-note",    openNote);
    };
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (connectionStatus === "RECONNECTING") showToast("Connection lost. Reconnecting...", "warning");
    else if (connectionStatus === "OFFLINE" || connectionStatus === "ERROR") showToast("FLOW is offline. Local cache active.", "error");
  }, [connectionStatus, isAuthLoading, showToast]);

  // Wire FlowToast to high-priority WebSocket events
  useEffect(() => {
    if (!wsEvents?.length) return;
    const latest = wsEvents[wsEvents.length - 1];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);

    const type = (latest.type || "").toLowerCase();
    const isHighPriority =
      type.includes("incident") || type.includes("risk") ||
      type.includes("approval") || type.includes("critical");

    if (!isHighPriority) return;

    const rawText = latest.data?.text || latest.data?.message || latest.data?.title || latest.type;
    const toastType =
      type.includes("incident") || type.includes("critical") ? "critical" :
      type.includes("risk")     || type.includes("approval")  ? "warning"  : "info";

    addToast({
      id:    String(latest.id),
      title: typeof rawText === "string" ? rawText.slice(0, 72) : "Workspace event",
      meta:  `${latest.data?.source || "FLOW"} · just now`,
      type:  toastType,
    });
  }, [wsEvents, addToast]);

  const handleSaveNote = (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    showToast("Note draft saved. Connect Obsidian to sync automatically.", "info");
    setNoteTitle(""); setNoteContent(""); setIsNoteOpen(false);
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim()) return;
    showToast("Email draft staged. Connect Gmail to send from your account.", "info");
    setEmailTo(""); setEmailSubject(""); setEmailBody(""); setIsComposeOpen(false);
  };

  if (isAuthLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100vw", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2.5px solid rgba(124,110,255,0.20)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--t4)" }}>
            Syncing Cognitive Layer…
          </span>
        </div>
      </div>
    );
  }

  const isOffline = connectionStatus === "OFFLINE" || connectionStatus === "ERROR";

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "var(--bg-base)", color: "var(--t1)" }}>

      {/* Column 1 — sidebar */}
      <Sidebar />

      {/* Column 2 — main content */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {isOffline && (
          <div style={{ background: "rgba(255,87,87,0.08)", borderBottom: "1px solid rgba(255,87,87,0.20)", padding: "6px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--p-critical-text)", flexShrink: 0 }}>
            <WifiOff style={{ width: 12, height: 12 }} />
            <span style={{ fontWeight: 500 }}>Workspace offline.</span>
            <span style={{ color: "var(--t4)" }}>Viewing cached intelligence.</span>
          </div>
        )}
        <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
          {children}
        </main>
      </div>

      {/* Column 3 — live feed panel */}
      <LiveFeedPanel isOpen={panelOpen} onToggle={() => setPanelOpen((p) => !p)} />

      {/* Global overlays */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <ShortcutModal isOpen={isShortcutOpen} onClose={() => setIsShortcutOpen(false)} />
      <EntityContextPanel />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ⌘N — Create Note */}
      {isNoteOpen && (
        <div onClick={() => setIsNoteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleSaveNote} onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 20, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.50)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>
              <FileText style={{ width: 13, height: 13, color: "var(--brand)" }} />
              Create Note in Obsidian Vault
            </div>
            <input type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Note title" required style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Write your markdown note…" style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "var(--t1)", fontFamily: "'JetBrains Mono', monospace", outline: "none", resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setIsNoteOpen(false)} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "6px 12px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Save Draft</button>
            </div>
          </form>
        </div>
      )}

      {/* ⌘E — Compose Email */}
      {isComposeOpen && (
        <div onClick={() => setIsComposeOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleSendEmail} onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 20, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.50)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>
              <Send style={{ width: 13, height: 13, color: "var(--brand)" }} />
              Compose Outbound Email
            </div>
            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="To: (recipient email)" required style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" required style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} placeholder="Write email message body…" style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "var(--t1)", outline: "none", resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setIsComposeOpen(false)} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "6px 12px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Stage Draft</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const LayoutShell = ({ children }) => (
  <WebSocketProvider>
    <ToastProvider>
      <LayoutInner>{children}</LayoutInner>
    </ToastProvider>
  </WebSocketProvider>
);

export default LayoutShell;
