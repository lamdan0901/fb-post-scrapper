import { Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import JobsPage from "./pages/JobsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" position="bottom-right" richColors />
    </ErrorBoundary>
  );
}
