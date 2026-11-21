export function getDatabaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const { code } = error;
  return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : null;
}
