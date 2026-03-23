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
      target_keywords: JSON.stringify(["typescript", "remote"]),
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
      role_keywords: JSON.stringify({
        Frontend: ["react", "reactjs", "nextjs", "next.js", "frontend"],
        Backend: ["nodejs", "python", "java", "golang", "backend"],
        Fullstack: ["fullstack", "full-stack", "full stack"],
        Mobile: ["react native", "flutter", "mobile", "ios", "android"],
        Other: [],
      }),
      common_rules: "",
      role_rules: JSON.stringify({
        Frontend:
          "Frontend role applies ONLY to React/ReactJS/Next.js positions. If a job post mentions only Angular, Vue, or Svelte without any mention of React/ReactJS/Next.js, classify as Other, not Frontend.",
      }),
      max_yoe: 5,
      cron_schedule: "0 */4 * * *",
      excluded_locations: JSON.stringify([
        "HCM",
        "HCMC",
        "Ho Chi Minh",
        "TP.HCM",
        "Thành phố Hồ Chí Minh",
        "Đà Nẵng",
        "ĐN",
        "DN",
      ]),
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
