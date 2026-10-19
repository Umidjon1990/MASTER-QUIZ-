import { createHash } from "node:crypto";
import type { Express } from "express";
import { pool } from "./db";
import { createEditorSource } from "./platform-editor-source";
export function quizEditor(app: Express) {
  return createEditorSource(app, {
    provider: "quiz",
    editorPath: "/admin",
    resolve: async (actor) => {
      const id =
        "zt-editor-" +
        createHash("sha256").update(actor.id).digest("hex").slice(0, 40);
      await pool.query(
        "INSERT INTO users(id,first_name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
        [id, actor.fullName],
      );
      await pool.query(
        "INSERT INTO user_profiles(user_id,role,display_name,plan,quiz_limit,is_active) VALUES($1,'admin',$2,'premium',1000000,true) ON CONFLICT(user_id) DO NOTHING",
        [id, actor.fullName],
      );
      const p = (
        await pool.query(
          "SELECT role,is_active FROM user_profiles WHERE user_id=$1",
          [id],
        )
      ).rows[0];
      if (p?.role !== "admin" || !p.is_active)
        throw Object.assign(Error("Manba admin hisobi yopilgan"), {
          status: 403,
        });
      return id;
    },
  });
}
