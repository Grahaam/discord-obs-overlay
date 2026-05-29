import { useState, useEffect } from "react";
import { Bot, FileText } from "lucide-react";
import { LogEntry, BotStatus } from "../types";

export default function OBSStatusDock() {
  const [botStatus, setBotStatus] = useState<BotStatus>({ status: "disconnected", botUser: "", errorMsg: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [botRes, logRes] = await Promise.all([fetch("/api/bot-status"), fetch("/api/logs")]);
        if (botRes.ok) setBotStatus(await botRes.json());
        if (logRes.ok) {
          const logs = await logRes.json();
          // Filter out alerts to just show system logs if needed, but for now just show logs
          setLogs(logs);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#0a0a0f] text-white min-h-screen p-3 font-sans text-xs space-y-4">
      <div
        className={`p-2 rounded border flex items-center gap-2 ${botStatus.status === "connected" ? "bg-emerald-900/20 border-emerald-500/30" : "bg-red-900/20 border-red-500/30"}`}
      >
        <Bot className={`w-4 h-4 ${botStatus.status === "connected" ? "text-emerald-400" : "text-red-400"}`} />
        <span className="font-bold">{botStatus.status.toUpperCase()}</span>
      </div>
      <div className="border-t border-white/10 pt-2">
        <h3 className="font-bold mb-2 flex items-center gap-1">
          <FileText className="w-3 h-3" /> Recent Activity
        </h3>
        <div className="space-y-1">
          {logs.slice(0, 15).map((log) => (
            <div key={log.id} className="text-[10px] text-white/60 truncate border-b border-white/5 pb-1">
              <span className="text-white/30">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>{" "}
              {log.author}: {log.reason}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
