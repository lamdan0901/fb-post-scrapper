import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaBetterSqlite3({
  url: process.env["DATABASE_URL"]!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      target_groups: JSON.stringify([
        "https://www.facebook.com/groups/jobsitvietnam/",
        "https://www.facebook.com/groups/yeuremotenghienfreelance/",
        "https://www.facebook.com/groups/remote.freelance.it/",
        "https://www.facebook.com/groups/976679876378945/",
        "https://www.facebook.com/groups/otingting2021/",
      ]),
      target_keywords: JSON.stringify([
        "react",
        "nextjs",
        "frontend",
        "mobile",
        "typescript",
        "remote",
      ]),
      blacklist: JSON.stringify(["tinhvan", "cmcglobal", "viettel"]),
      allowed_roles: JSON.stringify([
        "Frontend",
        "Backend",
        "Fullstack",
        "Mobile",
        "Other",
      ]),
      allowed_levels: JSON.stringify([
        "Fresher",
        "Junior",
        "Middle",
        "Unknown",
      ]),
      max_yoe: 5,
      cron_schedule: "0 */4 * * *",
    },
  });

  console.log("Seed complete: default Settings row inserted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
