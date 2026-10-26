import test from "node:test";
import assert from "node:assert";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { inviteUrl, listTextChannels, missingPermissions } from "./channelCheck.js";

const allowing = (...flags: bigint[]) => ({ has: (f: bigint) => flags.includes(f) });
const ALL = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages];

test("missingPermissions: lists what the bot lacks, null means everything", () => {
  assert.deepStrictEqual(missingPermissions(allowing(...ALL)), []);
  assert.deepStrictEqual(missingPermissions(allowing(PermissionFlagsBits.SendMessages)), [
    "ViewChannel",
    "ReadMessageHistory",
  ]);
  assert.deepStrictEqual(missingPermissions(null), ["ViewChannel", "ReadMessageHistory", "SendMessages"]);
});

test("listTextChannels: keeps text/announcement channels, sorted by position, with readable/missing", () => {
  const channels = [
    { id: "3", name: "b", type: ChannelType.GuildText, rawPosition: 2 },
    { id: "2", name: "voice", type: ChannelType.GuildVoice, rawPosition: 1 },
    { id: "1", name: "a", type: ChannelType.GuildAnnouncement, rawPosition: 0 },
    { id: "4", name: "private", type: ChannelType.GuildText, rawPosition: 3 },
  ];
  const result = listTextChannels(channels, (c) => (c.id === "4" ? allowing() : allowing(...ALL)));
  assert.deepStrictEqual(
    result.map((c) => c.id),
    ["1", "3", "4"]
  );
  assert.deepStrictEqual(result[0], { id: "1", name: "a", readable: true, missing: [] });
  assert.strictEqual(result[2].readable, false);
  assert.deepStrictEqual(result[2].missing, ["ViewChannel", "ReadMessageHistory", "SendMessages"]);
});

test("inviteUrl: bot + slash commands scopes, 68672 permissions, optional guild lock", () => {
  const url = inviteUrl("42");
  assert.ok(url.includes("client_id=42&scope=bot%20applications.commands&permissions=68672"));
  assert.ok(!url.includes("guild_id"));
  assert.ok(inviteUrl("42", "7").endsWith("&guild_id=7&disable_guild_select=true"));
});
