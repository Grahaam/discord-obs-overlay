import OBSOverlayView from "./components/OBSOverlayView";
import DashboardShell from "./dashboard/DashboardShell";
import OBSQueueDock from "./components/OBSQueueDock";
import OBSStatusDock from "./components/OBSStatusDock";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");

  if (path === "/overlay")
    return (
      <>
        <OBSOverlayView />
      </>
    );
  if (path === "/dock") return <OBSQueueDock />;
  if (path === "/status") return <OBSStatusDock />;

  return <DashboardShell />;
}
