export const DEVELOPMENT_SESSION_SECRET =
  "development-only-change-this-secret";

const MIN_PRODUCTION_SECRET_BYTES = 32;
const MIN_DISTINCT_SECRET_CHARACTERS = 12;

function isStrongProductionSessionSecret(secret: string): boolean {
  return (
    secret !== DEVELOPMENT_SESSION_SECRET &&
    Buffer.byteLength(secret, "utf8") >= MIN_PRODUCTION_SECRET_BYTES &&
    new Set(secret).size >= MIN_DISTINCT_SECRET_CHARACTERS &&
    !/(.)\1{7,}/u.test(secret)
  );
}

export function resolveSessionSecret(
  configuredSecret: string | undefined,
  nodeEnvironment: string | undefined
): string | null {
  const secret = configuredSecret?.trim();

  if (secret) {
    if (
      nodeEnvironment === "production" &&
      !isStrongProductionSessionSecret(secret)
    ) {
      return null;
    }

    return secret;
  }

  return nodeEnvironment === "development"
    ? DEVELOPMENT_SESSION_SECRET
    : null;
}
