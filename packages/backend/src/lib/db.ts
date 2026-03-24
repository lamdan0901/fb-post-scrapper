import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@job-alert/generated-prisma";

function resolveDbUrl(raw: string): string {
  const prefix = "file:";
  if (!raw.startsWith(prefix)) return raw;
  const filePath = raw.slice(prefix.length);
  if (path.isAbsolute(filePath)) return raw;
  // Resolve relative paths from the project root (two levels up from this file)
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  return prefix + path.resolve(projectRoot, filePath);
}

const adapter = new PrismaBetterSqlite3({
  url: resolveDbUrl(process.env["DATABASE_URL"] ?? "file:./dev.db"),
});

export const prisma: PrismaClient = new PrismaClient({ adapter });
