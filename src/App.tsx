import OBSOverlayView from "./components/OBSOverlayView";
import StreamerDashboard from "./components/StreamerDashboard";
import OBSQueueDock from "./components/OBSQueueDock";
import OBSStatusDock from "./components/OBSStatusDock";
import TrollOverlay from "./components/TrollOverlay";

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");

  if (path === "/overlay")
    return (
      <>
        <OBSOverlayView />
        <TrollOverlay />
      </>
    );
  if (path === "/dock") return <OBSQueueDock />;
  if (path === "/status") return <OBSStatusDock />;

  return <StreamerDashboard />;
}
