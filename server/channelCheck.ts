import { PermissionFlagsBits, type Client, type GuildBasedChannel } from "discord.js";
import type { ChannelIssue } from "../src/types.js";

// What the bot needs in the alert channel: see messages, read them, reply.
const REQUIRED = [
  ["ViewChannel", PermissionFlagsBits.ViewChannel],
  ["ReadMessageHistory", PermissionFlagsBits.ReadMessageHistory],
  ["SendMessages", PermissionFlagsBits.SendMessages],
] as const;

// View Channel (1024) + Send Messages (2048) + Read Message History (65536).
const INVITE_PERMISSIONS = 68608;

function inviteUrl(clientId: string, guildId?: string): string {
  const guild = guildId ? `&guild_id=${guildId}&disable_guild_select=true` : "";
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}${guild}`;
}

/**
 * Checks that the bot can actually read the configured channel. Discord only
 * sends a bot the messages of channels it can see, so a missing permission
 * looks like "connected but nothing happens" with no error at all.
 *
 * Everything shown to the streamer (channel, server, bot role) comes from
 * Discord, not from settings: even when the channel is private, a bot that is
 * in the server receives the full channel list, so we can still name it.
 *
 * Returns null when everything is fine.
 */
export async function checkChannelAccess(client: Client<true>, channelId: string): Promise<ChannelIssue | null> {
  const clientId = client.user.id;

  // Find the channel in the servers the bot is in. Uses the cache filled at
  // login, which includes private channels, instead of channels.fetch(),
  // which fails with "Missing Access" on exactly the channels we care about.
  let channel: GuildBasedChannel | undefined;
  for (const guild of client.guilds.cache.values()) {
    channel = guild.channels.cache.get(channelId);
    if (channel) break;
  }

  if (!channel) {
    // Typo in the ID, or the bot was never invited to that server.
    return { kind: "not_found", channelId, missing: [], inviteUrl: inviteUrl(clientId) };
  }

  const guild = channel.guild;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  const missing = REQUIRED.filter(([, flag]) => !perms?.has(flag)).map(([name]) => name);
  if (missing.length === 0) return null;

  return {
    kind: "no_access",
    channelId,
    channelName: channel.name,
    guildName: guild.name,
    // The role Discord created for the bot when it was invited ("managed" role).
    botRole: me.roles.botRole?.name,
    missing,
    inviteUrl: inviteUrl(clientId, guild.id),
  };
}
