import { defineConfig } from "drizzle-kit";

import Meta from "./src/meta.js";

export default defineConfig({
    out: "migrations",
    dialect: "sqlite",
    schema: "src/db_schema.ts",
    dbCredentials: { url: Meta.META_DB_PATH },
});