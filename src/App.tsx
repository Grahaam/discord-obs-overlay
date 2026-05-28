import OBSOverlayView from "./components/OBSOverlayView";
import StreamerDashboard from "./components/StreamerDashboard";

export default function App() {
  // Evaluated once at mount — never changes, no need for state or an effect.
  const isOverlayPath = window.location.pathname.replace(/\/$/, "") === "/overlay";

  if (isOverlayPath) {
    return <OBSOverlayView />;
  }

  return <StreamerDashboard />;
}
