import { is, SQL } from "drizzle-orm";
import { PgTable, PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
/** Create test tables from the actual application column definitions, without a second copied schema. */
export async function installSchema(pool: any) {
  const dialect = new PgDialect();
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const c = getTableConfig(table);
    const literal = (v: any): string =>
      typeof v === "boolean"
        ? String(v)
        : typeof v === "number"
          ? String(v)
          : "'" +
            String(typeof v === "object" ? JSON.stringify(v) : v).replace(
              /'/g,
              "''",
            ) +
            "'";
    const columns = c.columns.map((column) => {
      let value =
        '"' +
        column.name +
        '" ' +
        column.getSQLType() +
        (column.notNull ? " NOT NULL" : "") +
        (column.primary ? " PRIMARY KEY" : "");
      if (column.default !== undefined)
        value +=
          " DEFAULT " +
          (is(column.default, SQL)
            ? dialect.sqlToQuery(column.default).sql
            : Array.isArray(column.default) &&
                column.getSQLType().endsWith("[]")
              ? "ARRAY[" +
                column.default.map(literal).join(",") +
                "]::" +
                column.getSQLType()
              : literal(column.default));
      return value;
    });
    for (const pk of c.primaryKeys)
      columns.push(
        "PRIMARY KEY(" +
          pk.columns.map((c) => '"' + c.name + '"').join(",") +
          ")",
      );
    await pool.query(
      'CREATE TABLE IF NOT EXISTS "' + c.name + '" (' + columns.join(",") + ")",
    );
  }
}
