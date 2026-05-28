import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  CHANNEL_ID: z.string().optional(),
  PORT: z.string().default("3000"),
  HOST: z.string().default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);
