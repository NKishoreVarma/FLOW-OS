import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Mic, MicOff, PhoneOff, Settings, AlertTriangle, Users, Video } from "lucide-react";
import DecisionCard from "./DecisionCard";
import ActionCard from "./ActionCard";
import { useWebSocket } from "../../hooks/useWebSocket";

const MOCK_TRANSCRIPT_STREAM = [
  { speaker: "Sarah Chen",    text: "Alright, let's get started on the Postgres migration sync.",                           time: "10:00 AM"                },
  { speaker: "Kishore Varma", text: "I've reviewed the current downtime estimates.",                                        time: "10:01 AM"                },
  { speaker: "David O.",      text: "The ops team is concerned about the transaction lock volume.", time: "10:01 AM", type: "risk"     },
  { speaker: "Sarah Chen",    text: "We decided to schedule the migration for Saturday 2AM to minimize impact.",            time: "10:03 AM", type: "decision" },
  { speaker: "Kishore Varma", text: "Agreed. David, can you notify the ops team and prepare the rollback scripts by Friday?", time: "10:04 AM", type: "action" },
];

export const LiveMeeting = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const scrollRef   = useRef(null);
  const { token, workspaceId } = useWebSocket();

  const [meetingTitle, setMeetingTitle] = useState(null);
  const [videoUrl,     setVideoUrl]     = useState(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [transcript,   setTranscript]   = useState([]);
  const [detections,   setDetections]   = useState([]);
  const [streamIndex,  setStreamIndex]  = useState(0);

  useEffect(() => {
    if (!token || !workspaceId) return;
    fetch(`/api/meetings/event/${id}`, {
      headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.result) {
          setMeetingTitle(data.result.title);
          setVideoUrl(data.result.videoUrl || null);
        }
      })
      .catch(() => {});
  }, [id, token, workspaceId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    if (streamIndex >= MOCK_TRANSCRIPT_STREAM.length) return;
    const timer = setTimeout(() => {
      const item = MOCK_TRANSCRIPT_STREAM[streamIndex];
      setTranscript(prev => [...prev, item]);

      if (item.type === "decision") {
        setDetections(prev => [{
          id: `dec-${streamIndex}`,
          component: <DecisionCard key={`dec-${streamIndex}`} decision="Schedule Postgres migration for Saturday 2AM" evidence={item.text} time={item.time} />,
        }, ...prev]);
      } else if (item.type === "action") {
        setDetections(prev => [{
          id: `act-${streamIndex}`,
          component: <ActionCard key={`act-${streamIndex}`} action="Notify ops team and prepare rollback scripts" owner="David O." deadline="Friday" evidence={item.text} time={item.time} onApprove={() => handleDismiss(`act-${streamIndex}`)} onReject={() => handleDismiss(`act-${streamIndex}`)} />,
        }, ...prev]);
      }

      setStreamIndex(prev => prev + 1);
    }, 3000);
    return () => clearTimeout(timer);
  }, [streamIndex]);

  const handleDismiss = (dismissId) => setDetections(prev => prev.filter(d => d.id !== dismissId));
  const handleEndMeeting = () => navigate(`/meetings/${id}/summary`);
  const displayTitle = meetingTitle || (id === "m2" ? "PostgreSQL Migration Plan" : "Architecture Sync");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-base)", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{ height: 56, flexShrink: 0, borderBottom: "1px solid var(--border)", background: "rgba(28,28,31,0.80)", backdropFilter: "blur(12px)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--p-critical)", animation: "pulse-dot 1.2s ease-in-out infinite" }} />
          <h1 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>{displayTitle}</h1>
          <span style={{ fontSize: 10, fontWeight: 500, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--t4)", padding: "2px 8px", borderRadius: 3, display: "flex", alignItems: "center", gap: 4 }}>
            <Users style={{ width: 10, height: 10 }} /> 3 Active
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 4, border: "1px solid rgba(52,168,83,0.30)", background: "rgba(52,168,83,0.08)", color: "#34A853", fontSize: 11, fontWeight: 500, textDecoration: "none" }}
            >
              <Video style={{ width: 12, height: 12 }} /> Join Meet
            </a>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{ padding: "6px 10px", borderRadius: 4, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: isMuted ? "var(--p-critical-text)" : "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            {isMuted ? <MicOff style={{ width: 14, height: 14 }} /> : <Mic style={{ width: 14, height: 14 }} />}
          </button>
          <button style={{ padding: "6px 10px", borderRadius: 4, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Settings style={{ width: 14, height: 14 }} />
          </button>
          <button
            onClick={handleEndMeeting}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 4, background: "rgba(255,87,87,0.10)", border: "1px solid rgba(255,87,87,0.28)", color: "var(--p-critical-text)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <PhoneOff style={{ width: 13, height: 13 }} /> End Meeting
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "7fr 5fr" }}>

        {/* Left: transcript */}
        <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t2)" }}>Live Transcript</span>
            <span style={{ fontSize: 10, color: "var(--t5)" }}>FLOW is listening...</span>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, scrollBehavior: "smooth" }}>
            {transcript.map((item, idx) => (
              <div key={idx} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 44, flexShrink: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(232,103,43,0.12)", border: "1px solid rgba(232,103,43,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand-text)", fontSize: 11, fontWeight: 500 }}>
                    {item.speaker.charAt(0)}
                  </div>
                  <span style={{ fontSize: 9, color: "var(--t5)" }}>{item.time}</span>
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t1)" }}>{item.speaker}</span>
                    {item.type === "risk" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--p-critical-text)", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)", padding: "1px 6px", borderRadius: 3 }}>
                        <AlertTriangle style={{ width: 9, height: 9 }} /> Risk Detected
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.5, fontWeight: 300 }}>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: live intelligence */}
        <div style={{ display: "flex", flexDirection: "column", background: "rgba(28,28,31,0.40)" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t2)" }}>Live Intelligence</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {detections.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, opacity: 0.5 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mic style={{ width: 18, height: 18, color: "var(--t5)", animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                </div>
                <p style={{ fontSize: 11, color: "var(--t5)", fontWeight: 300, textAlign: "center", maxWidth: 180 }}>
                  Listening for decisions, actions, and risks to extract automatically.
                </p>
              </div>
            ) : (
              detections.map(d => d.component)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMeeting;
