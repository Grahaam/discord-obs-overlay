/** Sets KEY="value" in .env text, replacing an existing line or appending one. */
export function upsertEnvVar(envContent: string, key: string, value: string): string {
  const safeValue = `"${value.replace(/"/g, '\\"')}"`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  // Replacer function: a plain string would interpret "$&", "$$"... inside passwords
  if (regex.test(envContent)) return envContent.replace(regex, () => `${key}=${safeValue}`);
  return `${envContent}\n${key}=${safeValue}`;
}
