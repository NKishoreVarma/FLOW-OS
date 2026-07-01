import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import CommandPalette from "../ui/CommandPalette";
import ShortcutModal from "../ui/ShortcutModal";
import AICopilot from "../ui/AICopilot";
import EntityContextPanel from "../workspace/EntityContextPanel";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { WebSocketProvider, useWebSocket } from "../../hooks/useWebSocket";
import ToastProvider, { useToast } from "../ui/ToastProvider";
import { WifiOff, FileText, Send } from "lucide-react";
import GlobalStatusBar from "../ui/GlobalStatusBar";

// Inner shell component to consume WebSocket and Toast contexts
const LayoutInner = ({ children }) => {
  const { connectionStatus, isAuthLoading } = useWebSocket();
  const { showToast } = useToast();

  // Sidebar, drawers, search, and shortcut states
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);

  // Quick modals triggers
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Keyboard bindings listener (Cmd + K, Cmd + N, Cmd + E, Cmd + /)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          setIsSearchOpen((prev) => !prev);
        } else if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          setIsNoteOpen(true);
        } else if (e.key.toLowerCase() === "e") {
          e.preventDefault();
          setIsComposeOpen(true);
        } else if (e.key === "/") {
          e.preventDefault();
          setIsShortcutOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for socket connections and trigger alerts
  useEffect(() => {
    if (!isAuthLoading) {
      if (connectionStatus === "ONLINE") {
        showToast("Connected to FLOW live intelligence stream.", "success");
      } else if (connectionStatus === "RECONNECTING") {
        showToast("Connection lost. Reconnecting to local pipeline server...", "warning");
      } else if (connectionStatus === "OFFLINE" || connectionStatus === "ERROR") {
        showToast("FLOW is currently offline. Local cache active.", "error");
      }
    }
  }, [connectionStatus, isAuthLoading, showToast]);

  const handleSaveNote = (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    showToast(`Note "${noteTitle}" synced to Obsidian Vault!`, "success");
    setNoteTitle("");
    setNoteContent("");
    setIsNoteOpen(false);
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim()) return;
    showToast(`Outbound email staged to ${emailTo}!`, "success");
    setEmailTo("");
    setEmailSubject("");
    setEmailBody("");
    setIsComposeOpen(false);
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-primary">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 rounded-full border-4 border-flow-purple/20 border-t-flow-purple animate-spin" />
          <span className="text-ui-sm font-semibold uppercase tracking-wider text-text-secondary">
            Syncing Cognitive Layer...
          </span>
        </div>
      </div>
    );
  }

  const isOffline = connectionStatus === "OFFLINE" || connectionStatus === "ERROR";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary">
      {/* 1. Collapsible Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* 2. Page Content frame */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <Header
          onMobileOpen={() => setMobileOpen(true)}
          onSearchOpen={() => setIsSearchOpen(true)}
        />

        {isOffline && (
          <div className="bg-critical/15 border-b border-critical/20 px-6 py-2 flex items-center space-x-2 text-ui-sm text-critical animate-slide-up flex-shrink-0">
            <WifiOff className="w-4 h-4" />
            <span className="font-semibold">Workspace offline.</span>
            <span className="text-ui-xs opacity-80">Viewing cached operational intelligence. Sync will resume once server connects.</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-bg-primary transition-all duration-300">
          {children}
        </main>

        <GlobalStatusBar />
      </div>

      {/* 3. Global Modals and Sheets */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      
      <ShortcutModal isOpen={isShortcutOpen} onClose={() => setIsShortcutOpen(false)} />

      <AICopilot />
      <EntityContextPanel />

      {/* modal: Create Note (⌘N) */}
      {isNoteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsNoteOpen(false)}>
          <form 
            onSubmit={handleSaveNote} 
            className="w-full max-w-md bg-bg-card border border-white/10 rounded-xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2 text-ui-sm font-semibold text-text-primary">
              <FileText className="w-4 h-4 text-flow-purple" />
              <span>Create Note in Obsidian Vault</span>
            </div>
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title (e.g. Design review specs)"
              required
            />
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={4}
              placeholder="Write your markdown note contents..."
              className="w-full bg-bg-primary border border-border-flow focus:border-flow-purple/60 rounded-lg p-3 text-ui-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-flow-purple/35 resize-none"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsNoteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Note
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* modal: Compose Email (⌘E) */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsComposeOpen(false)}>
          <form 
            onSubmit={handleSendEmail} 
            className="w-full max-w-md bg-bg-card border border-white/10 rounded-xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2 text-ui-sm font-semibold text-text-primary">
              <Send className="w-4 h-4 text-flow-purple" />
              <span>Compose Outbound Email</span>
            </div>
            <Input
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="To: (recipient email)"
              required
              type="email"
            />
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              required
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
              placeholder="Write email message body..."
              className="w-full bg-bg-primary border border-border-flow focus:border-flow-purple/60 rounded-lg p-3 text-ui-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-flow-purple/35 resize-none"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsComposeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Send Draft
              </Button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export const LayoutShell = ({ children }) => {
  return (
    <WebSocketProvider>
      <ToastProvider>
        <LayoutInner>{children}</LayoutInner>
      </ToastProvider>
    </WebSocketProvider>
  );
};

export default LayoutShell;
