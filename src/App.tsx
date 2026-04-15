import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { OwnerProtectedRoute } from '@/components/OwnerProtectedRoute'
import LandingPage from '@/pages/LandingPage'
import PublicQuotePage from '@/pages/PublicQuotePage'
import InstructPage from '@/pages/InstructPage'
import NotFound from '@/pages/NotFound'
import LoginPage from '@/pages/admin/LoginPage'
import SignupPage from '@/pages/admin/SignupPage'
import AcceptInvitePage from '@/pages/admin/AcceptInvitePage'
import ResetPasswordPage from '@/pages/admin/ResetPasswordPage'
import OnboardingPage from '@/pages/admin/OnboardingPage'
import AdminLayout from '@/pages/admin/AdminLayout'
import DashboardPage from '@/pages/admin/DashboardPage'
import LeadsPage from '@/pages/admin/LeadsPage'
import InstructionsPage from '@/pages/admin/InstructionsPage'
import PricingPage from '@/pages/admin/PricingPage'
import SettingsPage from '@/pages/admin/SettingsPage'
import OwnerLayout from '@/pages/owner/OwnerLayout'
import OwnerFirmsPage from '@/pages/owner/OwnerFirmsPage'
import OwnerFirmDetailPage from '@/pages/owner/OwnerFirmDetailPage'
import OwnerAnalyticsPage from '@/pages/owner/OwnerAnalyticsPage'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/quote/:firmSlug" element={<PublicQuotePage />} />
      <Route path="/quote/:firmSlug/instruct" element={<InstructPage />} />

      {/* Auth routes */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/signup" element={<SignupPage />} />
      <Route path="/admin/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin/onboarding" element={<OnboardingPage />} />

      {/* Protected admin routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/leads" element={<LeadsPage />} />
          <Route path="/admin/instructions" element={<InstructionsPage />} />
          <Route path="/admin/pricing" element={<PricingPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Owner routes */}
      <Route element={<OwnerProtectedRoute />}>
        <Route element={<OwnerLayout />}>
          <Route path="/owner" element={<OwnerFirmsPage />} />
          <Route path="/owner/firms/:firmId" element={<OwnerFirmDetailPage />} />
          <Route path="/owner/analytics" element={<OwnerAnalyticsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
