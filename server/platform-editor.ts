import { createHash } from "node:crypto";
import type { Express } from "express";
import { pool } from "./db";
import { createEditorSource, type EditorActor } from "./platform-editor-source";

const nativeId = (prefix: string, actor: EditorActor) =>
  prefix + createHash("sha256").update(actor.id).digest("hex").slice(0, 40);

/** Asosiy saytdagi admin — Master Quiz admini. */
async function resolveAdmin(actor: EditorActor) {
  const id = nativeId("zt-editor-", actor);
  await pool.query(
    "INSERT INTO users(id,first_name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
    [id, actor.fullName],
  );
  await pool.query(
    "INSERT INTO user_profiles(user_id,role,display_name,plan,quiz_limit,is_active) VALUES($1,'admin',$2,'premium',1000000,true) ON CONFLICT(user_id) DO NOTHING",
    [id, actor.fullName],
  );
  const p = (
    await pool.query("SELECT role,is_active FROM user_profiles WHERE user_id=$1", [id])
  ).rows[0];
  if (p?.role !== "admin" || !p.is_active)
    throw Object.assign(Error("Manba admin hisobi yopilgan"), { status: 403 });
  return id;
}

/**
 * Asosiy saytda admin "O'qituvchi" qilib belgilagan foydalanuvchi.
 * Kabinetida eski Master Quiz o'qituvchi hisobini bog'lagan bo'lsa — o'sha hisob
 * (eski testlari va natijalari bilan) ochiladi, aks holda yangi o'qituvchi hisobi yaratiladi.
 * Bog'langan hisob admin yoki o'quvchi bo'lsa, unga o'qituvchi huquqi berilmaydi.
 */
export async function resolveTeacher(actor: EditorActor) {
  const linked = (
    await pool
      .query(
        "SELECT l.native_user_id,p.role,p.is_active FROM platform_legacy_links l JOIN user_profiles p ON p.user_id=l.native_user_id WHERE l.external_user_id=$1",
        [actor.id],
      )
      .catch((e: any) => {
        if (e.code === "42P01") return { rows: [] };
        throw e;
      })
  ).rows[0];
  if (linked?.role === "teacher") {
    if (!linked.is_active)
      throw Object.assign(Error("Master Quiz hisobingiz faolsizlantirilgan"), {
        status: 403,
      });
    return linked.native_user_id as string;
  }
  const id = nativeId("zt-teacher-", actor);
  await pool.query(
    "INSERT INTO users(id,first_name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
    [id, actor.fullName],
  );
  await pool.query(
    "INSERT INTO user_profiles(user_id,role,display_name,plan,quiz_limit,is_active) VALUES($1,'teacher',$2,'premium',1000000,true) ON CONFLICT(user_id) DO NOTHING",
    [id, actor.fullName],
  );
  const p = (
    await pool.query("SELECT role,is_active FROM user_profiles WHERE user_id=$1", [id])
  ).rows[0];
  if (p?.role !== "teacher" || !p.is_active)
    throw Object.assign(Error("O‘qituvchi hisobi yopilgan"), { status: 403 });
  return id;
}

export function quizEditor(app: Express) {
  return createEditorSource(app, {
    provider: "quiz",
    allowedRoles: ["admin", "teacher"],
    editorPath: (actor) => (actor.role === "teacher" ? "/teacher" : "/admin"),
    resolve: (actor) =>
      actor.role === "teacher" ? resolveTeacher(actor) : resolveAdmin(actor),
  });
}
