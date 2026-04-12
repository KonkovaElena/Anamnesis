import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { RequestPrincipal } from "../domain/anamnesis";
import { verifyJwt, JwtVerificationError, type JwtVerifyOptions } from "../core/jwt-verification";

export interface AuthMiddlewareOptions {
  apiKey?: string;
  jwt?: JwtVerifyOptions;
  skipPaths?: Set<string>;
}

declare module "express-serve-static-core" {
  interface Request {
    principal?: RequestPrincipal;
  }
}

function extractPrincipalFromJwt(payload: import("../core/jwt-verification").JwtPayload): RequestPrincipal {
  return {
    principalId: payload.sub!,
    actorId: payload.sub!,
    authMechanism: "jwt-bearer",
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    claims: payload,
  };
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { apiKey, jwt: jwtOptions, skipPaths } = options;
  const expectedBuffer = apiKey ? Buffer.from(apiKey, "utf8") : undefined;

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
        message: "Missing or invalid bearer token.",
      });
      return;
    }

    const token = header.slice(7);

    if (jwtOptions && token.includes(".")) {
      try {
        const payload = verifyJwt(token, jwtOptions);
        request.principal = extractPrincipalFromJwt(payload);
        next();
        return;
      } catch (error) {
        if (error instanceof JwtVerificationError) {
          response.setHeader("WWW-Authenticate", "Bearer");
          response.status(401).json({
            code: "unauthorized",
            message: error.message,
          });
          return;
        }
        throw error;
      }
    }

    if (expectedBuffer) {
      const tokenBuffer = Buffer.from(token, "utf8");
      if (tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer)) {
        request.principal = {
          principalId: "api-key-holder",
          actorId: "api-key-holder",
          authMechanism: "api-key",
          roles: ["operator"],
        };
        next();
        return;
      }
    }

    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({
      code: "unauthorized",
      message: "Missing or invalid bearer token.",
    });
  };
}
