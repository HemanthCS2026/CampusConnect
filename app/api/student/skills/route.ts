import { NextResponse } from "next/server";
import { Int32 } from "mongodb";
import { getSessionUser, requireRole } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import { getStudentSkillProfilesCollection } from "@/lib/mongodb";
import { findStudentIdentity } from "@/lib/student-identity";
import { parseSkillEntries } from "@/lib/student-skills";
import { readBoundedJsonBody } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";

const MAX_SKILL_PROFILE_REQUEST_BYTES = 32_768;

function getStudentUser(request: Request):
  | { user: AuthUser }
  | { response: NextResponse } {
  const sessionUser = getSessionUser(request);
  try {
    return { user: requireRole(sessionUser, ["Student"]) };
  } catch {
    return {
      response: NextResponse.json(
        { success: false, message: "Sign in as a student." },
        { status: sessionUser ? 403 : 401 }
      ),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailableResponse() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Student skill profiles are unavailable. Configure MongoDB and run the collection setup script.",
    },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const session = getStudentUser(request);
  if ("response" in session) return session.response;

  let identity;
  try {
    identity = await findStudentIdentity(session.user.userId);
  } catch {
    console.error("Student identity lookup failed for skill profile retrieval.");
    return NextResponse.json(
      { success: false, message: "Student profile is unavailable." },
      { status: 500 }
    );
  }

  if (!identity) {
    return NextResponse.json(
      { success: false, message: "Student profile not found." },
      { status: 404 }
    );
  }

  try {
    const collection = await getStudentSkillProfilesCollection();
    const profile = await collection.findOne(
      { studentId: new Int32(identity.studentId) },
      { projection: { _id: 0, studentId: 0 } }
    );

    return NextResponse.json({
      success: true,
      profile: profile
        ? {
            skills: profile.skills,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            schemaVersion: profile.schemaVersion,
          }
        : null,
    });
  } catch {
    console.error("Student skill profile retrieval failed.");
    return unavailableResponse();
  }
}

export async function PUT(request: Request) {
  const session = getStudentUser(request);
  if ("response" in session) return session.response;

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      {
        success: false,
        message: "Cross-origin profile updates are not allowed.",
      },
      { status: 403 }
    );
  }

  const parsedBody = await readBoundedJsonBody(
    request,
    MAX_SKILL_PROFILE_REQUEST_BYTES
  );
  if (!parsedBody.ok) {
    const tooLarge = parsedBody.reason === "too-large";
    return NextResponse.json(
      {
        success: false,
        message: tooLarge
          ? "Request body is too large."
          : "Request body must be valid JSON.",
      },
      { status: tooLarge ? 413 : 400 }
    );
  }
  const body = parsedBody.value;

  if (!isRecord(body) || Object.keys(body).some((key) => key !== "skills")) {
    return NextResponse.json(
      {
        success: false,
        message: "Provide only a skills array; student IDs are server-resolved.",
      },
      { status: 400 }
    );
  }

  const parsedSkills = parseSkillEntries(body.skills);
  if ("error" in parsedSkills) {
    return NextResponse.json(
      { success: false, message: parsedSkills.error },
      { status: 400 }
    );
  }

  let identity;
  try {
    identity = await findStudentIdentity(session.user.userId);
  } catch {
    console.error("Student identity lookup failed for skill profile update.");
    return NextResponse.json(
      { success: false, message: "Student profile is unavailable." },
      { status: 500 }
    );
  }

  if (!identity) {
    return NextResponse.json(
      { success: false, message: "Student profile not found." },
      { status: 404 }
    );
  }

  try {
    const collection = await getStudentSkillProfilesCollection();
    const now = new Date();
    const studentId = new Int32(identity.studentId);
    await collection.updateOne(
      { studentId },
      {
        $set: {
          skills: parsedSkills.skills,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          schemaVersion: new Int32(1),
        },
      },
      { upsert: true }
    );
    const profile = await collection.findOne(
      { studentId },
      { projection: { _id: 0, studentId: 0 } }
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Skill profile could not be saved." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        skills: profile.skills,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        schemaVersion: profile.schemaVersion,
      },
    });
  } catch {
    console.error("Student skill profile update failed.");
    return unavailableResponse();
  }
}
