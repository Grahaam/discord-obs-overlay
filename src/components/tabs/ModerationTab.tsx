import { useState } from "react";
import { TabProps } from "./types";
import { Shield, ShieldAlert, X, Lock, Link2Off, EyeOff, Clock, Copy, Check, UserX } from "lucide-react";

function formatRemaining(until: number): string {
  const ms = until - Date.now();
  if (ms <= 0) return "0m";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-indigo-600" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export default function ModerationTab(props: TabProps) {
  const {
    config,
    setConfig,
    bannedWordInput,
    setBannedWordInput,
    handleAddBannedWord,
    handleRemoveBannedWord,
    t,
    roleIdInput,
    setRoleIdInput,
    handleAddRoleId,
    handleRemoveRoleId,
    bannedUsers,
    handleUnbanUser,
  } = props;

  const [copiedRoleId, setCopiedRoleId] = useState<string | null>(null);

  if (
    config === undefined ||
    setConfig === undefined ||
    bannedWordInput === undefined ||
    setBannedWordInput === undefined ||
    handleAddBannedWord === undefined ||
    handleRemoveBannedWord === undefined ||
    t === undefined
  )
    return null;

  const copyRoleId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedRoleId(id);
      setTimeout(() => setCopiedRoleId(null), 2000);
    });
  };

  const inputBase =
    "bg-[#08080f] flex-1 border border-white/[0.07] rounded-lg px-4 py-2.5 text-sm font-mono placeholder:text-white/15 focus:outline-none transition-all";

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono text-white tracking-wider uppercase">{t.filter.title}</h2>
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">{t.filter.desc}</p>
        </div>
      </div>

      {/* AutoMod notice */}
      <div className="relative overflow-hidden rounded-xl border border-[#5865F2]/25 bg-[#5865F2]/5 p-4">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#5865F2] rounded-r-full" />
        <div className="flex gap-3 items-start pl-2">
          <Shield className="w-4 h-4 text-[#7289DA] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold font-mono text-[#7289DA] uppercase tracking-wider mb-1">
              {t.filter.autoModTitle}
            </p>
            <p className="text-[11px] text-[#7289DA]/60 leading-relaxed font-mono">{t.filter.autoModDesc1}</p>
            <p className="text-[11px] text-white/30 mt-1 font-mono leading-relaxed">{t.filter.autoModDesc2}</p>
          </div>
        </div>
      </div>

      {/* Anti-spam toggles */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2.5 border-b border-white/[0.06]">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400/70" />
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{t.filter.antiSpam}</span>
        </div>

        {/* Block links */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link2Off className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-mono text-white/70 block">{t.filter.blockLinks}</span>
            </div>
          </div>
          <Toggle checked={config.blockLinks ?? false} onChange={(v) => setConfig({ ...config, blockLinks: v })} />
        </div>

        {/* Block NSFW */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <EyeOff className="w-3.5 h-3.5 text-rose-400/60 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-mono text-white/70 block">{t.filter.blockNSFW}</span>
            </div>
          </div>
          <Toggle checked={config.blockNSFW ?? false} onChange={(v) => setConfig({ ...config, blockNSFW: v })} />
        </div>

        {/* Cooldown */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-3.5 h-3.5 text-indigo-400/60 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-mono text-white/70 block">{t.filter.cooldown}</span>
              <span className="text-[10px] font-mono text-white/30 block mt-0.5">{t.filter.cooldownDesc}</span>
            </div>
          </div>
          <div className="relative shrink-0">
            <input
              type="number"
              min="0"
              max="300"
              value={config.cooldownSeconds ?? 1}
              onChange={(e) => setConfig({ ...config, cooldownSeconds: Number(e.target.value) })}
              className="w-20 bg-[#08080f] border border-white/[0.07] rounded-lg px-2.5 py-2 text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500/40 text-right pr-7 transition-all"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/20 pointer-events-none">
              s
            </span>
          </div>
        </div>
      </div>

      {/* Local filter block */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-5">
        <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400/70" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
              {t.filter.localFilter}
            </span>
          </div>
          {config.bannedWords.length > 0 && (
            <span className="text-[10px] font-mono text-rose-300/60 bg-rose-950/30 border border-rose-900/30 px-2 py-0.5 rounded-full">
              {config.bannedWords.length} word{config.bannedWords.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Banned words */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">
            {t.filter.bannedWords}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t.filter.bannedWordsPh}
              value={bannedWordInput}
              onChange={(e) => setBannedWordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBannedWord()}
              className={`${inputBase} text-rose-200 focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/10`}
            />
            <button
              onClick={handleAddBannedWord}
              className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 px-4 rounded-lg text-xs font-mono font-bold transition-all"
            >
              +
            </button>
          </div>
          {config.bannedWords.length === 0 ? (
            <p className="text-[11px] text-white/20 font-mono text-center py-2">{t.filter.bannedWordsEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {config.bannedWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1.5 bg-rose-950/30 text-rose-300/80 border border-rose-900/40 px-2.5 py-1 rounded-md text-[11px] font-mono"
                >
                  <span className="text-rose-500/50">#</span>
                  {word}
                  <button
                    onClick={() => handleRemoveBannedWord(word)}
                    className="w-3.5 h-3.5 rounded hover:bg-rose-900/50 flex items-center justify-center transition ml-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.filter.action}</label>
          <div className="flex bg-[#08080f] border border-white/[0.07] rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setConfig({ ...config, bannedWordsAction: "block" })}
              className={`flex-1 py-2 text-xs font-mono font-bold rounded-md transition-all ${
                config.bannedWordsAction === "block"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              {t.filter.actionBlock}
            </button>
            <button
              onClick={() => setConfig({ ...config, bannedWordsAction: "censor" })}
              className={`flex-1 py-2 text-xs font-mono font-bold rounded-md transition-all ${
                config.bannedWordsAction === "censor"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              {t.filter.actionCensor}
            </button>
          </div>
        </div>

        {/* Role IDs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-white/25" />
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">
              {t.filter.roleFilter}
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t.filter.roleFilterPh}
              value={roleIdInput || ""}
              onChange={(e) => setRoleIdInput?.(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRoleId?.()}
              className={`${inputBase} text-indigo-200 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10`}
            />
            <button
              onClick={() => handleAddRoleId?.()}
              className="bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 px-4 rounded-lg text-xs font-mono font-bold transition-all"
            >
              +
            </button>
          </div>
          {(config.allowedRoleIds || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(config.allowedRoleIds || []).map((id: string) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 bg-indigo-950/30 text-indigo-300/80 border border-indigo-900/40 px-2.5 py-1 rounded-md text-[11px] font-mono group"
                >
                  {id}
                  <button
                    onClick={() => copyRoleId(id)}
                    className="w-3.5 h-3.5 rounded flex items-center justify-center transition text-indigo-400/40 hover:text-indigo-300 opacity-0 group-hover:opacity-100"
                    title="Copy ID"
                  >
                    {copiedRoleId === id ? (
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-2.5 h-2.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveRoleId?.(id)}
                    className="w-3.5 h-3.5 rounded hover:bg-indigo-900/50 flex items-center justify-center transition"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <span className="text-[10px] text-white/20 font-mono">{t.filter.roleFilterHelp}</span>
        </div>
      </div>

      {/* Banned users */}
      {bannedUsers && bannedUsers.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <UserX className="w-3.5 h-3.5 text-rose-400/70" />
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                {t.filter.bannedUsersTitle}
              </span>
            </div>
            <span className="text-[10px] font-mono text-rose-300/60 bg-rose-950/30 border border-rose-900/30 px-2 py-0.5 rounded-full">
              {bannedUsers.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {bannedUsers.map((banned) => (
              <div
                key={banned.userId}
                className="flex items-center justify-between gap-2 bg-rose-950/20 border border-rose-900/30 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="block text-xs font-mono text-rose-200/90 truncate">{banned.username}</span>
                  <span className="block text-[10px] font-mono text-rose-300/40">
                    {formatRemaining(banned.until)} {t.filter.bannedUntil}
                  </span>
                </div>
                <button
                  onClick={() => handleUnbanUser?.(banned.userId)}
                  className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-rose-300/60 hover:text-rose-200 hover:bg-rose-900/40 px-2 py-1 rounded-md transition"
                >
                  <X className="w-3 h-3" />
                  {t.filter.unbanUser}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
