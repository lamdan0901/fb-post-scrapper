import { Router, type Router as RouterType } from "express";
import { prisma } from "../lib/db.js";

export const rawPostsRouter: RouterType = Router();

/** GET /api/raw-posts — list unprocessed raw posts */
rawPostsRouter.get("/", async (_req, res) => {
  const posts = await prisma.rawPost.findMany({
    orderBy: { created_at: "desc" },
  });
  res.json({ data: posts, total: posts.length });
});

/** DELETE /api/raw-posts — clear all raw posts */
rawPostsRouter.delete("/", async (_req, res) => {
  const { count } = await prisma.rawPost.deleteMany();
  res.json({ deleted: count });
});
