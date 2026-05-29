import { TabProps } from "./types";

export default function StylingTab(props: TabProps) {
  const { config, setConfig, t } = props;
  if (config === undefined || setConfig === undefined || t === undefined) return null;
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-lg font-bold font-display text-white">{t.display.title}</h2>
        <p className="text-xs text-white/40 mt-1">{t.display.desc}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
          {t.display.visualTheme}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "neon", label: t.display.neonStyle, desc: t.display.neonDesc },
            { id: "glitch", label: t.display.glitchStyle, desc: t.display.glitchDesc },
            { id: "cyberpunk", label: t.display.cyberpunkStyle, desc: t.display.cyberpunkDesc },
            { id: "glass", label: t.display.glassStyle, desc: t.display.glassDesc },
          ].map((style) => (
            <button
              key={style.id}
              onClick={() => setConfig({ ...config, alertStyle: style.id as any })}
              className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 cursor-pointer ${
                config.alertStyle === style.id
                  ? "bg-indigo-600/15 border-indigo-500/80 text-white shadow-lg shadow-indigo-600/10"
                  : "bg-black/45 border-white/10 text-white/45 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-sm font-extrabold block text-white">{style.label}</span>
              <span className="text-[10px] opacity-75 mt-1 block">{style.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
            {t.display.customColor}
          </label>
          <div className="flex gap-2">
            <div
              className="w-11 h-11 rounded-xl shrink-0 border border-white/10 shadow-inner"
              style={{ backgroundColor: config.neonColor }}
            />
            <input
              type="text"
              placeholder="#6366f1"
              value={config.neonColor}
              onChange={(e) => setConfig({ ...config, neonColor: e.target.value })}
              className="bg-black/45 w-full border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-[#e0e0e6] placeholder:text-white/25 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-300"
            />
          </div>
        </div>

        <div className="flex flex-col justify-end gap-1 pb-1">
          <span className="text-xs text-slate-300 font-semibold block">{t.display.colorSwatches}</span>
          <div className="flex gap-2.5">
            {["#6366f1", "#ec4899", "#10b981", "#eab308", "#ef4444", "#a855f7"].map((color) => (
              <button
                key={color}
                onClick={() => setConfig({ ...config, neonColor: color })}
                className="w-6 h-6 rounded-full cursor-pointer hover:scale-110 active:scale-95 transition"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
