// Run a synthetic skill-profile aggregation without retaining test profiles.
const db = getSiblingDB("campusconnect");
const collection = db.getCollection("student_skill_profiles");
const now = new Date();
const reservedSyntheticStudentIds = new Set();

function syntheticStudentId() {
  let studentId;
  do {
    studentId = NumberInt(
      2_000_000_000 + Math.floor(Math.random() * 147_483_647)
    );
  } while (
    reservedSyntheticStudentIds.has(studentId.valueOf()) ||
    collection.findOne({ studentId })
  );
  reservedSyntheticStudentIds.add(studentId.valueOf());
  return studentId;
}

const syntheticIds = [
  new ObjectId(),
  new ObjectId(),
];
const profiles = [
  {
    _id: syntheticIds[0],
    studentId: syntheticStudentId(),
    skills: [
      { name: "typescript", proficiency: "advanced" },
      { name: "postgresql", proficiency: "intermediate" },
    ],
    createdAt: now,
    updatedAt: now,
    schemaVersion: NumberInt(1),
  },
  {
    _id: syntheticIds[1],
    studentId: syntheticStudentId(),
    skills: [
      { name: "typescript", proficiency: "beginner" },
      { name: "git", proficiency: "advanced" },
    ],
    createdAt: now,
    updatedAt: now,
    schemaVersion: NumberInt(1),
  },
];

try {
  collection.insertMany(profiles);
  const results = collection
    .aggregate([
      { $unwind: "$skills" },
      {
        $group: {
          _id: {
            profileId: "$_id",
            skill: { $toLower: { $trim: { input: "$skills.name" } } },
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
    ])
    .toArray();

  printjson({
    expectedShape: {
      skill: "string",
      proficiency: "string",
      studentCount: "number",
    },
    results,
  });
} finally {
  collection.deleteMany({ _id: { $in: syntheticIds } });
  print("Removed only the synthetic demonstration profiles.");
}
