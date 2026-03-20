import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const authMiddleware: RequestHandler = (req, res, next) => {
  const token = process.env["API_AUTH_TOKEN"];
  if (!token) {
    res
      .status(500)
      .json({ error: "Server misconfiguration: API_AUTH_TOKEN not set" });
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization token" });
    return;
  }

  const provided = header.slice(7);

  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token, "utf-8");
  const providedBuf = Buffer.from(provided, "utf-8");

  if (
    tokenBuf.length !== providedBuf.length ||
    !timingSafeEqual(tokenBuf, providedBuf)
  ) {
    res.status(401).json({ error: "Missing or invalid authorization token" });
    return;
  }

  next();
};
