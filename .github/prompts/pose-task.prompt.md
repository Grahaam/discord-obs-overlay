---
mode: agent
description: Implement one task of the custom poses plan
---

You are implementing **Task ${input:task:Task number, e.g. 0}** of the custom poses feature for LiveChat (Express + Socket.IO server, React 19 + Tailwind v4 dashboard, OBS overlay, Electron shell).

Read these first, fully:
- #file:../../CLAUDE.md (architecture, commands, constraints)
- #file:../../docs/superpowers/specs/2026-10-20-custom-poses-design.md (the design; source of truth)
- #file:../../docs/superpowers/plans/2026-10-20-custom-poses.md (the plan; do **only** Task ${input:task})

Rules:
1. Do only Task ${input:task}. Don't start the next task or refactor unrelated code. If something in the task looks wrong or impossible, stop and tell me instead of improvising.
2. Follow the "Global Constraints" section of the plan exactly: defaults, limits, no new npm dependencies, no `process.cwd()` (use `APP_PATHS` / `DATA_PATHS` from `server/paths.ts`), and every user-visible string in `src/locales.ts` for all four locales (fr, en, uwu-fr, uwu-en).
3. Use the exact names, signatures and file paths from the task's **Interfaces** block. Later tasks depend on them.
4. Test first: write the tests listed in the task, run `npm run test:unit` and show me they fail, then implement until they pass.
5. Match the style of the surrounding code (comments, naming, idioms). Look at a neighbouring file before creating a new one.
6. When done, run `npm run typecheck`, `npm run lint` and `npm run test:unit` (plus `npm test` if the task has a Playwright test) and show me the results.
7. Don't commit. Give me a short summary of what changed, file by file, and the commit message from the task. I'll review and commit myself. The commit must **not** contain a Co-Authored-By or any AI attribution line.
8. Check the plan's "Review Focus" section: if one of its items belongs to this task, confirm its test exists.
