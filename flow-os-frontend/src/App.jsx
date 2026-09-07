import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import LayoutShell from "./components/layout/LayoutShell";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import PageSkeleton from "./components/ui/PageSkeleton";
import { useWorkspaceState } from "./hooks/useWorkspaceState";

// ─── Auth ─────────────────────────────────────────────────────────────────────
const LoginPage      = lazy(() => import('./components/auth/LoginPage'));

// ─── First-time experience ─────────────────────────────────────────────────────
const SetupWizard    = lazy(() => import('./components/onboarding/SetupWizard'));
const WorkspaceSetup = lazy(() => import('./components/onboarding/WorkspaceSetup'));

// ─── Daily workflow ───────────────────────────────────────────────────────────
const OperationalInbox   = lazy(() => import('./components/inbox/OperationalInbox'));
const MeetingDashboard   = lazy(() => import('./components/meetings/MeetingDashboard'));
const MeetingPreparation = lazy(() => import('./components/meetings/MeetingPreparation'));
const LiveMeeting        = lazy(() => import('./components/meetings/LiveMeeting'));
const MeetingSummary     = lazy(() => import('./components/meetings/MeetingCompletion'));

// ─── Intelligence surfaces ────────────────────────────────────────────────────
const ProjectIntelligence   = lazy(() => import('./components/projects/ProjectIntelligence'));
const EngineeringDashboard  = lazy(() => import('./components/projects/EngineeringDashboard'));
const ExecutiveDashboard    = lazy(() => import('./components/company/ExecutiveDashboard'));
const SupportDashboard      = lazy(() => import('./components/workspace/SupportDashboard'));
const KnowledgeExplorer     = lazy(() => import('./components/knowledge/KnowledgeExplorer'));
const CustomerIntelligence  = lazy(() => import('./components/company/CustomerIntelligence'));
const WorkforceIntelligence = lazy(() => import('./components/company/WorkforceIntelligence'));

// ─── Cross-capability entity deep-link ───────────────────────────────────────
const EntityWorkspace = lazy(() => import('./components/workspace/EntityWorkspace'));

// ─── Platform / Settings ──────────────────────────────────────────────────────
const EnterpriseAdmin    = lazy(() => import('./components/platform/EnterpriseAdmin'));
const IdentityManagement = lazy(() => import('./components/platform/IdentityManagement'));
const WorkspaceManagement= lazy(() => import('./components/platform/WorkspaceManagement'));
const SecurityCenter     = lazy(() => import('./components/platform/SecurityCenter'));
const AuditCompliance    = lazy(() => import('./components/platform/AuditCompliance'));
const AIGovernance       = lazy(() => import('./components/platform/AIGovernance'));
const IntegrationHub     = lazy(() => import('./components/platform/IntegrationHub'));
const IntegrationPermissions = lazy(() => import('./components/settings/IntegrationPermissions'));
const AnalyticsBilling   = lazy(() => import('./components/platform/AnalyticsBilling'));
const Marketplace        = lazy(() => import('./components/platform/Marketplace'));
const ImportDashboard    = lazy(() => import('./components/platform/ImportDashboard'));
const OnboardingWizard   = lazy(() => import('./components/platform/OnboardingWizard'));
const WorkspaceHealth    = lazy(() => import('./components/platform/WorkspaceHealth'));
const EvaluationPlatform = lazy(() => import('./components/platform/EvaluationPlatform'));
const ModelOrchestrator  = lazy(() => import('./components/platform/ModelOrchestrator'));

// ─── Dev tools ────────────────────────────────────────────────────────────────
const PilotDashboard   = lazy(() => import('./components/pilot/PilotDashboard'));
const AdminOps         = lazy(() => import('./components/admin/AdminOps'));
const DeveloperConsole = lazy(() => import('./components/ui/DeveloperConsole'));
const ActivityFeed     = lazy(() => import('./components/activity/ActivityFeed'));
const HelpCenter       = lazy(() => import('./components/help/HelpCenter'));
const ExecutiveCouncil = lazy(() => import('./components/council/ExecutiveCouncil'));
const MorningBriefing  = lazy(() => import('./components/morning/MorningBriefing'));
const SuccessDashboard = lazy(() => import('./components/success/SuccessDashboard'));
const TeamInvite       = lazy(() => import('./components/onboarding/TeamInvite'));
const ChiefOfStaff     = lazy(() => import('./components/autonomous/ChiefOfStaff'));
const WeeklyReview     = lazy(() => import('./components/autonomous/WeeklyReview'));
const TrustCenter        = lazy(() => import('./components/trust/TrustCenter'));
const TrustCenterDashboard = lazy(() => import('./components/trust/TrustCenterDashboard'));
const LaunchPortal       = lazy(() => import('./components/launch/LaunchPortal'));
const SalesDemoPlatform  = lazy(() => import('./components/launch/SalesDemoPlatform'));
const ReleaseNotes            = lazy(() => import('./components/platform/ReleaseNotes'));
const ProductReadinessReport  = lazy(() => import('./components/platform/ProductReadinessReport'));
const ConnectorCertification  = lazy(() => import('./components/connectors/ConnectorCertification'));

/**
 * WorkspaceStateGate — enforces workspace readiness before ANY dashboard access.
 *
 * The dashboard is a privilege unlocked only after ≥ 3 integrations are connected.
 * Redirects to /setup for all non-READY states.
 * ONLY /setup and /auth/* are accessible before READY.
 */
function WorkspaceStateGate() {
  const location = useLocation();
  const navigate  = useNavigate();
  const ws        = useWorkspaceState();

  useEffect(() => {
    // Never trap auth or login flows
    if (location.pathname.startsWith('/auth')) return;
    if (location.pathname === '/login') return;
    // Wait for server response
    if (ws.loading) return;
    // Already on setup page — let it render
    if (location.pathname === '/setup') return;

    // STRICT: if not READY, redirect to setup. No localStorage bypass.
    if (ws.workspacePhase !== 'READY') {
      navigate('/setup', { replace: true });
    }
  }, [ws.loading, ws.workspacePhase, location.pathname, navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <LayoutShell>
        <ErrorBoundary>
          <WorkspaceStateGate />
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              {/* ── Auth ──────────────────────────────────────────────────── */}
              <Route path="/login" element={<LoginPage />} />

              {/* ── Workspace setup gateway (≥3 integrations required) ───── */}
              <Route path="/setup" element={<WorkspaceSetup />} />

              {/* ── Legacy first-run path — redirect to new setup gate ──── */}
              <Route path="/welcome" element={<Navigate to="/setup" replace />} />

              {/* ── OS home — Morning Briefing is the landing page (Phase 16) ── */}
              <Route path="/" element={<MorningBriefing />} />

              {/* ── Daily workflow ────────────────────────────────────────── */}
              <Route path="/inbox"   element={<OperationalInbox />} />
              <Route path="/meetings"             element={<MeetingDashboard />} />
              <Route path="/meetings/:id/prep"    element={<MeetingPreparation />} />
              <Route path="/meetings/:id/live"    element={<LiveMeeting />} />
              <Route path="/meetings/:id/summary" element={<MeetingSummary />} />

              {/* ── Intelligence surfaces ─────────────────────────────────── */}
              <Route path="/dashboard"  element={<ExecutiveDashboard />} />
              <Route path="/engineering" element={<EngineeringDashboard />} />
              <Route path="/support"    element={<SupportDashboard />} />
              <Route path="/projects"  element={<ProjectIntelligence />} />
              <Route path="/knowledge" element={<KnowledgeExplorer />} />
              <Route path="/people"    element={<WorkforceIntelligence />} />
              <Route path="/customers" element={<CustomerIntelligence />} />

              {/* ── Executive Council ─────────────────────────────────────── */}
              <Route path="/council" element={<ExecutiveCouncil />} />

              {/* ── Trust Center — deny-by-default integration permissions ── */}
              <Route path="/integrations"  element={<TrustCenter />} />

              {/* ── Trust Center Dashboard — full explainability platform ───── */}
              <Route path="/settings/trust" element={<TrustCenterDashboard />} />

              {/* ── Pilot Experience (Phase 17) — value + team ────────────── */}
              <Route path="/success"       element={<SuccessDashboard />} />
              <Route path="/settings/team" element={<TeamInvite />} />
              <Route path="/admin/ops"     element={<AdminOps />} />

              {/* ── Autonomous Operations (Phase 19) ─────────────────────── */}
              <Route path="/chief"  element={<ChiefOfStaff />} />
              <Route path="/review" element={<WeeklyReview />} />

              {/* ── Entity deep-links (from AI responses) ─────────────────── */}
              <Route path="/entity/:entityId" element={<EntityWorkspace />} />

              {/* ── Settings & admin (all /platform/* served under /settings) */}
              <Route path="/settings"              element={<EnterpriseAdmin />} />
              <Route path="/settings/iam"          element={<IdentityManagement />} />
              <Route path="/settings/workspaces"   element={<WorkspaceManagement />} />
              <Route path="/settings/security"     element={<SecurityCenter />} />
              <Route path="/settings/audit"        element={<AuditCompliance />} />
              <Route path="/settings/governance"   element={<AIGovernance />} />
              <Route path="/settings/integrations" element={<IntegrationHub />} />
              <Route path="/settings/permissions"  element={<IntegrationPermissions />} />
              <Route path="/settings/billing"      element={<AnalyticsBilling />} />
              <Route path="/settings/marketplace"  element={<Marketplace />} />
              <Route path="/settings/import"       element={<ImportDashboard />} />
              <Route path="/settings/onboarding"   element={<OnboardingWizard />} />
              <Route path="/settings/health"       element={<WorkspaceHealth />} />
              <Route path="/settings/evaluation"   element={<EvaluationPlatform />} />
              <Route path="/settings/ai"           element={<ModelOrchestrator />} />
              <Route path="/settings/releases"         element={<ReleaseNotes />} />
              <Route path="/settings/readiness"        element={<ProductReadinessReport />} />
              <Route path="/settings/certification"    element={<ConnectorCertification />} />

              {/* ── Preserve old /platform/* paths (permanent redirects) ──── */}
              <Route path="/platform"                  element={<Navigate to="/settings" replace />} />
              <Route path="/platform/iam"              element={<Navigate to="/settings/iam" replace />} />
              <Route path="/platform/workspaces"       element={<Navigate to="/settings/workspaces" replace />} />
              <Route path="/platform/security"         element={<Navigate to="/settings/security" replace />} />
              <Route path="/platform/audit"            element={<Navigate to="/settings/audit" replace />} />
              <Route path="/platform/governance"       element={<Navigate to="/settings/governance" replace />} />
              <Route path="/platform/integrations"     element={<Navigate to="/settings/integrations" replace />} />
              <Route path="/platform/billing"          element={<Navigate to="/settings/billing" replace />} />
              <Route path="/platform/marketplace"      element={<Navigate to="/settings/marketplace" replace />} />
              <Route path="/platform/import"           element={<Navigate to="/settings/import" replace />} />
              <Route path="/platform/onboarding"       element={<Navigate to="/settings/onboarding" replace />} />
              <Route path="/platform/health"           element={<Navigate to="/settings/health" replace />} />
              <Route path="/platform/evaluation"       element={<Navigate to="/settings/evaluation" replace />} />
              <Route path="/platform/ai"              element={<Navigate to="/settings/ai" replace />} />

              {/* ── Dev tools (hidden from nav) ───────────────────────────── */}
              <Route path="/pilot" element={<PilotDashboard />} />
              <Route path="/query" element={<DeveloperConsole />} />
              <Route path="/help"  element={<HelpCenter />} />

              {/* ── Activity ─────────────────────────────────────────────── */}
              <Route path="/activity" element={<ActivityFeed />} />

              {/* ── Launch & Sales (v1.0 commercial) ─────────────────────── */}
              <Route path="/launch" element={<LaunchPortal />} />
              <Route path="/demo"   element={<SalesDemoPlatform />} />

              {/* ── Legacy redirects ──────────────────────────────────────── */}
              <Route path="/morning"   element={<Navigate to="/" replace />} />
              <Route path="/brain"     element={<Navigate to="/" replace />} />
              <Route path="/mail"      element={<Navigate to="/inbox" replace />} />
              <Route path="/workfeed"  element={<Navigate to="/" replace />} />
              <Route path="/assistant" element={<Navigate to="/" replace />} />
              <Route path="/briefing"  element={<Navigate to="/" replace />} />
              <Route path="/timeline"  element={<Navigate to="/activity" replace />} />
              <Route path="/search"    element={<Navigate to="/" replace />} />
              <Route path="/security"  element={<Navigate to="/settings/security" replace />} />
              <Route path="/company/*" element={<Navigate to="/" replace />} />
              <Route path="/admin/*"   element={<Navigate to="/" replace />} />

              {/* ── Catch-all ─────────────────────────────────────────────── */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </LayoutShell>
    </BrowserRouter>
  );
}

export default App;
