import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { OwnerProtectedRoute } from '@/components/OwnerProtectedRoute'
import { ClientProtectedRoute } from '@/components/ClientProtectedRoute'
import LandingPage from '@/pages/LandingPage'
import PublicQuotePage from '@/pages/PublicQuotePage'
import InstructPage from '@/pages/InstructPage'
import TermsPage from '@/pages/TermsPage'
import PrivacyPage from '@/pages/PrivacyPage'
import NotFound from '@/pages/NotFound'
import LoginPage from '@/pages/admin/LoginPage'
import SignupPage from '@/pages/admin/SignupPage'
import AcceptInvitePage from '@/pages/admin/AcceptInvitePage'
import ResetPasswordPage from '@/pages/admin/ResetPasswordPage'
import NoFirmAccessPage from '@/pages/admin/NoFirmAccessPage'
import OnboardingPage from '@/pages/admin/OnboardingPage'
import AdminLayout from '@/pages/admin/AdminLayout'
import DashboardPage from '@/pages/admin/DashboardPage'
import LeadsPage from '@/pages/admin/LeadsPage'
import InstructionsPage from '@/pages/admin/InstructionsPage'
import PricingPage from '@/pages/admin/PricingPage'
import SettingsPage from '@/pages/admin/SettingsPage'
import ClientWorkflowsPage from '@/pages/admin/ClientWorkflowsPage'
import ClientLoginPage from '@/pages/client/ClientLoginPage'
import ClientAcceptInvitePage from '@/pages/client/ClientAcceptInvitePage'
import ClientWorkflowsHomePage from '@/pages/client/ClientWorkflowsHomePage'
import OwnerLayout from '@/pages/owner/OwnerLayout'
import OwnerFirmsPage from '@/pages/owner/OwnerFirmsPage'
import OwnerFirmDetailPage from '@/pages/owner/OwnerFirmDetailPage'
import OwnerAnalyticsPage from '@/pages/owner/OwnerAnalyticsPage'
import OwnerLeadsPage from '@/pages/owner/OwnerLeadsPage'
import OwnerInstructionsPage from '@/pages/owner/OwnerInstructionsPage'
import OwnerReportsPage from '@/pages/owner/OwnerReportsPage'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/quote/:firmSlug" element={<PublicQuotePage />} />
      <Route path="/quote/:firmSlug/instruct" element={<InstructPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Auth routes */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/signup" element={<SignupPage />} />
      <Route path="/admin/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin/no-access" element={<NoFirmAccessPage />} />
      <Route path="/admin/onboarding" element={<OnboardingPage />} />
      <Route path="/client/login" element={<ClientLoginPage />} />
      <Route path="/client/accept-invite" element={<ClientAcceptInvitePage />} />

      {/* Protected admin routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/leads" element={<LeadsPage />} />
          <Route path="/admin/instructions" element={<InstructionsPage />} />
          <Route path="/admin/pricing" element={<PricingPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/workflows" element={<ClientWorkflowsPage />} />
        </Route>
      </Route>

      <Route element={<ClientProtectedRoute />}>
        <Route path="/client/workflows" element={<ClientWorkflowsHomePage />} />
      </Route>

      {/* Owner routes */}
      <Route element={<OwnerProtectedRoute />}>
        <Route element={<OwnerLayout />}>
          <Route path="/owner" element={<OwnerFirmsPage />} />
          <Route path="/owner/leads" element={<OwnerLeadsPage />} />
          <Route path="/owner/instructions" element={<OwnerInstructionsPage />} />
          <Route path="/owner/firms/:firmId" element={<OwnerFirmDetailPage />} />
          <Route path="/owner/analytics" element={<OwnerAnalyticsPage />} />
          <Route path="/owner/reports" element={<OwnerReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
