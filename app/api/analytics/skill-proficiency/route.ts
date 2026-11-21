import { NextResponse } from "next/server";
import { getStudentSkillProfilesCollection } from "@/lib/mongodb";
import { getSessionUser, requireRole } from "@/lib/auth";


export async function GET(request: Request) {
  const sessionUser = getSessionUser(request);
  try {
    requireRole(sessionUser, ["Admin"]);
  } catch {
    return NextResponse.json(
      { success: false, message: "Administrator access required." },
      { status: sessionUser ? 403 : 401 }
    );
  }

  try {
    const collection = await getStudentSkillProfilesCollection();
    const results = await collection
      .aggregate<{
        skill: string;
        proficiency: string;
        studentCount: number;
      }>([
        { $match: { skills: { $type: "array" } } },
        { $unwind: "$skills" },
        {
          $match: {
            "skills.name": { $type: "string", $ne: "" },
            "skills.proficiency": { $type: "string" },
          },
        },
        {
          $set: {
            normalizedSkill: {
              $toLower: { $trim: { input: "$skills.name" } },
            },
          },
        },
        { $match: { normalizedSkill: { $ne: "" } } },
        {
          $group: {
            _id: {
              profileId: "$_id",
              skill: "$normalizedSkill",
              proficiency: "$skills.proficiency",
            },
          },
        },
        {
          $group: {
            _id: {
              skill: "$_id.skill",
              proficiency: "$_id.proficiency",
            },
            studentCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            skill: "$_id.skill",
            proficiency: "$_id.proficiency",
            studentCount: 1,
          },
        },
        { $sort: { skill: 1, proficiency: 1 } },
        { $limit: 200 },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch {
    console.error("MongoDB skill analytics are unavailable.");
    return NextResponse.json(
      {
        success: false,
        message:
          "Skill analytics are unavailable. Configure MongoDB and run the collection setup script.",
      },
      { status: 503 }
    );
  }
}
