import OBSOverlayView from "./components/OBSOverlayView";
import StreamerDashboard from "./components/StreamerDashboard";
import OBSQueueDock from "./components/OBSQueueDock";
import OBSStatusDock from "./components/OBSStatusDock";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");

  if (path === "/overlay") return <OBSOverlayView />;
  if (path === "/dock") return <OBSQueueDock />;
  if (path === "/status") return <OBSStatusDock />;

  return <StreamerDashboard />;
}
