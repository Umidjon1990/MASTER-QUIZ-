import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { userProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding test users...");

  const testUsers = [
    {
      email: "admin@quizlive.uz",
      password: "admin123",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      displayName: "Administrator",
      quizLimit: 999,
    },
    {
      email: "teacher@quizlive.uz",
      password: "teacher123",
      firstName: "O'qituvchi",
      lastName: "Test",
      role: "teacher",
      displayName: "Test O'qituvchi",
      quizLimit: 50,
    },
    {
      email: "student@quizlive.uz",
      password: "student123",
      firstName: "O'quvchi",
      lastName: "Test",
      role: "student",
      displayName: "Test O'quvchi",
      quizLimit: 5,
    },
  ];

  for (const u of testUsers) {
    const existing = await db.select().from(users).where(eq(users.email, u.email));
    if (existing.length > 0) {
      console.log(`User ${u.email} already exists, skipping...`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(u.password, 10);
    const [newUser] = await db
      .insert(users)
      .values({
        email: u.email,
        password: hashedPassword,
        firstName: u.firstName,
        lastName: u.lastName,
      })
      .returning();

    await db.insert(userProfiles).values({
      userId: newUser.id,
      role: u.role,
      displayName: u.displayName,
      plan: "free",
      quizLimit: u.quizLimit,
    });

    console.log(`Created user: ${u.email} (${u.role})`);
  }

  console.log("\nTest users created:");
  console.log("Admin:    admin@quizlive.uz    / admin123");
  console.log("Teacher:  teacher@quizlive.uz  / teacher123");
  console.log("Student:  student@quizlive.uz  / student123");
  console.log("\nSeeding complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
