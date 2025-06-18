// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const ACCESS_TOKEN_KEY = process.env.ACCESS_TOKEN_KEY as string ;
if (!ACCESS_TOKEN_KEY) {
  throw new Error("ACCESS_TOKEN_KEY is missing in .env");
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  jwt.verify(token, ACCESS_TOKEN_KEY, (err, decoded) => {
    if (err) {
      // console.log("JWT verification error:", err);
      return res.status(403).json({ message: "Invalid or expired token." });
    }

    req.user = decoded as JwtPayload;
    next();
  });
}
