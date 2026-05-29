import { Tv, ImageIcon, Video, ExternalLink, Flame } from "lucide-react";
import { AlertPayload } from "../types";

export default function NowPlayingPreview({ alert }: { alert: AlertPayload | null }) {
  if (!alert) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 bg-[#07070c]">
        <Tv className="w-10 h-10 mb-3 text-white/10 stroke-1" />
        <span className="text-sm font-medium text-white/20">Overlay inactif</span>
        <span className="text-xs text-white/10 mt-1">Lance un test depuis l&apos;onglet Simulateur</span>
      </div>
    );
  }

  const TypeIcon = alert.type === "video" ? Video : alert.type === "image" ? ImageIcon : ExternalLink;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#07070c]">
      {/* Blurred media background */}
      {alert.mediaUrl && (alert.type === "image" || alert.type === "video") && (
        <div className="absolute inset-0 z-0">
          {alert.type === "image" ? (
            <img src={alert.mediaUrl} alt="" className="w-full h-full object-cover scale-110 blur-xl opacity-30" />
          ) : (
            <video
              src={alert.mediaUrl}
              className="w-full h-full object-cover scale-110 blur-xl opacity-30"
              muted
              autoPlay
              loop
              playsInline
            />
          )}
        </div>
      )}

      {/* Neon color glow */}
      <div
        className="absolute inset-0 z-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, ${alert.neonColor} 0%, transparent 70%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-4">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="relative shrink-0">
            <img
              src={alert.authorAvatar}
              alt="Avatar"
              className="w-9 h-9 rounded-full border-2 object-cover"
              style={{ borderColor: alert.neonColor }}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Flame className="w-3 h-3" /> Now Playing
            </span>
            <span className="text-sm font-extrabold text-white truncate">{alert.authorName}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-[10px] text-white/40">
            <TypeIcon className="w-3 h-3" />
            {alert.type}
          </div>
        </div>

        {/* Media preview */}
        <div className="flex-1 relative rounded-xl overflow-hidden bg-black/40 border border-white/[0.06] min-h-0">
          {alert.type === "image" && (
            <img
              src={alert.mediaUrl}
              alt="Media"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}
          {alert.type === "video" && (
            <video src={alert.mediaUrl} className="w-full h-full object-contain" muted autoPlay playsInline />
          )}
          {(alert.type === "iframe" || alert.type === "link") && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
              <ExternalLink className="w-8 h-8" />
              <span className="text-[10px] font-mono text-center px-4 break-all line-clamp-2">{alert.mediaUrl}</span>
            </div>
          )}
        </div>

        {/* Text */}
        {alert.text && (
          <p className="mt-2 text-[11px] text-white/50 truncate">
            {alert.text.replace(/https?:\/\/[^\s]+/gi, "").trim()}
          </p>
        )}
      </div>

      {/* Live badge */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-red-600/20 border border-red-500/30 px-2 py-1 rounded-full text-[10px] font-bold text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        LIVE
      </div>
    </div>
  );
}
