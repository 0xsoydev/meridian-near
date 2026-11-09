import { neon } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

function createNeon(url: string) {
  return neonDrizzle(neon(url), { schema });
}

function createPg(url: string) {
  return pgDrizzle(new Pool({ connectionString: url }), { schema });
}

type Db = ReturnType<typeof createNeon>;

let client: Db | null = null;

export function db(): Db {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = process.env.DB_DRIVER === "pg" ? (createPg(url) as unknown as Db) : createNeon(url);
  }
  return client;
}
