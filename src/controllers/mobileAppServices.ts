import express, { Request, Response, Application } from "express";
import { uploadImage } from "../utils/cloudinaryUtil";
import { promises } from "dns";
import { executeDbQuery, pool } from "../db";
import  jwt  from "jsonwebtoken";
import { sendEmail } from "../utils/emailservice";

const secretKey = process.env.ACCESS_TOKEN_KEY || 'Y6u$3vZq!7LqFg#29xVrE!8TmQpLuR1C';
const secretKeyRefresh = process.env.REFRESH_TOKEN_KEY || 'J9p@WmZx*3BtRh$12qNsTy^Xz7KvOc5D';

export default class MobileAppServices {
  public router = express.Router();

   constructor(app: Application) {
    app.use("/app", this.router);

    this.router.get("/newsfeeds", this.getFeed.bind(this));
    this.router.get("/cielednewsfeeds", this.getcieledFeed.bind(this));
    this.router.get("/service", this.getServices.bind(this));
    this.router.get("/subservice", this.getSubServices.bind(this));
    this.router.get("/jobs", this.getJobs.bind(this));
    this.router.get("/jobsByid", this.getJobsByid.bind(this));
    this.router.get("/bussinessprofiles", this.getbussinessProfiles.bind(this));
    this.router.get("/bussinessprofilesBySearch", this.getbussinessProfilesBySearch.bind(this));
    this.router.get("/bussinessprofilesByid", this.getbussinessProfilesByid.bind(this));
    this.router.post("/users", this.createUser.bind(this));
    this.router.post("/login", this.Login.bind(this));
    this.router.put("/resetpass", this.resetPass.bind(this));

  }


    async createUser(req: Request, res: Response) {
      const apiName = "App/createUser";
      const port: number = req.socket.localPort!;
      const userId = req.headers["userid"] || "";
      const input = req.body;
      let connection;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check for duplicate employee (by EMAIL and MOBILE_NUMBER)
        const checkDup = `SELECT COUNT(EMAIL) as count FROM SECURITY_LOGIN WHERE EMAIL = ?`;
        const dupResult = await executeDbQuery(checkDup, [input.EMAIL], false, apiName, port, connection);
        if (Number(dupResult[0]?.count) > 0) {
          await connection.rollback();
          res.json({ status: 2, result: "User already exists." });
          return;
        }

        // Generate new Login ID
        await executeDbQuery("CALL GenerateLoginId(@id)", [], false, apiName, port, connection);
        const idRows = await executeDbQuery("SELECT @id as LoginId", [], false, apiName, port, connection);
        const LoginId = idRows[0]?.LoginId;

        const insertQuery = `INSERT INTO SECURITY_LOGIN (CITY_ID, USER_ID, USERNAME, EMAIL, PASSWORD, LOCATION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = ['101', LoginId, input.NAME, input.EMAIL, input.PASSWORD, input.LOCATION, 'A', userId ];
        const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
        await connection.commit();
        res.json({ status: 0, result: { message: "User created", LoginId: LoginId, affectedRows: result.affectedRows, },
        });
      } catch (err: any) {
        if (connection) await connection.rollback();
        res.json({ status: 1, result: err.toString() });
      } finally {
        if (connection) connection.release();
      }
    }

    async Login(Request: Request, Response: Response) {
        const apiName = "App/Login";
        // console.log(secretKey);
        let input = Request.body;
        try {
          let query = `SELECT USER_ID ID, USERNAME USER_NAME, EMAIL MAIL_ID FROM SECURITY_LOGIN WHERE EMAIL=? AND PASSWORD=? AND STATUS='A'`;
          const params = [input.email, input.password];
    
          const result = await executeDbQuery(query, params, false, apiName);
          if (result.length >= 1) {
            Response.json({ status: 0, result: { message: "Login Success", results: result } });
          } else {
            Response.json({ status: 2, result: { message: "user not found" } });
          }
        } catch (err: any) {
          Response.json({ status: 1, result: err.toString() });
        }
      }

    async resetPass(req: Request, res: Response) {
    const apiName = "App/resetpass";
    const port: number = req.socket.localPort!;
    let input=req.body;
    const userId = req.headers["userid"] || "";
    let connection: any;
    connection = await pool.getConnection();
      await connection.beginTransaction();

      const chekdup = `SELECT COUNT(USER_ID) as count FROM SECURITY_LOGIN WHERE USER_ID = ?`;
          const dupResult = await executeDbQuery(chekdup, [userId], false, apiName, port, connection);
          if (Number(dupResult[0]?.count) == 0) {
              await connection.rollback();
              res.json({ status: 2, result: "Invalid User." });
              return;
          }

    const updateQuery = "UPDATE SECURITY_LOGIN SET PASSWORD = ? WHERE USER_ID = ?";
    const params = [ input.NEW_PASSWORD, userId ];
    try {
      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = {message: "Password updated"}
      res.json({ status: 0, result:results });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

    async getFeed(req: Request, res: Response) {
      const apiName = "App/newsfeed";
      const port = req.socket.localPort!;
      const query = `SELECT FEED_ID ID, FEED_HEAD TITLE, FEED_MATTER DESCRIPTION, IMAGE_URL FEED_IMAGE FROM NEWS_FEED WHERE STATUS='A' ORDER BY CREATED_ON DESC`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getcieledFeed(req: Request, res: Response) {
      const apiName = "App/Cielednewsfeed";
      const port = req.socket.localPort!;
      const query = `SELECT CEILING(ROW_NUMBER() OVER (ORDER BY FEED_ID) * 1.0 / 15) AS SECTION, FEED_ID AS ID, FEED_HEAD AS NAME, FEED_MATTER AS DESCRIPTION, IMAGE_URL AS FEED_IMAGE FROM  NEWS_FEED WHERE STATUS = 'A' ORDER BY CREATED_ON DESC`;
  
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
      const query = `SELECT ID, NAME SERVICE_NAME, IMAGE_URL SERVICE_IMAGE FROM SERVICES WHERE STATUS='A' ORDER BY NAME`;
  
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
      const query = `SELECT SUB_SERVICE_ID ID, NAME SUB_SERVICE_NAME, IMAGE_URL SUB_SERVICE_IMAGE FROM SUB_SERVICES WHERE STATUS='A' AND SERVICE_ID = ? ORDER BY NAME`;
  
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
      const query = `SELECT JOB_ID ID, JOB_TITLE TITLE, EXPERIENCE, JOB_TYPE TYPE, IMAGE_URL JOB_IMAGE FROM JOBS WHERE STATUS='A' ORDER BY CREATED_ON DESC`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getJobsByid(req: Request, res: Response) {
      const apiName = "App/getJobsByid";
      const port = req.socket.localPort!;
      const JobId = req.query.id || "";
      const query = `SELECT JOB_ID ID, JOB_TITLE TITLE, PACKAGE SALARY_PACKAGE, EXPERIENCE, JOB_TYPE TYPE, DESCRIPTION JOB_DESCRIPTION, IMAGE_URL JOB_IMAGE FROM JOBS WHERE STATUS='A' AND JOB_ID=? ORDER BY CREATED_ON DESC`;
  
      try {
        const rows = await executeDbQuery(query, [JobId], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getbussinessProfiles(req: Request, res: Response) {
      const apiName = "App/BussinessProfile";
      const port = req.socket.localPort!;
      const query = `SELECT BUSINESS_ID ID, BUSINESS_NAME NAME, ADDRESS BUSSINESS_ADDRESS, IMAGE_URL1 BUSSINESS_IMAGE FROM BUSSINESS_PROFILE WHERE STATUS='A' ORDER BY BUSINESS_NAME`;
  
      try {
        const rows = await executeDbQuery(query, [], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getbussinessProfilesByid(req: Request, res: Response) {
      const apiName = "App/BussinessProfileById";
      const port = req.socket.localPort!;
      const BusinessId = req.query.id || "";
      const query = `SELECT BUSINESS_ID ID, BUSINESS_NAME NAME, BUSINESS_TYPE TYPE, ADDRESS BUSSINESS_ADDRESS, IMAGE_URL1 BUSSINESS_IMAGE, WEEKDAY_TIMINGS TIMINGS, DEFAULT_CONTACT CONTACT FROM BUSSINESS_PROFILE WHERE STATUS='A' AND BUSINESS_ID=? ORDER BY BUSINESS_NAME `;
  
      try {
        const rows = await executeDbQuery(query, [BusinessId], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }

    async getbussinessProfilesBySearch(req: Request, res: Response) {
      const apiName = "App/BussinessProfileBySearch";
      const port = req.socket.localPort!;
      const SearchBy = req.query.q ? String(req.query.q) : "";
      let query = `SELECT BUSINESS_ID ID, BUSINESS_NAME NAME, BUSINESS_TYPE TYPE, ADDRESS BUSSINESS_ADDRESS, IMAGE_URL1 BUSSINESS_IMAGE FROM BUSSINESS_PROFILE WHERE STATUS='A' LIMIT 15`;
  
        if (SearchBy) {
          query += ` AND BUSINESS_NAME LIKE '%${SearchBy}%' ORDER BY BUSINESS_NAME`;
        }

      try {
        const rows = await executeDbQuery(query, [SearchBy], false, apiName, port);
        res.json({ status: 0, result: rows });
      } catch (err: any) {
        res.json({ status: 1, result: err.toString() });
      }
    }
}