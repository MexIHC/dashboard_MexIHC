import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/layout/AppShell";
import { ProjectDashboardPage } from "@/pages/ProjectDashboardPage";
import { UploadPage } from "@/pages/UploadPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ProjectDashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="*" element={<ProjectDashboardPage />} />
      </Routes>
    </AppShell>
  );
}
