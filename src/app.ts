import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http, { Server as HttpServer } from "http";
import httpProxy from "http-proxy";
import { logger } from "./db"; // Your centralized logger
import UserController from "./controllers/user";
import ServiceController from "./controllers/service";
import NewsFeedController from "./controllers/newsFeed";
import JobsController from "./controllers/jobs";
import NearLocationController from "./controllers/locform";
import MobileAppServices from "./controllers/mobileAppServices";
import AdsController from "./controllers/ad";

// Increase max listeners if needed
process.setMaxListeners(20);

interface ServerInfo {
  url: string;
  server: HttpServer;
  healthy: boolean;
}

const app = express();
app.use(express.json({ limit: "50mb" }));

// Register controllers/routes
new UserController(app);
new ServiceController(app);
new NewsFeedController(app);
new JobsController(app);
new NearLocationController(app);
new MobileAppServices(app);
new AdsController(app);

// Basic health check endpoint (for worker servers)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ------------------------------------------------------------------
// LOAD BALANCER SETUP WITH HEALTH CHECKS
// ------------------------------------------------------------------
const numOfServers = 15;
const servers: ServerInfo[] = [];
let cur = 0;

// Start multiple server instances (workers)
// Each worker listens on an ephemeral port.
function loadServers(count: number, appInstance: express.Express) {
  for (let i = 0; i < count; i++) {
    const server = appInstance.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const url = `http://localhost:${addr.port}`;
        servers.push({ url, server, healthy: false });
        logger.info(`Worker ${i} listening on port ${addr.port}`);
      }
    });
  }
}

loadServers(numOfServers, app);

// Health check function: pings each worker's /health endpoint.
function checkHealthStatus() {
  servers.forEach((serverInfo, index) => {
    http
      .get(`${serverInfo.url}/health`, (res) => {
        if (res.statusCode === 200) {
          if (!serverInfo.healthy) {
            logger.info(`Worker at ${serverInfo.url} is now healthy.`);
          }
          serverInfo.healthy = true;
        } else {
          logger.warn(`Worker at ${serverInfo.url} returned status code ${res.statusCode}`);
          serverInfo.healthy = false;
        }
      })
      .on("error", (err) => {
        logger.error(`Health check failed for ${serverInfo.url}: ${err.message}`);
        serverInfo.healthy = false;
      });
  });
}
setInterval(checkHealthStatus, 5000); // Run health check every 5 seconds

// Create a proxy server to forward requests to workers.
const proxy = httpProxy.createProxyServer({ secure: false });
const loadBalancerPort = 3000;

const lbServer = http.createServer((req, res) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`);
  
  // Filter out healthy servers.
  const healthyServers = servers.filter((srv) => srv.healthy);
  
  if (healthyServers.length === 0) {
    logger.error("No healthy servers available. Returning 503.");
    res.writeHead(503, { "Content-Type": "text/plain" });
    return res.end("No servers available");
  }

  // Use round-robin based on healthy servers.
  const targetInfo = healthyServers[cur % healthyServers.length];
  cur++;

  logger.info(`Routing request to ${targetInfo.url}`);
  proxy.web(
    req,
    res,
    { target: targetInfo.url },
    (err: any) => {
      logger.error("Proxy error: " + err.toString());
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Something went wrong.");
    }
  );

  res.on("finish", () => {
    logger.info(`${req.method} ${req.url} completed`);
  });
});

lbServer.listen(loadBalancerPort, () => {
  logger.info(`Load balancer listening on port ${loadBalancerPort}`);
});

// ------------------------------------------------------------------
// Global graceful shutdown: Closes load balancer and all worker servers.
const shutdownAllServers = () => {
  logger.info("Shutting down load balancer");
  lbServer.close();

  logger.info("Shutting down all worker servers");
  servers.forEach((serverInfo) => {
    if (serverInfo.server.listening) {
      serverInfo.server.close(() => {
        logger.info(`Server at ${serverInfo.url} closed`);
      });
    }
  });

  // Allow some time for cleanup, then exit.
  setTimeout(() => process.exit(0), 3000);
};

process.on("SIGTERM", shutdownAllServers);
process.on("SIGINT", shutdownAllServers);
