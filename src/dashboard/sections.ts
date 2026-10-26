import { useCallback, useEffect, useState } from "react";

export const SECTION_IDS = ["live", "moderation", "look", "poses", "connections", "system"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** URL of each section. Live is the dashboard's home. */
export const SECTION_PATH: Record<SectionId, string> = {
  live: "/",
  moderation: "/moderation",
  look: "/look",
  poses: "/poses",
  connections: "/connections",
  system: "/system",
};

export function sectionFromPath(pathname: string): SectionId {
  const clean = pathname.replace(/\/$/, "") || "/";
  return SECTION_IDS.find((id) => SECTION_PATH[id] === clean) ?? "live";
}

/** Current section, kept in sync with the URL (back/forward included). */
export function useSection(): [SectionId, (id: SectionId) => void] {
  const [section, setSection] = useState<SectionId>(() => sectionFromPath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setSection(sectionFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((id: SectionId) => {
    if (window.location.pathname !== SECTION_PATH[id]) window.history.pushState(null, "", SECTION_PATH[id]);
    setSection(id);
    window.scrollTo(0, 0);
  }, []);

  return [section, navigate];
}
