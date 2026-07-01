import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/auth/AuthContext";
import { AdminLayout } from "./components/layout/AdminLayout";
import { PublicGuidePage } from "./pages/PublicGuidePage";
import { PublicSongQueuePage } from "./pages/PublicSongQueuePage";
import { OverlayPlayerPage } from "./pages/OverlayPlayerPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RuntimePage } from "./pages/RuntimePage";
import { CommandsPage } from "./pages/CommandsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChannelPointsPage } from "./pages/ChannelPointsPage";
import { AuthPage } from "./pages/AuthPage";
import { FunMeterPage } from "./pages/FunMeterPage";
import { EconomyPage } from "./pages/EconomyPage";
import { BuffsPage } from "./pages/BuffsPage";
import { GiveawayPage } from "./pages/GiveawayPage";
import { GuessPage } from "./pages/GuessPage";
import { SongRequestPage } from "./pages/SongRequestPage";
import { SupporterPage } from "./pages/SupporterPage";
import { PresencePage } from "./pages/PresencePage";
import { SimulationPage } from "./pages/SimulationPage";

export default function App() {
  return (
    <Routes>
      <Route path="/guide" element={<PublicGuidePage />} />
      <Route path="/songs" element={<PublicSongQueuePage />} />
      <Route path="/overlay/player" element={<OverlayPlayerPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="runtime" element={<RuntimePage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="fun-meter" element={<FunMeterPage />} />
        <Route path="economy" element={<EconomyPage />} />
        <Route path="buffs" element={<BuffsPage />} />
        <Route path="giveaway" element={<GiveawayPage />} />
        <Route path="guess" element={<GuessPage />} />
        <Route path="song-request" element={<SongRequestPage />} />
        <Route path="supporter" element={<SupporterPage />} />
        <Route path="presence" element={<PresencePage />} />
        <Route path="simulation" element={<SimulationPage />} />
        <Route path="channel-points" element={<ChannelPointsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
