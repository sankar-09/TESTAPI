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

const numOfServers = 15;
const servers: ServerInfo[] = [];
let cur = 0;

// -------------------------------------------
// ✅ Factory function to create app with routes
// -------------------------------------------
function createAppWithRoutes(): express.Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Register controllers on this app instance
  new UserController(app);
  new ServiceController(app);
  new NewsFeedController(app);
  new JobsController(app);
  new NearLocationController(app);
  new MobileAppServices(app);
  new AdsController(app);

  // Health endpoint for worker
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  return app;
}

// -------------------------------------------
// 🏃 Start multiple worker servers
// -------------------------------------------
function loadServers(count: number) {
  for (let i = 0; i < count; i++) {
    const appInstance = createAppWithRoutes();
    const server = appInstance.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const url = `http://localhost:${addr.port}`;
        servers.push({ url, server, healthy: false });
        logger.info(`✅ Worker ${i} listening on port ${addr.port}`);
      }
    });
  }
}

loadServers(numOfServers);

// -------------------------------------------
// 🔁 Health check every 5 sec for each worker
// -------------------------------------------
function checkHealthStatus() {
  servers.forEach((serverInfo) => {
    http
      .get(`${serverInfo.url}/health`, (res) => {
        if (res.statusCode === 200) {
          if (!serverInfo.healthy) {
            logger.info(`✅ Worker at ${serverInfo.url} is now healthy.`);
          }
          serverInfo.healthy = true;
        } else {
          logger.warn(`⚠️ Worker at ${serverInfo.url} returned status ${res.statusCode}`);
          serverInfo.healthy = false;
        }
      })
      .on("error", (err) => {
        logger.error(`❌ Health check failed for ${serverInfo.url}: ${err.message}`);
        serverInfo.healthy = false;
      });
  });
}
setInterval(checkHealthStatus, 5000);

// -------------------------------------------
// 🔀 Load Balancer
// -------------------------------------------
const proxy = httpProxy.createProxyServer({ secure: false });
const loadBalancerPort = 3000;

const lbServer = http.createServer((req, res) => {
  logger.info(`➡️  Incoming request: ${req.method} ${req.url}`);

  const healthyServers = servers.filter((srv) => srv.healthy);
  if (healthyServers.length === 0) {
    logger.error("❌ No healthy servers available. Returning 503.");
    res.writeHead(503, { "Content-Type": "text/plain" });
    return res.end("No servers available");
  }

  const targetInfo = healthyServers[cur % healthyServers.length];
  cur++;

  logger.info(`🔁 Routing request to ${targetInfo.url}`);
  proxy.web(req, res, { target: targetInfo.url }, (err: any) => {
    logger.error("❌ Proxy error: " + err.toString());
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Something went wrong.");
  });

  res.on("finish", () => {
    logger.info(`✅ ${req.method} ${req.url} completed`);
  });
});

lbServer.listen(loadBalancerPort, () => {
  logger.info(`🚀 Load balancer listening on port ${loadBalancerPort}`);
});

// -------------------------------------------
// 🔌 Graceful Shutdown
// -------------------------------------------
const shutdownAllServers = () => {
  logger.info("🔻 Shutting down load balancer");
  lbServer.close();

  logger.info("🔻 Shutting down all worker servers");
  servers.forEach((serverInfo) => {
    if (serverInfo.server.listening) {
      serverInfo.server.close(() => {
        logger.info(`Server at ${serverInfo.url} closed`);
      });
    }
  });

  setTimeout(() => process.exit(0), 3000);
};

process.on("SIGTERM", shutdownAllServers);
process.on("SIGINT", shutdownAllServers);
