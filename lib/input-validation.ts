type StringValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

function characterCount(value: string): number {
  return [...value].length;
}

export function validateUsername(value: unknown): StringValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "Username must be a string." };
  }

  const username = value.trim();
  const length = characterCount(username);
  if (length < 3 || length > 50) {
    return {
      ok: false,
      message: "Username must contain 3 to 50 characters after trimming.",
    };
  }

  return { ok: true, value: username };
}

export function validatePersonName(value: unknown): StringValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "Names must be strings." };
  }

  const name = value.trim();
  if (name.length === 0 || characterCount(name) > 50) {
    return {
      ok: false,
      message: "Names must contain 1 to 50 characters after trimming.",
    };
  }

  return { ok: true, value: name };
}

export function isValidResumeUrl(
  value: unknown
): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && characterCount(value) <= 255)
  );
}
