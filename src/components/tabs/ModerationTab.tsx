import { TabProps } from "./types";
import { Shield, ShieldAlert, X } from "lucide-react";

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
  } = props;
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
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-lg font-bold font-display text-white">{t.filter.title}</h2>
        <p className="text-xs text-white/40 mt-1">{t.filter.desc}</p>
      </div>

      <div className="bg-[#5865F2]/10 border border-[#5865F2]/30 rounded-xl p-4 flex gap-3 items-start">
        <Shield className="w-6 h-6 text-[#5865F2] shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-[#5865F2] mb-1">{t.filter.autoModTitle}</h3>
          <p className="text-xs text-[#5865F2]/70 leading-relaxed">
            {t.filter.autoModDesc1}
            <br />
            <span className="text-white/60 mt-1 block">{t.filter.autoModDesc2}</span>
          </p>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-6">
        <div className="border-b border-white/10 pb-3 mb-1">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            {t.filter.localFilter}
          </h3>
          <p className="text-[11px] text-white/40 mt-1">{t.filter.localFilterSub}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.filter.bannedWords}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t.filter.bannedWordsPh}
              value={bannedWordInput}
              onChange={(e) => setBannedWordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBannedWord()}
              className="bg-black/45 flex-1 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
            />
            <button
              onClick={handleAddBannedWord}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              Ajouter
            </button>
          </div>
          {config.bannedWords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {config.bannedWords.map((word) => (
                <span
                  key={word}
                  className="bg-rose-950/40 text-rose-300 border border-rose-900/50 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveBannedWord(word)}
                    className="w-4 h-4 hover:bg-rose-900/60 rounded-full flex items-center justify-center transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            Action sur les mots interdits
          </label>
          <div className="flex bg-black/45 border border-white/10 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setConfig({ ...config, bannedWordsAction: "block" })}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${
                config.bannedWordsAction === "block" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/80"
              }`}
            >
              Bloquer l&apos;alerte
            </button>
            <button
              onClick={() => setConfig({ ...config, bannedWordsAction: "censor" })}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${
                config.bannedWordsAction === "censor" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/80"
              }`}
            >
              Censurer (* * *)
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t?.filter?.roleFilter}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t?.filter?.roleFilterPh}
              value={roleIdInput || ""}
              onChange={(e) => setRoleIdInput?.(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRoleId?.()}
              className="bg-black/45 flex-1 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-[#e0e0e6] placeholder:text-white/20 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
            />
            <button
              onClick={() => handleAddRoleId?.()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              +
            </button>
          </div>
          {/* allowedRoleIds not yet in UIConfig type — cast intentional */}
          {((config as any)?.allowedRoleIds || []).map((id: string) => (
            <span
              key={id}
              className="inline-flex items-center gap-2 bg-indigo-950/40 text-indigo-300 border border-indigo-900/50 px-3 py-1.5 rounded-lg text-xs font-mono w-fit"
            >
              {id}
              <button
                onClick={() => handleRemoveRoleId?.(id)}
                className="w-4 h-4 hover:bg-indigo-900/60 rounded-full flex items-center justify-center transition"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <span className="text-[10px] text-white/30">{t?.filter?.roleFilterHelp}</span>
        </div>
      </div>
    </div>
  );
}
