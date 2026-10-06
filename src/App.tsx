import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ToastHost } from './components/ui/Toast'
import { OverviewPage } from './pages/OverviewPage'
import { OpportunitiesPage } from './pages/OpportunitiesPage'
import { OpportunityDetailPage } from './pages/OpportunityDetailPage'
import { CapacityPage } from './pages/CapacityPage'
import { RiskPage } from './pages/RiskPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { SkillsPage } from './pages/SkillsPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { Employee360Page } from './pages/Employee360Page'
import { DataPage } from './pages/DataPage'

export function App() {
  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/opportunities" element={<OpportunitiesPage />} />
          <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/risk" element={<RiskPage />} />
          <Route path="/workbench" element={<WorkbenchPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:code" element={<Employee360Page />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <ToastHost />
    </>
  )
}
