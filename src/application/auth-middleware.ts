import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface AuthMiddlewareOptions {
  apiKey: string;
  skipPaths?: Set<string>;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { apiKey, skipPaths } = options;
  const expectedBuffer = Buffer.from(apiKey, "utf8");

  return function authMiddleware(request: Request, response: Response, next: NextFunction) {
    if (skipPaths?.has(request.path)) {
      next();
      return;
    }

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).json({
        code: "unauthorized",
        message: "Missing or invalid API key.",
      });
      return;
    }

    const token = header.slice(7);
    const tokenBuffer = Buffer.from(token, "utf8");

    if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).json({
        code: "unauthorized",
        message: "Missing or invalid API key.",
      });
      return;
    }

    next();
  };
}
