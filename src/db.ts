import mysql, { PoolConnection } from "mysql2/promise";
import fs from "fs";
import path from "path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

// MySQL configuration
const MYSQL_CONFIG = {
  host: "193.203.184.98",
  user: "u303037170_projectadmin",
  password: "Locate@2025",
  database: "u303037170_projectadmin",
  waitForConnections: true,
  connectionLimit: 1000,
  enableKeepAlive: true, // important
};
export const pool = mysql.createPool(MYSQL_CONFIG);

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Winston logger setup with DailyRotateFile Transport
const transport = new DailyRotateFile({
  dirname: logsDir,
  filename: "logs_%DATE%.log",
  datePattern: "DD-MM-YYYY",
  maxSize: process.env.LOG_MAX_SIZE || "300m",
  maxFiles: process.env.LOG_MAX_FILES || "1d",
  zippedArchive: false,
  auditFile: path.join(logsDir, ".audit.json"),
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [transport],
});

// Logging helper
function logToFile(data: {
  timestamp: string;
  apiName: string;
  errorMessage?: string;
  queryExecuted?: string;
  params?: any[];
  executionTime?: number;
  resultCount?: number;
  port?: number;
}): void {
  logger.info(data);
}

async function safeExecute(
  conn: PoolConnection,
  query: string,
  params: any[]
): Promise<any> {
  try {
    const [result] = await conn.execute(query, params);
    return result;
  } catch (err: any) {
    // Check for transient errors including a closed connection.
    if (
      err.code === "ECONNRESET" ||
      err.code === "ECONNREFUSED" ||
      (err.message && err.message.includes("Can't add new command when connection is in closed state"))
    ) {
      logger.warn("Transient error detected. Retrying query with a new connection.");
      const newConn = await pool.getConnection();
      try {
        const [result] = await newConn.execute(query, params);
        return result;
      } finally {
        newConn.release();
      }
    }
    logger.error({
      message: `Error in safeExecute: ${err.toString()}`,
      query,
      params,
    });
    throw err;
  }
}

export async function executeDbQuery(
  query: string,
  params: any[],
  useTransaction: boolean,
  apiName: string,
  port?: number,
  externalConnection?: PoolConnection
): Promise<any> {
  const start = Date.now();
  let conn: PoolConnection | undefined = externalConnection;
  let localConnection = false;

  try {
    if (!conn) {
      conn = await pool.getConnection();
      localConnection = true;
      if (useTransaction) {
        await conn.beginTransaction();
      }
    }

    // Execute the query using safeExecute.
    const result = await safeExecute(conn, query, params);

    // Commit if we've started a transaction.
    if (localConnection && useTransaction) {
      await conn.commit();
    }

    logToFile({
      timestamp: new Date().toLocaleString(),
      apiName,
      queryExecuted: query,
      params,
      executionTime: Date.now() - start,
      resultCount: Array.isArray(result) ? result.length : (result as any).affectedRows,
      port,
    });

    return result;
  } catch (err: any) {
    if (localConnection && useTransaction && conn) {
      await conn.rollback();
    }

    logToFile({
      timestamp: new Date().toLocaleString(),
      apiName,
      errorMessage: err.toString(),
      queryExecuted: query,
      params,
      executionTime: Date.now() - start,
      resultCount: 0,
      port,
    });

    throw err;
  } finally {
    if (localConnection && conn) {
      conn.release();
    }
  }
}

export { logger };
