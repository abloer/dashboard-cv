const { createHmac, timingSafeEqual } = require("crypto");
const express = require("express");
const { z } = require("zod");

const ROLE_LEVELS = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

const createClientInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const isPlaceholderSecret = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized.startsWith("replace-with-") || normalized.includes("your-");
};

const validateAuthRuntimeConfig = (env = process.env) => {
  if (env.AUTH_REQUIRED === "false") {
    return { ok: true };
  }

  const errors = [];
  const requiredSecrets = {
    AUTH_SESSION_SECRET: env.AUTH_SESSION_SECRET,
    ARTIFACT_URL_SECRET: env.ARTIFACT_URL_SECRET,
  };

  for (const [name, value] of Object.entries(requiredSecrets)) {
    if (isPlaceholderSecret(value)) {
      errors.push(`${name} must be set to a non-placeholder secret when AUTH_REQUIRED=true.`);
    }
  }

  const hasJwtProvider = !isPlaceholderSecret(env.AUTH_JWT_SECRET);
  const staticTokens = [
    env.AUTH_TOKEN_VIEWER,
    env.AUTH_TOKEN_OPERATOR,
    env.AUTH_TOKEN_ADMIN,
  ].filter((value) => !isPlaceholderSecret(value));
  const sessionExchangeEnabled = env.AUTH_SESSION_EXCHANGE_ENABLED === "true";

  if (!hasJwtProvider && staticTokens.length === 0) {
    errors.push("Configure AUTH_JWT_SECRET or at least one non-placeholder static token.");
  }

  if (sessionExchangeEnabled && isPlaceholderSecret(env.AUTH_SESSION_EXCHANGE_KEY)) {
    errors.push("AUTH_SESSION_EXCHANGE_KEY must be set when AUTH_SESSION_EXCHANGE_ENABLED=true.");
  }

  if (!hasJwtProvider && !sessionExchangeEnabled) {
    errors.push("No login/session mechanism is enabled; configure JWT auth or guarded session exchange.");
  }

  if (errors.length > 0) {
    const error = new Error(`Invalid auth configuration: ${errors.join(" ")}`);
    error.code = "AUTH_CONFIG_INVALID";
    throw error;
  }

  return { ok: true };
};

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookieHeader = (cookieHeader) =>
  String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }
      const key = item.slice(0, separatorIndex);
      const value = item.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});

const authSessionPayloadSchema = z.object({
  token: z.string().trim().min(1),
});

const createAuthBoundary = ({ env = process.env, artifactAccess }) => {
  const {
    AUTH_REQUIRED = "true",
    AUTH_JWT_SECRET,
    AUTH_TOKEN_VIEWER,
    AUTH_TOKEN_OPERATOR,
    AUTH_TOKEN_ADMIN,
    AUTH_SESSION_SECRET,
    AUTH_SESSION_COOKIE_NAME = "cv_session",
    AUTH_SESSION_TTL_SECONDS = "28800",
    AUTH_COOKIE_SECURE = "false",
    AUTH_SESSION_EXCHANGE_ENABLED = "false",
    AUTH_SESSION_EXCHANGE_KEY,
  } = env;

  const isAuthRequired = AUTH_REQUIRED !== "false";
  const sessionSigningSecret = AUTH_SESSION_SECRET || AUTH_JWT_SECRET || AUTH_TOKEN_ADMIN;
  const authSessionTtlSeconds = Number(AUTH_SESSION_TTL_SECONDS) || 28800;
  const staticRoleTokens = new Map(
    [
      [AUTH_TOKEN_VIEWER, "viewer"],
      [AUTH_TOKEN_OPERATOR, "operator"],
      [AUTH_TOKEN_ADMIN, "admin"],
    ].filter(([token]) => Boolean(token))
  );

  const verifyJwtToken = (token) => {
    if (!AUTH_JWT_SECRET) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    let header;
    let payload;
    try {
      header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
      payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
    } catch (_error) {
      return null;
    }

    if (header?.alg !== "HS256") {
      return null;
    }

    const expectedSignature = createHmac("sha256", AUTH_JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    if (payload.exp && Date.now() >= Number(payload.exp) * 1000) {
      return null;
    }

    return payload;
  };

  const signHmacPayload = (payload, secret) => {
    if (!secret) {
      return null;
    }
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  };

  const verifyHmacPayload = (token, secret) => {
    if (!token || !secret) {
      return null;
    }
    const [encodedPayload, signature] = String(token).split(".");
    if (!encodedPayload || !signature) {
      return null;
    }
    const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
      if (payload.exp && Date.now() >= Number(payload.exp) * 1000) {
        return null;
      }
      return payload;
    } catch (_error) {
      return null;
    }
  };

  const resolveTokenIdentity = (token) => {
    let role = staticRoleTokens.get(token) || null;
    let subject = "static-token";
    if (!role) {
      const jwtPayload = verifyJwtToken(token);
      role = typeof jwtPayload?.role === "string" ? jwtPayload.role : null;
      subject = String(jwtPayload?.sub || "jwt");
    }
    if (!ROLE_LEVELS[role]) {
      return null;
    }
    return { role, subject };
  };

  const createSessionToken = ({ role, subject }) =>
    signHmacPayload(
      {
        role,
        sub: subject,
        exp: Math.floor(Date.now() / 1000) + authSessionTtlSeconds,
      },
      sessionSigningSecret
    );

  const createAuthSessionForExchange = ({ token, exchangeKey }) => {
    if (AUTH_SESSION_EXCHANGE_ENABLED !== "true") {
      const error = createClientInputError("Session exchange is disabled.");
      error.statusCode = 403;
      throw error;
    }

    if (!AUTH_SESSION_EXCHANGE_KEY || !safeEqual(String(exchangeKey || ""), AUTH_SESSION_EXCHANGE_KEY)) {
      const error = createClientInputError("Session exchange key is invalid.");
      error.statusCode = 403;
      throw error;
    }

    const identity = resolveTokenIdentity(token);
    if (!identity) {
      const error = createClientInputError("Token is invalid.");
      error.statusCode = 401;
      throw error;
    }

    const sessionToken = createSessionToken(identity);
    if (!sessionToken) {
      const error = new Error("Auth session signing is not configured.");
      error.statusCode = 500;
      throw error;
    }

    return { identity, sessionToken };
  };

  const verifySessionToken = (token) => {
    const payload = verifyHmacPayload(token, sessionSigningSecret);
    const role = typeof payload?.role === "string" ? payload.role : null;
    if (!ROLE_LEVELS[role]) {
      return null;
    }
    return {
      role,
      subject: String(payload.sub || "session"),
    };
  };

  const getRequiredRole = (req) => {
    if (req.method === "OPTIONS" || req.path === "/health") {
      return null;
    }
    if (req.method === "GET" && artifactAccess.isSignedArtifactRequest(req)) {
      return null;
    }
    if (req.path === "/auth/session") {
      return null;
    }
    if (req.path === "/metrics") {
      return "admin";
    }
    if (req.path === "/analysis-output/cleanup") {
      return "admin";
    }
    if (req.path === "/sync") {
      return "admin";
    }
    return req.method === "GET" ? "viewer" : "operator";
  };

  const authenticateRequest = (req, res, next) => {
    const requiredRole = getRequiredRole(req);
    if (!requiredRole || !isAuthRequired) {
      return next();
    }

    const authHeader = String(req.header("authorization") || "");
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const cookies = parseCookieHeader(req.header("cookie"));
    if (!token && !cookies[AUTH_SESSION_COOKIE_NAME]) {
      return res.status(401).json({ ok: false, message: "Bearer token is required." });
    }

    let identity = token ? resolveTokenIdentity(token) : null;
    if (!identity) {
      identity = verifySessionToken(cookies[AUTH_SESSION_COOKIE_NAME]);
    }

    if (!identity) {
      return res.status(401).json({ ok: false, message: "Bearer token is invalid." });
    }

    if (ROLE_LEVELS[identity.role] < ROLE_LEVELS[requiredRole]) {
      return res.status(403).json({
        ok: false,
        message: `Role '${requiredRole}' or higher is required.`,
      });
    }

    req.auth = identity;
    return next();
  };

  const router = express.Router();

  router.post("/auth/session", (req, res) => {
    try {
      const parsed = authSessionPayloadSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "Invalid auth session payload.",
          errors: parsed.error.flatten(),
        });
      }

      const { identity, sessionToken } = createAuthSessionForExchange({
        token: parsed.data.token,
        exchangeKey: req.header("x-session-exchange-key"),
      });

      res.cookie(AUTH_SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: AUTH_COOKIE_SECURE === "true",
        maxAge: authSessionTtlSeconds * 1000,
        path: "/",
      });

      return res.json({
        ok: true,
        role: identity.role,
        expiresInSeconds: authSessionTtlSeconds,
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        ok: false,
        message: error?.message || "Auth session failed.",
      });
    }
  });

  router.post("/auth/logout", (_req, res) => {
    res.clearCookie(AUTH_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: AUTH_COOKIE_SECURE === "true",
      path: "/",
    });
    return res.json({ ok: true });
  });

  return {
    authenticateRequest,
    createAuthSessionForExchange,
    createSessionToken,
    getRequiredRole,
    resolveTokenIdentity,
    router,
    verifySessionToken,
  };
};

module.exports = {
  ROLE_LEVELS,
  createAuthBoundary,
  validateAuthRuntimeConfig,
};
