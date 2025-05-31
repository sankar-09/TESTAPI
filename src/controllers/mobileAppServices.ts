import express, { Request, Response, Application } from "express";
import { uploadImage } from "../utils/cloudinaryUtil";
import { promises } from "dns";
import { executeDbQuery } from "../db";

export default class MobileAppServices {
  public router = express.Router();

   constructor(app: Application) {
    app.use("/app", this.router);

    this.router.get("/newsfeeds", this.getFeed.bind(this));
    this.router.get("/service", this.getServices.bind(this));
    this.router.get("/subservice", this.getSubServices.bind(this));
    this.router.get("/jobs", this.getJobs.bind(this));
    this.router.get("/bussinessprofiles", this.getbussinessProfiles.bind(this));
  }

  async getFeed(req: Request, res: Response) {
      const apiName = "App/newsfeed";
      const port = req.socket.localPort!;
      const query = `SELECT FEED_ID, FEED_HEAD, FEED_MATTER, IMAGE_URL FROM NEWS_FEED WHERE STATUS='A' ORDER BY CREATED_ON`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getServices(req: Request, res: Response) {
      const apiName = "App/services";
      const port = req.socket.localPort!;
      const query = `SELECT ID, NAME, IMAGE_URL FROM SERVICES WHERE STATUS='A' ORDER BY NAME`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getSubServices(req: Request, res: Response) {
      const apiName = "App/SubServices";
      const port = req.socket.localPort!;
      const ServiceId = req.query.id || "";
      const query = `SELECT SUB_SERVICE_ID, NAME, IMAGE_URL FROM SUB_SERVICES WHERE STATUS='A' AND SERVICE_ID = ? ORDER BY NAME`;
  
      try {
        const rows = await executeDbQuery(query, [ServiceId], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getJobs(req: Request, res: Response) {
      const apiName = "App/Jobs";
      const port = req.socket.localPort!;
      const query = `SELECT JOB_ID, JOB_TITLE, EXPERIENCE, JOB_TYPE, IMAGE_URL FROM JOBS WHERE STATUS='A' ORDER BY CREATED_ON`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getbussinessProfiles(req: Request, res: Response) {
      const apiName = "App/BussinessProfile";
      const port = req.socket.localPort!;
      const query = `SELECT BUSINESS_ID, BUSINESS_NAME, ADDRESS, WEEKDAY_TIMINGS, DEFAULT_CONTACT, STATUS FROM BUSSINESS_PROFILE ORDER BY BUSINESS_NAME`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }
}