import NodeFS from "node:fs";
import NodePath from "node:path";
import { DatabaseSync, StatementResultingChanges } from "node:sqlite";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import Meta from "../meta.js";
import { tables } from "./schema.js";

// Resolve db path and create parent directories if they are missing.
const node_db_path = NodePath.resolve(Meta.META_DB_PATH);
NodeFS.mkdirSync(NodePath.dirname(node_db_path), { recursive: true });

// Create the node:sqlite db manually to setup WAL before feeding it into drizzle.
const node_db = new DatabaseSync(node_db_path, { open: true });
node_db.exec("PRAGMA journal_mode = WAL;");

// Create drizzle db and migrate if there are any pending migrations.
export const db = drizzle({ client: node_db });
migrate(db, { migrationsFolder: "migrations" });
