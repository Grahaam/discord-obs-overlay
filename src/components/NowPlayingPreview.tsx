import { Tv, ImageIcon, Video, ExternalLink, Flame, Music } from "lucide-react";
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

  const TypeIcon =
    alert.type === "video" ? Video : alert.type === "image" ? ImageIcon : alert.type === "audio" ? Music : ExternalLink;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* Blurred media background */}
      {alert.mediaUrl && (alert.type === "image" || alert.type === "video" || alert.type === "audio") && (
        <div className="absolute inset-0 z-0 scale-110 pointer-events-none">
          {alert.type === "image" ? (
            <img src={alert.mediaUrl} alt="" className="w-full h-full object-cover blur-xl opacity-40" />
          ) : alert.type === "video" ? (
            <video
              src={alert.mediaUrl}
              className="w-full h-full object-cover blur-xl opacity-40"
              muted
              autoPlay
              loop
              playsInline
            />
          ) : (
            <div
              className="w-full h-full blur-2xl opacity-50"
              style={{
                backgroundImage: `url(${alert.thumbnailUrl || alert.authorAvatar})`,
                backgroundColor: !alert.thumbnailUrl ? alert.neonColor : "transparent",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
        </div>
      )}

      {/* Content overlay gradient */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.9) 100%)` }}
      />

      {/* Neon color glow accent */}
      <div
        className="absolute inset-0 z-[1] opacity-15 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${alert.neonColor}44 0%, transparent 70%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-4">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-2.5">
          <div className="relative shrink-0">
            <img
              src={alert.authorAvatar}
              alt="Avatar"
              className="w-9 h-9 rounded-full border-2 object-cover shadow-lg"
              style={{ borderColor: alert.neonColor }}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Flame className="w-3 h-3" /> Now Playing
            </span>
            <span className="text-sm font-extrabold text-white truncate drop-shadow-md">
              {alert.title || alert.text || alert.authorName}
            </span>
            {alert.title && <span className="text-[10px] text-white/50 truncate font-medium">{alert.authorName}</span>}
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 px-2 py-1 rounded-lg text-[10px] text-white/60 font-mono">
            <TypeIcon className="w-3 h-3" />
            {alert.type}
          </div>
        </div>

        {/* Media preview */}
        <div className="flex-1 relative rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm border border-white/10 min-h-0 shadow-2xl">
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
          {alert.type === "audio" && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-4">
              <div
                className={`relative z-10 w-28 h-28 shadow-2xl overflow-hidden border border-white/20 ${alert.thumbnailUrl ? "rounded-2xl" : "rounded-full"}`}
              >
                <img
                  src={alert.thumbnailUrl || alert.authorAvatar}
                  alt="Track art"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex flex-col items-center text-center gap-0.5 max-w-full px-2">
                 <span className="text-white font-black text-xs uppercase tracking-tight truncate w-full shadow-black drop-shadow-sm">
                   {alert.title || "Unknown Track"}
                 </span>
                 <span className="text-white/40 text-[9px] font-mono uppercase tracking-widest truncate w-full">
                   {alert.authorName}
                 </span>
              </div>
            </div>
          )}
          {(alert.type === "iframe" || alert.type === "link") && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
              <ExternalLink className="w-8 h-8" />
              <span className="text-[10px] font-mono text-center px-4 break-all line-clamp-2">{alert.mediaUrl}</span>
            </div>
          )}
        </div>

        {/* Text */}
        {alert.text && alert.title && (
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
