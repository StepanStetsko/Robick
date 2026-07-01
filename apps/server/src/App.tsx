import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RuntimePage } from "./pages/RuntimePage";
import { CommandsPage } from "./pages/CommandsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChannelPointsPage } from "./pages/ChannelPointsPage";
import { AuthPage } from "./pages/AuthPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="runtime" element={<RuntimePage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="channel-points" element={<ChannelPointsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}