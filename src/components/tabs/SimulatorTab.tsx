import { useState } from "react";
import { TabProps } from "./types";
import { Send, Radio, CheckCircle2 } from "lucide-react";
import { MediaType } from "../../types";

const PRESETS: { label: string; url: string; type: MediaType; color: string; textColor: string; borderColor: string }[] = [
  {
    label: "YT Shorts",
    url: "https://youtube.com/shorts/OX6wSAsiedI?si=qeSpni-1XCmidrqK",
    type: "video",
    color: "bg-red-500/10 hover:bg-red-500/20",
    textColor: "text-red-300",
    borderColor: "border-red-500/25",
  },
  {
    label: "YouTube",
    url: "https://www.youtube.com/watch?v=UZ6jGyK8F-I",
    type: "video",
    color: "bg-red-500/10 hover:bg-red-500/20",
    textColor: "text-red-300",
    borderColor: "border-red-500/25",
  },
  {
    label: "TikTok",
    url: "https://www.tiktok.com/@pepe_fails/video/7620170003371003156?is_from_webapp=1&sender_device=pc",
    type: "video",
    color: "bg-[#00f2fe]/5 hover:bg-[#00f2fe]/10",
    textColor: "text-[#00d4e0]",
    borderColor: "border-[#00f2fe]/20",
  },
  {
    label: "Instagram",
    url: "https://www.instagram.com/p/DYnCi2IhHHE",
    type: "image",
    color: "bg-pink-500/10 hover:bg-pink-500/20",
    textColor: "text-pink-300",
    borderColor: "border-pink-500/25",
  },
];

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

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [urlError, setUrlError] = useState(false);

  const inputBase =
    "w-full bg-[#08080f] border border-white/[0.07] rounded-lg px-3 py-2.5 text-xs font-mono text-white/80 placeholder:text-white/15 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10 transition-all";

  const handleSend = async () => {
    if (!simMediaUrl.trim()) {
      setUrlError(true);
      setTimeout(() => setUrlError(false), 2000);
      return;
    }
    setSending(true);
    setUrlError(false);
    try {
      await handleTriggerTest();
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Radio className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono text-white tracking-wider uppercase">{t.logs.simTitle}</h2>
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">Inject a test alert directly into the queue</p>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.logs.simName}</label>
            <input
              type="text"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
              className={inputBase}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.logs.simType}</label>
            <select
              value={simType}
              onChange={(e: any) => setSimType(e.target.value)}
              className={`${inputBase} appearance-none cursor-pointer`}
            >
              <option value="image">{t.logs.simTypeAuto}</option>
              <option value="video">{t.logs.simTypeVideo}</option>
              <option value="iframe">{t.logs.simTypeIframe}</option>
              <option value="link">{t.logs.simTypeLink}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{t.logs.simText}</label>
          <input
            type="text"
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            className={inputBase}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono text-white/35 uppercase tracking-widest">URL / Media Link</label>
          <input
            type="text"
            placeholder="https://youtube.com/..."
            value={simMediaUrl}
            onChange={(e) => {
              setSimMediaUrl(e.target.value);
              if (urlError) setUrlError(false);
            }}
            className={`${inputBase} focus:text-indigo-200 ${
              urlError
                ? "border-rose-500/50 text-rose-300 focus:border-rose-500/60"
                : "text-indigo-300/80"
            }`}
          />
          {urlError && (
            <span className="text-[10px] font-mono text-rose-400">{t.logs.simUrlRequired}</span>
          )}

          {/* Platform presets */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setSimMediaUrl(p.url);
                  setSimType(p.type);
                  if (urlError) setUrlError(false);
                }}
                className={`px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wide transition-all ${p.color} ${p.textColor} ${p.borderColor}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Broadcast button */}
      <button
        onClick={handleSend}
        disabled={sending}
        className={`relative group w-full overflow-hidden border font-bold py-3 rounded-xl text-xs font-mono uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 mt-1 disabled:opacity-60 disabled:cursor-not-allowed ${
          sent
            ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-200"
            : "bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/40 hover:border-indigo-500/60 text-indigo-200"
        }`}
      >
        {sent ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t.logs.simSent}
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            {t.logs.sendSim}
          </>
        )}
      </button>
    </div>
  );
}
