export const SKILL_PROFICIENCIES = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
] as const;

export type SkillProficiency = (typeof SKILL_PROFICIENCIES)[number];

export type SkillEntry = {
  name: string;
  proficiency: SkillProficiency;
};

function isSkillProficiency(value: string): value is SkillProficiency {
  return SKILL_PROFICIENCIES.some((proficiency) => proficiency === value);
}

export function parseSkillEntries(
  value: unknown
): { skills: SkillEntry[] } | { error: string } {
  if (!Array.isArray(value) || value.length > 100) {
    return { error: "skills must be an array containing at most 100 entries." };
  }

  const skills: SkillEntry[] = [];
  const names = new Set<string>();

  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      Object.keys(entry).some((key) => key !== "name" && key !== "proficiency")
    ) {
      return { error: "Each skill must contain only name and proficiency." };
    }

    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.proficiency !== "string" ||
      !isSkillProficiency(candidate.proficiency)
    ) {
      return { error: "Each skill requires a valid name and proficiency." };
    }

    if (/[\u0000-\u001F\u007F]/.test(candidate.name)) {
      return { error: "Skill names cannot contain control characters." };
    }

    const name = candidate.name
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    const characterCount = [...name].length;

    if (characterCount < 1 || characterCount > 80) {
      return { error: "Skill names must contain 1-80 valid characters." };
    }

    if (names.has(name)) {
      return { error: "Duplicate skill names are not allowed." };
    }
    names.add(name);

    skills.push({
      name,
      proficiency: candidate.proficiency,
    });
  }

  return { skills };
}
