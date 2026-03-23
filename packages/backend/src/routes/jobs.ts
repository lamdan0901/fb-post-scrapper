import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { Prisma } from "@job-alert/generated-prisma";
import { prisma } from "../lib/db.js";
import { NotFoundError } from "../errors.js";

// ── Zod Schemas ──

export const jobIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z
    .enum(["Frontend", "Backend", "Fullstack", "Mobile", "Other"])
    .optional(),
  level: z
    .enum(["Fresher", "Junior", "Middle", "Senior", "Unknown"])
    .optional(),
  is_freelance: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  status: z.enum(["new", "viewed", "applied", "saved", "archived"]).optional(),
  source: z.enum(["manual", "cron"]).optional(),
  search: z.string().trim().max(200).optional(),
});

export const updateJobStatusSchema = z.object({
  status: z.enum(["new", "viewed", "applied", "saved", "archived"]),
});

export const createFeedbackSchema = z.object({
  feedback_type: z.enum(["relevant", "irrelevant"]),
});

// ── Router ──

export const jobsRouter: RouterType = Router();

// GET /jobs — list with filters & pagination
jobsRouter.get("/", async (req, res) => {
  const query = listJobsQuerySchema.parse(req.query);

  const where: Prisma.JobWhereInput = {};

  if (query.role) where.role = query.role;
  if (query.level) where.level = query.level;
  if (query.is_freelance !== undefined) where.is_freelance = query.is_freelance;
  if (query.status) {
    where.status = query.status;
  } else {
    // Exclude archived jobs by default
    where.status = { not: "archived" };
  }
  if (query.source) where.source = query.source;
  if (query.search) {
    where.content = { contains: query.search };
  }

  const skip = (query.page - 1) * query.limit;

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.job.count({ where }),
  ]);

  res.json({
    jobs,
    total,
    page: query.page,
    totalPages: Math.ceil(total / query.limit),
  });
});

// PUT /jobs/:id — update job status
jobsRouter.put("/:id", async (req, res) => {
  const { id } = jobIdParamSchema.parse(req.params);
  const { status } = updateJobStatusSchema.parse(req.body);

  try {
    const job = await prisma.job.update({
      where: { id },
      data: { status },
    });
    res.json(job);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError(`Job with id ${id} not found`);
    }
    throw err;
  }
});

// DELETE /jobs/:id — permanently delete a job and its feedbacks
jobsRouter.delete("/:id", async (req, res) => {
  const { id } = jobIdParamSchema.parse(req.params);

  try {
    await prisma.job.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new NotFoundError(`Job with id ${id} not found`);
    }
    throw err;
  }
});

// POST /jobs/:id/feedback — create user feedback
jobsRouter.post("/:id/feedback", async (req, res) => {
  const { id } = jobIdParamSchema.parse(req.params);
  const { feedback_type } = createFeedbackSchema.parse(req.body);

  try {
    const feedback = await prisma.userFeedback.create({
      data: { job_id: id, feedback_type },
    });
    res.status(201).json(feedback);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      throw new NotFoundError(`Job with id ${id} not found`);
    }
    throw err;
  }
});
