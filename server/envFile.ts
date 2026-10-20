/** Escapes a value the way upsertEnvVar writes it: backslashes first, then quotes. */
function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Sets KEY="value" in .env text, replacing an existing line or appending one. */
export function upsertEnvVar(envContent: string, key: string, value: string): string {
  const safeValue = `"${escapeValue(value)}"`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  // Replacer function: a plain string would interpret "$&", "$$"... inside passwords
  if (regex.test(envContent)) return envContent.replace(regex, () => `${key}=${safeValue}`);
  return `${envContent}\n${key}=${safeValue}`;
}

/**
 * Exact inverse of upsertEnvVar: reads KEY="value" and unescapes \\ and \".
 * Returns undefined when the key is missing or not in the quoted form we write.
 * (dotenv is not used for this: it would turn a literal "\n" in a password into a newline.)
 */
export function readEnvVar(envContent: string, key: string): string | undefined {
  const match = new RegExp(`^${key}="((?:\\\\.|[^"\\\\])*)"[ \\t]*\\r?$`, "m").exec(envContent);
  if (!match) return undefined;
  return match[1].replace(/\\([\\"])/g, "$1");
}
