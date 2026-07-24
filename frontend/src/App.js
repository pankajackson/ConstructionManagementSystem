import React, { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Loader } from "./components/State";
import { AppShell } from "./components/AppShell";
import LoginPage from "./pages/Login";
import OrgSetupPage from "./pages/OrgSetup";
import OrgSwitcher from "./pages/OrgSwitcher";
import ProjectsPage from "./pages/Projects";
import ProjectDetailPage from "./pages/ProjectDetail";
import TaskDetailPage from "./pages/TaskDetail";
import LogDetailPage from "./pages/LogDetail";
import IssueDetailPage from "./pages/IssueDetail";
import NotificationsPage from "./pages/Notifications";
import TeamPage from "./pages/Team";
import MemberDetailPage from "./pages/MemberDetail";

const Requires = ({ children, needOrg = true }) => {
  const { user, orgs, orgId, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (needOrg && orgs.length === 0) return <Navigate to="/setup" replace />;
  if (needOrg && !orgId) return <Navigate to="/switch-org" replace />;
  return children;
};

function App() {
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/projects" replace /> : <LoginPage />} />
        <Route
          path="/setup"
          element={
            <Requires needOrg={false}>
              <OrgSetupPage />
            </Requires>
          }
        />
        <Route
          path="/switch-org"
          element={
            <Requires needOrg={false}>
              <OrgSwitcher />
            </Requires>
          }
        />

        <Route
          element={
            <Requires>
              <AppShell onSwitchOrg={() => setOrgSwitcherOpen(true)} />
            </Requires>
          }
        >
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/projects/:projectId/logs/:logId" element={<LogDetailPage />} />
          <Route path="/projects/:projectId/issues/:issueId" element={<IssueDetailPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:userId" element={<MemberDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>

      {orgSwitcherOpen && (
        <OrgSwitcher asModal onClose={() => setOrgSwitcherOpen(false)} />
      )}
    </>
  );
}

export default App;
