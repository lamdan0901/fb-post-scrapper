import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";

export const rawPostsRouter: RouterType = Router();

const listRawPostsQuerySchema = z.object({
  // accepts full ISO datetimes (YYYY-MM-DDTHH:mm:ss.sssZ) or bare dates
  date: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/raw-posts/dates — list unique scrape datetimes (descending) */
rawPostsRouter.get("/dates", async (_req, res) => {
  const rows = await prisma.rawPost.findMany({
    select: { scrape_date: true },
    distinct: ["scrape_date"],
    orderBy: { scrape_date: "desc" },
  });
  const dates = rows.map((r) => r.scrape_date).filter(Boolean);
  res.json({ dates });
});

/** GET /api/raw-posts?date=<ISO datetime>&page=1&limit=20 — paginated raw posts, optionally filtered by exact scrape datetime */
rawPostsRouter.get("/", async (req, res) => {
  const query = listRawPostsQuerySchema.parse(req.query);
  const where = query.date ? { scrape_date: query.date } : {};

  const [posts, total] = await Promise.all([
    prisma.rawPost.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.rawPost.count({ where }),
  ]);

  res.json({
    posts,
    total,
    page: query.page,
    totalPages: Math.ceil(total / query.limit),
  });
});

/** DELETE /api/raw-posts — clear all raw posts */
rawPostsRouter.delete("/", async (_req, res) => {
  const { count } = await prisma.rawPost.deleteMany();
  res.json({ deleted: count });
});
