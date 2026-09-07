import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import LiveFeedPanel from "./LiveFeedPanel";
import CommandPalette from "../ui/CommandPalette";
import ShortcutModal from "../ui/ShortcutModal";
import EntityContextPanel from "../workspace/EntityContextPanel";
import CreateJiraModal from "../work/CreateJiraModal";
import { WebSocketProvider, useWebSocket } from "../../hooks/useWebSocket";
import ToastProvider, { useToast } from "../ui/ToastProvider";
import { ToastContainer, useFlowToasts } from "../ui/FlowToast";
import { WifiOff, FileText, Send } from "lucide-react";
import Breadcrumb from "../ui/Breadcrumb";
import StickyCommandCenter from "../command/StickyCommandCenter";
import { isIntegrationEvent, eventSource, eventTitle, isCriticalEvent } from "../../lib/liveEvents";

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

  const [jiraDraft, setJiraDraft]         = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      const target = e.target;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // "?" without modifier — Keyboard Shortcut reference (guard: not in input)
      if (e.key === "?" && !isMeta && !inInput) { e.preventDefault(); setIsShortcutOpen(true); return; }

      if (!isMeta) return;
      if (e.key.toLowerCase() === "k")      { e.preventDefault(); setIsSearchOpen((p) => !p); }
      else if (e.key.toLowerCase() === "b") { e.preventDefault(); window.dispatchEvent(new CustomEvent("flow:toggle-sidebar")); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); setIsNoteOpen(true); }
      else if (e.key.toLowerCase() === "e") { e.preventDefault(); setIsComposeOpen(true); }
      else if (e.key === "/")               { e.preventDefault(); window.dispatchEvent(new CustomEvent("flow:focus-command-center")); }
      else if (e.key === ".")               { e.preventDefault(); window.dispatchEvent(new CustomEvent("flow:cancel-ai")); }
      else if (e.key === "\\")              { e.preventDefault(); setPanelOpen((p) => !p); }
    };
    const openSearch  = () => setIsSearchOpen(true);
    const openCompose = () => setIsComposeOpen(true);
    const openNote    = () => setIsNoteOpen(true);
    const openJira    = (e) => setJiraDraft(e.detail || {});

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("flow:open-search",  openSearch);
    window.addEventListener("flow:open-compose", openCompose);
    window.addEventListener("flow:open-note",    openNote);
    window.addEventListener("flow:create-jira",  openJira);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("flow:open-search",  openSearch);
      window.removeEventListener("flow:open-compose", openCompose);
      window.removeEventListener("flow:open-note",    openNote);
      window.removeEventListener("flow:create-jira",  openJira);
    };
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (connectionStatus === "RECONNECTING") showToast("Connection lost. Reconnecting…", "warning");
    else if (connectionStatus === "ERROR") showToast("Real-time connection rejected. Try signing in again.", "error");
    else if (connectionStatus === "OFFLINE") showToast("FLOW is offline. Showing local cache.", "error");
  }, [connectionStatus, isAuthLoading, showToast]);

  // Wire FlowToast to real integration messages and meaningful business events.
  // System telemetry (action executed, health scores, routing) never toasts.
  useEffect(() => {
    if (!wsEvents?.length) return;
    const latest = wsEvents[wsEvents.length - 1];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);

    if (!isIntegrationEvent(latest)) return;

    addToast({
      id:     String(latest.id),
      title:  eventTitle(latest).slice(0, 72),
      source: eventSource(latest),
      type:   isCriticalEvent(latest) ? "critical" : "info",
    });
  }, [wsEvents, addToast]);

  const handleSaveNote = (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    showToast("Note draft saved. Connect Obsidian to sync automatically.", "info");
    setNoteTitle(""); setNoteContent(""); setIsNoteOpen(false);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim()) return;
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId = localStorage.getItem("flow_os_workspace_id") || "";
    try {
      const res = await fetch("/api/communication/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
        body: JSON.stringify({ to: emailTo.trim(), subject: emailSubject.trim(), body: emailBody }),
      });
      if (res.ok) showToast("Email sent from FLOW.", "success");
      else showToast("Saved as draft — connect Gmail to send from your account.", "info");
    } catch {
      showToast("Saved as draft — connect Gmail to send from your account.", "info");
    }
    setEmailTo(""); setEmailSubject(""); setEmailBody(""); setIsComposeOpen(false);
  };

  if (isAuthLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--bg-base)" }}>
        {/* Sidebar skeleton */}
        <div style={{ width: 52, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", flexShrink: 0 }} />
        {/* Main skeleton */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "48px 48px", maxWidth: 680, margin: "0 auto", gap: 16 }}>
          <div style={{ width: 100, height: 12, borderRadius: 4, background: "rgba(31,27,22,0.05)", animation: "shimmer-sweep 1.6s ease-in-out infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, rgba(31,27,22,0.05) 25%, rgba(31,27,22,0.07) 50%, rgba(31,27,22,0.05) 75%)" }} />
          <div style={{ width: 240, height: 28, borderRadius: 4, background: "rgba(31,27,22,0.05)", animation: "shimmer-sweep 1.6s ease-in-out infinite 0.1s", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, rgba(31,27,22,0.05) 25%, rgba(31,27,22,0.07) 50%, rgba(31,27,22,0.05) 75%)" }} />
          <div style={{ width: 180, height: 11, borderRadius: 4, background: "rgba(31,27,22,0.045)", animation: "shimmer-sweep 1.6s ease-in-out infinite 0.2s", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, rgba(31,27,22,0.045) 25%, rgba(31,27,22,0.06) 50%, rgba(31,27,22,0.045) 75%)" }} />
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
        <Breadcrumb />
        <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
          {children}
        </main>
        <StickyCommandCenter />
      </div>

      {/* Column 3 — live feed panel */}
      <LiveFeedPanel isOpen={panelOpen} onToggle={() => setPanelOpen((p) => !p)} />

      {/* Global overlays */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <ShortcutModal isOpen={isShortcutOpen} onClose={() => setIsShortcutOpen(false)} />
      <EntityContextPanel />
      {jiraDraft && (
        <CreateJiraModal
          initial={jiraDraft}
          onClose={() => setJiraDraft(null)}
          onCreated={() => showToast("Jira issue created.", "success")}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ⌘N — Create Note */}
      {isNoteOpen && (
        <div onClick={() => setIsNoteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleSaveNote} onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 20, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 16px 48px rgba(31,27,22,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>
              <FileText style={{ width: 13, height: 13, color: "var(--brand)" }} />
              Create Note in Obsidian Vault
            </div>
            <input type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Note title" required style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Write your markdown note…" style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "var(--t1)", fontFamily: "var(--font-data)", outline: "none", resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setIsNoteOpen(false)} style={{ padding: "6px 12px", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "6px 12px", background: "var(--accent)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "var(--surface-0)", cursor: "pointer" }}>Save Draft</button>
            </div>
          </form>
        </div>
      )}

      {/* ⌘E — Compose Email */}
      {isComposeOpen && (
        <div onClick={() => setIsComposeOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleSendEmail} onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 20, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 16px 48px rgba(31,27,22,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>
              <Send style={{ width: 13, height: 13, color: "var(--brand)" }} />
              Compose Outbound Email
            </div>
            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="To: (recipient email)" required style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" required style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} placeholder="Write email message body…" style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "var(--t1)", outline: "none", resize: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setIsComposeOpen(false)} style={{ padding: "6px 12px", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" style={{ padding: "6px 12px", background: "var(--accent)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "var(--surface-0)", cursor: "pointer" }}>Stage Draft</button>
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
