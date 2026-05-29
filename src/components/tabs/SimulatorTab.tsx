import { TabProps } from "./types";
import { Send } from "lucide-react";

export default function SimulatorTab(props: TabProps) {
  const {
    simName,
    setSimName,
    simType,
    setSimType,
    simText,
    setSimText,
    simMediaUrl,
    setSimMediaUrl,
    handleTriggerTest,
    t,
  } = props;
  if (
    simName === undefined ||
    setSimName === undefined ||
    simType === undefined ||
    setSimType === undefined ||
    simText === undefined ||
    setSimText === undefined ||
    simMediaUrl === undefined ||
    setSimMediaUrl === undefined ||
    handleTriggerTest === undefined ||
    t === undefined
  )
    return null;
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="border-b border-white/10 pb-2 mb-2">
        <h2 className="text-md font-bold font-display text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-400" />
          {t.logs.simTitle}
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-white/50 uppercase font-mono tracking-wider">
              {t.logs.simName}
            </label>
            <input
              type="text"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-colors mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-white/50 uppercase font-mono tracking-wider">
              {t.logs.simType}
            </label>
            <select
              value={simType}
              onChange={(e: any) => setSimType(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-colors mt-1 appearance-none"
            >
              <option value="image">Image / Auto</option>
              <option value="video">Forcer Vidéo (MP4)</option>
              <option value="iframe">Forcer Embed (IFrame)</option>
              <option value="link">Forcer Lien</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-white/50 uppercase font-mono tracking-wider">
            {t.logs.simText}
          </label>
          <input
            type="text"
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-colors mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-white/50 uppercase font-mono tracking-wider">
            URL / Media Link
          </label>
          <input
            type="text"
            placeholder="https://youtube.com/..."
            value={simMediaUrl}
            onChange={(e) => setSimMediaUrl(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 outline-none focus:border-indigo-500 transition-colors mt-1"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => setSimMediaUrl("https://youtube.com/shorts/OX6wSAsiedI?si=qeSpni-1XCmidrqK")}
              className="px-2 py-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded text-[10px] font-bold uppercase transition hover:bg-red-500/40"
            >
              YouTube Shorts
            </button>
            <button
              onClick={() => setSimMediaUrl("https://www.youtube.com/watch?v=UZ6jGyK8F-I")}
              className="px-2 py-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded text-[10px] font-bold uppercase transition hover:bg-red-500/40"
            >
              YouTube Video
            </button>
            <button
              onClick={() =>
                setSimMediaUrl(
                  "https://www.tiktok.com/@pepe_fails/video/7620170003371003156?is_from_webapp=1&sender_device=pc"
                )
              }
              className="px-2 py-1 bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/30 rounded text-[10px] font-bold uppercase transition hover:bg-[#00f2fe]/40"
            >
              TikTok
            </button>
            <button
              onClick={() => setSimMediaUrl("https://www.instagram.com/p/DYnCi2IhHHE")}
              className="px-2 py-1 bg-pink-500/20 text-pink-300 border border-pink-500/30 rounded text-[10px] font-bold uppercase transition hover:bg-pink-500/40"
            >
              Instagram
            </button>
          </div>
        </div>
        <button
          onClick={() => handleTriggerTest()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 mt-2"
        >
          <Send className="w-4 h-4" />
          {t.logs.sendSim}
        </button>
      </div>
    </div>
  );
}
