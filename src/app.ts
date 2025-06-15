import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http, { Server as HttpServer } from "http";
import httpProxy from "http-proxy";
import { logger } from "./db"; // Import the centralized logger
import UserController from "./controllers/user";
import ServiceController from "./controllers/service";
import NewsFeedController from "./controllers/newsFeed";
import JobsController from "./controllers/jobs";
import NearLocationController from "./controllers/locform";
import MobileAppServices from "./controllers/mobileAppServices";
import AdsController from "./controllers/ad";

interface ServerInfo {
  url: string;
  server: HttpServer;
  healthy: boolean;
}

const app = express();
app.use(express.json({ limit: "50mb" }));

// Register your controllers/routes
new UserController(app);
new ServiceController(app);
new NewsFeedController(app);
new JobsController(app);
new NearLocationController(app);
new MobileAppServices(app);
new AdsController(app);

// Add a basic health check endpoint for each instance
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ------------------------------------------------------------------
// LOAD BALANCER SETUP WITH HEALTH CHECKS
// ------------------------------------------------------------------
const numOfServers = 15;
const servers: ServerInfo[] = [];
let cur = 0;

// Start multiple server instances
function loadServers(count: number, appInstance: express.Express) {
  for (let i = 0; i < count; i++) {
    const server = appInstance.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const url = `http://localhost:${addr.port}`;
        servers.push({ url, server, healthy: true });
        logger.info(`Worker ${i} listening on port ${addr.port}`);
      }
    });

    // Setup graceful shutdown for each server instance
    const shutdown = () => {
      logger.info(`Shutting down server on ${server.address()}`);
      server.close();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}

loadServers(numOfServers, app);

// Health check function for server instances
function checkHealthStatus() {
  servers.forEach((serverInfo) => {
    http
      .get(`${serverInfo.url}/health`, (res) => {
        const { statusCode } = res;
        serverInfo.healthy = statusCode === 200;
      })
      .on("error", () => {
        serverInfo.healthy = false;
      });
  });
}

// Run the health check every 5 seconds
setInterval(checkHealthStatus, 5000);

// Create a proxy server
const proxy = httpProxy.createProxyServer({ secure: false });
const loadBalancerPort = 3000;

const lbServer = http.createServer((req, res) => {
  // Filter healthy servers only
  const healthyServers = servers.filter((srv) => srv.healthy);
  if (healthyServers.length === 0) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    return res.end("No servers available");
  }

  const start = Date.now();

  // Use round-robin scheduling among healthy servers
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
    logger.info(`${req.method} ${req.url} completed in ${Date.now() - start}ms`);
  });
});

lbServer.listen(loadBalancerPort, () => {
  logger.info(`Load balancer listening on port ${loadBalancerPort}`);
});

// Graceful shutdown for the load balancer itself
const shutdownLoadBalancer = () => {
  logger.info("Shutting down load balancer");
  lbServer.close();
  servers.forEach((srv) => srv.server.close());
  process.exit(0);
};

process.on("SIGTERM", shutdownLoadBalancer);
process.on("SIGINT", shutdownLoadBalancer);
