// Create the student skill profile collection and its exact-owner lookup index.
const database = db.getSiblingDB("campusconnect");
const collectionName = "student_skill_profiles";
const validator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id",
      "studentId",
      "skills",
      "createdAt",
      "updatedAt",
      "schemaVersion",
    ],
    additionalProperties: false,
    properties: {
      _id: { bsonType: "objectId" },
      studentId: {
        bsonType: "int",
        minimum: 1,
        maximum: 2147483647,
      },
      skills: {
        bsonType: "array",
        maxItems: 100,
        items: {
          bsonType: "object",
          required: ["name", "proficiency"],
          additionalProperties: false,
          properties: {
            name: {
              bsonType: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
            proficiency: {
              enum: ["beginner", "intermediate", "advanced", "expert"],
            },
          },
        },
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
      schemaVersion: { bsonType: "int", minimum: 1 },
    },
  },
};

const existingCollection = database.getCollectionInfos({
  name: collectionName,
})[0];

if (!existingCollection) {
  database.createCollection(collectionName, {
    validator,
    validationLevel: "strict",
    validationAction: "error",
  });
  print(`Created ${collectionName} with document validation.`);
} else {
  print(
    `${collectionName} already exists; its validator was not changed. Review it before using this setup.`
  );
}

const collection = database.getCollection(collectionName);
const hasUniqueStudentIdIndex = collection.getIndexes().some(
  (index) =>
    index.unique === true &&
    Object.keys(index.key).length === 1 &&
    index.key.studentId === 1
);

if (!hasUniqueStudentIdIndex) {
  collection.createIndex(
    { studentId: 1 },
    { unique: true, name: "studentId_unique" }
  );
}
print("Ensured a unique studentId index exists.");
