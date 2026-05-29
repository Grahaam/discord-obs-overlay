# Design: Queue DnD + Discord Slash Commands + Bug Fixes

Date: 2026-05-29

## Scope

Three independent deliverables:
1. Bug fixes in `OBSQueueDock`
2. Drag-and-drop queue reordering in the OBS dock
3. Discord slash commands `/skip` and `/queue`

---

## 1. Bug Fixes

### 1a. OBSQueueDock — empty queue on load
**File:** `src/components/OBSQueueDock.tsx`

The dock listens for `initial_state` but never requests it. On load, the queue always appears empty until a new alert arrives.

**Fix:** Emit `get_initial_state` inside the `socket.on("connect", ...)` handler, matching what `useOverlaySocket.ts` does.

### 1b. OBSQueueDock — socket dies on server restart
**File:** `src/components/OBSQueueDock.tsx`

Socket is created with `io(origin)` — no reconnection options. If the server restarts, the dock stays disconnected permanently.

**Fix:** Add reconnect options `{ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000 }`, matching the overlay.

---

## 2. Drag-and-Drop Queue Reorder

**File:** `src/components/OBSQueueDock.tsx`

### Dependencies
- `@dnd-kit/core`
- `@dnd-kit/sortable`

### Implementation
- Wrap the queue list in `<DndContext onDragEnd={handleDragEnd}>` + `<SortableContext items={ids} strategy={verticalListSortingStrategy}>`
- Extract each item into a `SortableQueueItem` component using the `useSortable` hook
- Attach drag handle (`GripVertical`) to `listeners` and `attributes` from `useSortable` — only the handle initiates drag, not the whole row
- On `dragEnd`: use `arrayMove` from `@dnd-kit/sortable` to reorder local state immediately (optimistic), then `POST /api/queue/force-update` with the new order
- Server calls `alertManager.reorderQueue(ids)` and broadcasts `force_queue_update` to all clients — dock reconciles via that event

### Data flow
```
drag end → arrayMove(queue, oldIndex, newIndex) → setQueue (optimistic)
         → POST /api/queue/force-update { queue: [{id}, ...] }
         → server reorders alertManager queue
         → io.emit("force_queue_update", alertManager.getAlerts())
         → all sockets (overlay, other docks) receive updated order
```

No rollback on failure — queue will re-sync on next `force_queue_update` from server or on reconnect.

---

## 3. Discord Slash Commands

**File:** `server/discordBotManager.ts`

### Registration
On `clientReady`:
1. `await client.channels.fetch(channelId)` — get the channel
2. Extract `channel.guild.id` as `guildId`, store on the instance
3. Use `new REST({ version: "10" }).setToken(token)` to call `routes.applicationCommands(clientId, guildId)` with `PUT` — registers both commands atomically (guild-scoped = instant, no propagation delay)

Commands registered:
- `/skip` — `"Skip the currently playing alert"`
- `/queue` — `"Show the current alert queue"`

### Interaction handling
Add `client.on("interactionCreate", ...)` handler:

**`/skip`:**
- Check `interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)`
- If missing permission: reply ephemeral `"❌ You need Manage Messages permission to skip alerts."`
- If authorized: `io.emit("skip_alert")` → reply ephemeral `"⏭️ Alert skipped."`

**`/queue`:**
- Open to all (no permission check)
- Get `alertManager.getAlerts()`
- If empty: reply ephemeral `"📭 Queue is empty."`
- If non-empty: reply ephemeral embed with:
  - Title: `"Alert Queue (N items)"`
  - Description: numbered list — `1. Title or authorName — type`
  - Color: `0x6366f1` (matches app neon default)

### Required intents
No additional intents needed. `interaction.memberPermissions` is populated by Discord on the interaction object itself — it does not require `GuildMembers` intent.

### Error handling
- If channel fetch fails (invalid channelId, bot not in guild): log warning, skip command registration — bot still works for messages
- If `interactionCreate` throws: log error, attempt `interaction.reply({ content: "Internal error", ephemeral: true })` if not yet replied

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/OBSQueueDock.tsx` | Rewrite: fix init bug, fix reconnect, add DnD |
| `server/discordBotManager.ts` | Add slash command registration + interactionCreate handler |
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable` |

No schema changes. No new API endpoints. No changes to `alertManager.ts` or `routes.ts`.
