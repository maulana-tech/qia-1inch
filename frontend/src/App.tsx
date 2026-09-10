import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Landing } from './components/Landing'
import { AppLayout } from './components/AppLayout'
import { Faucet } from './components/Faucet'
import { Hub } from './pages/Hub'
import { MarketPage } from './pages/MarketPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { PayPage } from './pages/PayPage'
import { PaymentLinkPage } from './pages/PaymentLinkPage'
import { SwapPage } from './pages/SwapPage'
import { SavingsPage } from './pages/SavingsPage'
import { StrategyPage } from './pages/StrategyPage'
import { DeskPage } from './pages/DeskPage'
import { ReceivePage } from './pages/ReceivePage'
import { SettingsPage } from './pages/SettingsPage'

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onEnter={() => navigate('/app')} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route element={<AppLayout />}>
        <Route path="/app" element={<Hub />} />
        <Route path="/market/:hash" element={<MarketPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/pay" element={<PayPage />} />
        <Route path="/pay/:address" element={<PayPage />} />
        <Route path="/payment-link" element={<PaymentLinkPage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/savings" element={<SavingsPage />} />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/desk" element={<DeskPage />} />
        <Route path="/receive" element={<ReceivePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/faucet" element={<Faucet />} />

      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
