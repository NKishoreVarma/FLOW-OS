import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LayoutShell from "./components/layout/LayoutShell";
import ErrorBoundary from "./components/ui/ErrorBoundary";

// Lazy-loaded routes for code splitting
const DailyWorkfeed = lazy(() => import('./components/workfeed/DailyWorkfeed'));
const ComingSoon = lazy(() => import('./components/ui/ComingSoon'));
const DeveloperConsole = lazy(() => import('./components/ui/DeveloperConsole'));
const WorkspaceIntelligence = lazy(() => import('./components/workspace/WorkspaceIntelligence'));
const DailyBriefing = lazy(() => import('./components/workspace/DailyBriefing'));
const OperationalTimeline = lazy(() => import('./components/workspace/OperationalTimeline'));

const MeetingDashboard = lazy(() => import('./components/meetings/MeetingDashboard'));
const MeetingPreparation = lazy(() => import('./components/meetings/MeetingPreparation'));
const LiveMeeting = lazy(() => import('./components/meetings/LiveMeeting'));
const MeetingSummary = lazy(() => import('./components/meetings/MeetingSummary'));

const TeamDashboard = lazy(() => import('./components/team/TeamDashboard'));
const DecisionBoard = lazy(() => import('./components/team/DecisionBoard'));
const TeamMemory = lazy(() => import('./components/team/TeamMemory'));
const CollaborationHub = lazy(() => import('./components/team/CollaborationHub'));
const ProjectIntelligence = lazy(() => import('./components/projects/ProjectIntelligence'));

const ExecutiveDashboard = lazy(() => import('./components/company/ExecutiveDashboard'));
const CompanyWorkspace = lazy(() => import('./components/company/CompanyWorkspace'));
const DepartmentIntelligence = lazy(() => import('./components/company/DepartmentIntelligence'));
const CompanyMemory = lazy(() => import('./components/company/CompanyMemory'));
const ExecutiveAdvisor = lazy(() => import('./components/company/ExecutiveAdvisor'));
const CustomerIntelligence = lazy(() => import('./components/company/CustomerIntelligence'));
const WorkforceIntelligence = lazy(() => import('./components/company/WorkforceIntelligence'));

const EnterpriseAdmin = lazy(() => import('./components/platform/EnterpriseAdmin'));
const IdentityManagement = lazy(() => import('./components/platform/IdentityManagement'));
const WorkspaceManagement = lazy(() => import('./components/platform/WorkspaceManagement'));
const SecurityCenter = lazy(() => import('./components/platform/SecurityCenter'));
const AuditCompliance = lazy(() => import('./components/platform/AuditCompliance'));
const AIGovernance = lazy(() => import('./components/platform/AIGovernance'));
const IntegrationHub = lazy(() => import('./components/platform/IntegrationHub'));
const AnalyticsBilling = lazy(() => import('./components/platform/AnalyticsBilling'));
const Marketplace = lazy(() => import('./components/platform/Marketplace'));
const ImportDashboard = lazy(() => import('./components/platform/ImportDashboard'));
const OnboardingWizard = lazy(() => import('./components/platform/OnboardingWizard'));
const WorkspaceHealth = lazy(() => import('./components/platform/WorkspaceHealth'));
const EvaluationPlatform = lazy(() => import('./components/platform/EvaluationPlatform'));

const UniversalSearch = lazy(() => import('./components/search/UniversalSearch'));
const AIInbox = lazy(() => import('./components/inbox/AIInbox'));
const KnowledgeExplorer = lazy(() => import('./components/knowledge/KnowledgeExplorer'));
const EntityWorkspace = lazy(() => import('./components/workspace/EntityWorkspace'));
function App() {
  return (
    <BrowserRouter>
      <LayoutShell>
        <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg-primary">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-8 h-8 rounded-full border-4 border-flow-purple/20 border-t-flow-purple animate-spin" />
                <span className="text-ui-xs font-semibold uppercase tracking-wider text-text-muted">
                  Routing View Node...
                </span>
              </div>
            </div>
          }
        >
          <Routes>
            {/* Redirect root to /workfeed */}
            <Route path="/" element={<Navigate to="/workfeed" replace />} />
            <Route path="/workfeed" element={<DailyWorkfeed />} />
            <Route path="/search" element={<UniversalSearch />} />
            <Route path="/assistant" element={<WorkspaceIntelligence />} />
            <Route path="/briefing" element={<DailyBriefing />} />
            <Route path="/timeline" element={<OperationalTimeline />} />
            <Route path="/dashboard" element={<ExecutiveDashboard />} />
            <Route path="/meetings" element={<MeetingDashboard />} />
            <Route path="/meetings/:id/prep" element={<MeetingPreparation />} />
            <Route path="/meetings/:id/live" element={<LiveMeeting />} />
            <Route path="/meetings/:id/summary" element={<MeetingSummary />} />
            <Route path="/knowledge" element={<KnowledgeExplorer />} />
            <Route path="/projects" element={<ProjectIntelligence />} />
            <Route path="/settings" element={<ComingSoon pageName="Settings Sandbox" />} />
            
            {/* Enterprise Platform paths */}
            <Route path="/platform" element={<EnterpriseAdmin />} />
            <Route path="/platform/iam" element={<IdentityManagement />} />
            <Route path="/platform/workspaces" element={<WorkspaceManagement />} />
            <Route path="/platform/security" element={<SecurityCenter />} />
            <Route path="/platform/audit" element={<AuditCompliance />} />
            <Route path="/platform/governance" element={<AIGovernance />} />
            <Route path="/platform/integrations" element={<IntegrationHub />} />
            <Route path="/platform/billing" element={<AnalyticsBilling />} />
            <Route path="/platform/marketplace" element={<Marketplace />} />
            <Route path="/platform/import" element={<ImportDashboard />} />
            <Route path="/platform/onboarding" element={<OnboardingWizard />} />
            <Route path="/platform/health" element={<WorkspaceHealth />} />
            <Route path="/platform/evaluation" element={<EvaluationPlatform />} />
            
            {/* Company Overview paths */}
            <Route path="/admin" element={<CompanyWorkspace />} />
            <Route path="/admin/departments/:id" element={<DepartmentIntelligence />} />
            <Route path="/admin/memory" element={<CompanyMemory />} />
            <Route path="/admin/advisor" element={<ExecutiveAdvisor />} />
            <Route path="/admin/crm" element={<CustomerIntelligence />} />
            <Route path="/admin/workforce" element={<WorkforceIntelligence />} />
            
            <Route path="/company" element={<TeamDashboard />} />
            <Route path="/company/decisions" element={<DecisionBoard />} />
            <Route path="/company/memory" element={<TeamMemory />} />
            <Route path="/company/collaboration" element={<CollaborationHub />} />
            <Route path="/security" element={<ComingSoon pageName="Workspace Security" />} />
            
            {/* Personal paths */}
            <Route path="/inbox" element={<AIInbox />} />
            <Route path="/activity" element={<Navigate to="/timeline" replace />} />
            <Route path="/help" element={<ComingSoon pageName="System Help" />} />

            {/* Cross-capability entity deep-link */}
            <Route path="/entity/:entityId" element={<EntityWorkspace />} />

            {/* Developer testing sandbox console */}
            <Route path="/query" element={<DeveloperConsole />} />

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/workfeed" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </LayoutShell>
    </BrowserRouter>
  );
}

export default App;
