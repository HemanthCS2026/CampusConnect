import "server-only";

import { Int32, MongoClient, type Collection, type Db } from "mongodb";
import type { SkillEntry } from "@/lib/student-skills";

export const STUDENT_SKILL_PROFILES = "student_skill_profiles";

export type StudentSkillProfileDocument = {
  studentId: number | Int32;
  skills: SkillEntry[];
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: number | Int32;
};

declare global {
  var campusConnectMongoClientPromise: Promise<MongoClient> | undefined;
}

function getMongoClientPromise(uri: string): Promise<MongoClient> {
  if (!globalThis.campusConnectMongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    const connection = client.connect().catch((error: unknown) => {
      globalThis.campusConnectMongoClientPromise = undefined;
      throw error;
    });
    globalThis.campusConnectMongoClientPromise = connection;
  }

  const connection = globalThis.campusConnectMongoClientPromise;
  if (!connection) {
    throw new Error("MongoDB connection could not be initialized.");
  }
  return connection;
}

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DATABASE?.trim();

  if (!uri || !databaseName) {
    throw new Error("MongoDB server configuration is not available.");
  }

  return (await getMongoClientPromise(uri)).db(databaseName);
}

export async function getStudentSkillProfilesCollection():
  Promise<Collection<StudentSkillProfileDocument>> {
  const db = await getMongoDatabase();
  const exists = await db
    .listCollections({ name: STUDENT_SKILL_PROFILES }, { nameOnly: true })
    .hasNext();

  if (!exists) {
    throw new Error("MongoDB student skill profile collection is not set up.");
  }

  return db.collection<StudentSkillProfileDocument>(STUDENT_SKILL_PROFILES);
}
