import type { DeduplicationStore } from "@job-alert/scraper";
import { prisma } from "./db.js";

export function createDeduplicationStore(): DeduplicationStore {
  return {
    async findByFbPostId(fbPostId: string) {
      const job = await prisma.job.findFirst({
        where: { fb_post_id: fbPostId },
        select: { first_seen_at: true },
      });
      if (job) return job;
      return prisma.rawPost.findFirst({
        where: { fb_post_id: fbPostId },
        select: { first_seen_at: true },
      });
    },
    async findByPostUrlHash(hash: string) {
      const job = await prisma.job.findFirst({
        where: { post_url_hash: hash },
        select: { first_seen_at: true },
      });
      if (job) return job;
      return prisma.rawPost.findFirst({
        where: { post_url_hash: hash },
        select: { first_seen_at: true },
      });
    },
    async findByContentHash(hash: string) {
      const job = await prisma.job.findFirst({
        where: { content_hash: hash },
        select: { first_seen_at: true },
      });
      if (job) return job;
      return prisma.rawPost.findFirst({
        where: { content_hash: hash },
        select: { first_seen_at: true },
      });
    },
  };
}
