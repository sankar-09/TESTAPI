import express from "express";
import http from "http";
import httpProxy from "http-proxy";
import { logger } from "./db"; // Import the centralized logger
import UserController from "./controllers/user";
import ServiceController from "./controllers/service";
import NewsFeedController from "./controllers/newsFeed";
import JobsController from "./controllers/jobs";
import NearLocationController from "./controllers/locform";
import MobileAppServices from "./controllers/mobileAppServices";
import AdsController from "./controllers/ad";

const app = express();
app.use(express.json({ limit: '50mb' }));
new UserController(app);
new ServiceController(app);
new NewsFeedController(app);
new JobsController(app);
new NearLocationController(app);
new MobileAppServices(app);
new AdsController(app);
// ------------------------------------------------------------------
// LOAD BALANCER SETUP
// ------------------------------------------------------------------

const numOfServers = 15;
const servers: string[] = [];
let cur = 0;

function loadServers(count: number, appInstance: express.Express) {
  for (let i = 0; i < count; i++) {
    const server = appInstance.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const url = `http://localhost:${addr.port}`;
        servers.push(url);
        logger.info(`Worker ${i} listening on port ${addr.port}`);
      }
    });
  }
}

loadServers(numOfServers, app);

const proxy = httpProxy.createProxyServer({ secure: false });
const loadBalancerPort = 3000;

const lbServer = http.createServer((req, res) => {
  if (servers.length === 0) {
    res.writeHead(503);
    return res.end("No servers available");
  }

  const start = Date.now();
  const target = servers[cur];
  cur = (cur + 1) % servers.length;

  logger.info(`Routing request to ${target}`);

  proxy.web(
    req,
    res,
    { target },
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
