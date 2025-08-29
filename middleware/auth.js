// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const responseHandler = require("../utils/response.handler");

/**
 * Auth middleware improvements:
 * - Robust parsing of Authorization header (case-insensitive).
 * - Clear handling of TokenExpiredError with a code.
 * - Validate tokenVersion: access tokens include tokenVersion; if it doesn't match DB, token is invalid.
 * - Check account active/locked state.
 *
 * REQUIREMENTS:
 * - Access tokens must be signed with process.env.JWT_SECRET (same as AuthService).
 * - Access tokens must include { userId, tokenVersion } in payload (as in the provided AuthService).
 */

const JWT_SECRET = process.env.JWT_SECRET;

function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header) return null;
  // Accept "Bearer <token>" case-insensitive and tolerate multiple spaces
  const match = header.match(/Bearer\s+(.+)/i);
  return match ? match[1].trim() : null;
}

const auth = async (req, res, next) => {
  try {
    // Extract token
    const token = extractBearerToken(req);
    if (!token) {
      return responseHandler.unauthorized(
        res,
        "Access denied. No token provided."
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        // Token expired — client should try refresh
        return res.status(401).json({
          status: "error",
          message: "Token has expired.",
          code: "TOKEN_EXPIRED",
        });
      }
      // Invalid token
      return responseHandler.unauthorized(res, "Invalid token.");
    }

    if (!decoded || !decoded.userId) {
      return responseHandler.unauthorized(res, "Invalid token payload.");
    }

    // Load user and minimal fields
    const user = await User.findById(decoded.userId).select(
      "isActive tokenVersion lockUntil role"
    );

    if (!user) {
      return responseHandler.unauthorized(
        res,
        "Invalid token. User not found."
      );
    }

    if (!user.isActive) {
      return responseHandler.unauthorized(res, "Account has been deactivated.");
    }

    if (user.isLocked) {
      return res.status(423).json({
        status: "error",
        message:
          "Account is temporarily locked due to too many failed login attempts. Please try again later.",
      });
    }

    const googleAuth = async (req, res, next) => {};

    // tokenVersion check - guards against password resets / logoutAll scenarios
    // decoded.tokenVersion may be undefined — be conservative
    const tokenVersionOnToken =
      typeof decoded.tokenVersion !== "undefined" ? decoded.tokenVersion : null;
    if (tokenVersionOnToken === null) {
      // token doesn't carry tokenVersion -> reject (encourage short-lived tokens or re-issue)
      return responseHandler.unauthorized(
        res,
        "Invalid token (missing version)."
      );
    }

    if (Number(tokenVersionOnToken) !== Number(user.tokenVersion || 0)) {
      // Token is stale / revoked
      return res.status(401).json({
        status: "error",
        message: "Token has been revoked. Please login again.",
        code: "TOKEN_REVOKED",
      });
    }

    // OK - attach user to request for downstream handlers (attach the mongoose doc)
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return responseHandler.error(
      res,
      "Internal server error during authentication.",
      500,
      error.message || error
    );
  }
};

// optionalAuth: doesn't throw — simply sets req.user if valid, otherwise null
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch (err) {
      req.user = null;
      return next();
    }

    if (!decoded || !decoded.userId) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.userId).select(
      "isActive tokenVersion lockUntil role"
    );
    if (!user || !user.isActive || user.isLocked) {
      req.user = null;
      return next();
    }

    // tokenVersion check — if mismatch, treat as unauthenticated
    if (
      typeof decoded.tokenVersion === "undefined" ||
      Number(decoded.tokenVersion) !== Number(user.tokenVersion || 0)
    ) {
      req.user = null;
      return next();
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    req.user = null;
    return next();
  }
};

// adminAuth: run auth first, then verify role
const adminAuth = async (req, res, next) => {
  try {
    // Call auth middleware and wait for it to finish.
    // If auth already sent a response, stop.
    await new Promise((resolve) => {
      auth(req, res, () => resolve());
    });

    if (res.headersSent) return; // auth already sent a response

    if (!req.user) {
      return responseHandler.unauthorized(res, "Authentication required.");
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    return responseHandler.error(
      res,
      "Internal server error during authorization.",
      500,
      error.message || error
    );
  }
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
};
