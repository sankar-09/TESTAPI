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
  maxSize: process.env.LOG_MAX_SIZE || "300m",  // Use lower-case if necessary, or "10240"
  maxFiles: process.env.LOG_MAX_FILES || "1d",
  zippedArchive: false,
  // Optionally, enable auditing to track rotations
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

// Query executor
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

    const [result] = await conn.execute(query, params);

    // Commit only if we started the transaction ourselves.
    if (localConnection && useTransaction) {
      await conn.commit();
    }

    logToFile({
      timestamp: new Date().toLocaleString(),
      apiName,
      queryExecuted: query,
      params,
      executionTime: Date.now() - start,
      resultCount: Array.isArray(result)
        ? result.length
        : (result as any).affectedRows,
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


// Export the logger for use in other parts of your application
export { logger };
