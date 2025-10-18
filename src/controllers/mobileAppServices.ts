import express, { Request, Response, Application } from "express";
import { uploadImage } from "../utils/cloudinaryUtil";
import { promises } from "dns";
import { executeDbQuery, pool } from "../db";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/emailservice";
import { randomBytes } from "crypto";
const crypto = require("crypto");

const secretKey = process.env.ACCESS_TOKEN_KEY || 'Y6u$3vZq!7LqFg#29xVrE!8TmQpLuR1C';
const secretKeyRefresh = process.env.REFRESH_TOKEN_KEY || 'J9p@WmZx*3BtRh$12qNsTy^Xz7KvOc5D';

export default class MobileAppServices {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/app", this.router);

    this.router.get("/newsfeeds", this.getFeed.bind(this));
    this.router.get("/cielednewsfeeds", this.getcieledFeed.bind(this));
    this.router.get("/service", this.getServices.bind(this));
    this.router.get("/services/:id/subservices", this.getSubServices.bind(this));
    this.router.get("/exploreServices", this.getExploreServices.bind(this));

    this.router.get("/subservice", this.getSubServices.bind(this)); // old 
    this.router.get("/jobs", this.getJobs.bind(this));
    this.router.get("/jobhirings", this.getJobsN.bind(this)); //New
    this.router.get("/jobsByid", this.getJobsByid.bind(this));
    this.router.get("/jobs/:id", this.getJobsByid.bind(this));
    this.router.get("/bussinessprofiles", this.getbussinessProfiles.bind(this));
    this.router.get("/bussinessprofilesBySearch", this.getbussinessProfilesBySearch.bind(this));
    this.router.get("/items/:id", this.getbussinessProfilesByid.bind(this));

    this.router.get("/bussinessprofilesByid", this.getbussinessProfilesByid.bind(this)); // old 
    this.router.get("/services/:id/items", this.getbussinessBySIids.bind(this));
    this.router.get("/services/:id/subServices/items", this.getbussinessBySid.bind(this));
    this.router.get("/services/:servId/subServices/:subServId/items", this.getbussinessByServSubId.bind(this));

    this.router.get("/bussinessprofilesByBSids", this.getbussinessByBSids.bind(this)); // old
    this.router.get("/adds", this.getAdds.bind(this));
    this.router.get("/addByid", this.getAddByid.bind(this));
    this.router.get("/nearLocations", this.getLocations.bind(this));
    this.router.get("/nearLocationByid", this.getLocationByid.bind(this));

    this.router.get("/signin/:mobileno", this.Signin.bind(this) as unknown as express.RequestHandler);
    this.router.get("/location", this.getUserLocation.bind(this));
    this.router.get("/user", this.getUserProfile.bind(this));
    this.router.post("/location", this.createUserLocation.bind(this));
    this.router.post("/signup", this.createUser.bind(this));
    this.router.post("/login", this.Login.bind(this));
    this.router.post("/mobileLogin", this.createMobileUser.bind(this));
    this.router.post("/mobileOtpVerify", this.loginVerifyOtp.bind(this));
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


      const mobileRegex = /^[6-9]\d{9}$/;
      if (!input.mobile || !mobileRegex.test(input.mobile)) {
        await connection.rollback();
        res.status(500).json({ status: 2, data: "Invalid mobile number format." });
        return;
      }

      const checkMobile = await executeDbQuery("SELECT COUNT(MOBILE) as count FROM SECURITY_LOGIN WHERE MOBILE = ?", [input.mobile], true, apiName, port, connection);

      if (Number(checkMobile[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, data: "Mobile number already exists." });
        return;
      }

      const idRows = await executeDbQuery("CALL GenerateLoginId(?)", ["MUSR"], true, apiName, port, connection);
      const LoginId = idRows[0][0].newId;

      const insertQuery = `INSERT INTO SECURITY_LOGIN (CITY_ID, USER_ID, USERNAME, EMAIL, MOBILE, LOCATION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = ['101', LoginId, input.name, input.email, input.mobile, input.location, 'A', userId];
      const data = await executeDbQuery(insertQuery, params, true, apiName, port, connection);
      await connection.commit();
      res.json({
        status: 0, data: { message: "User created", LoginId: LoginId, affectedRows: data.affectedRows, },
      });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.status(500).json({ status: 1, data: err.toString() });
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

      const data = await executeDbQuery(query, params, false, apiName);
      if (data.length >= 1) {
        Response.json({ status: 0, data: { message: "Login Success", datas: data } });
      } else {
        Response.json({ status: 2, data: { message: "user not found" } });
      }
    } catch (err: any) {
      Response.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async Signin(req: Request, res: Response) {
    const apiName = "App/Login";
    const { mobileno } = req.params;

    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobileno)) {
      return res.status(500).json({
        status: 1, data: {
          code: "AUTH_002",
          message: "Invalid mobile number format",
          details: "Mobile number must be exactly 10 digits.",
          timestamp: formatTimestamp(new Date()),
        },
      });

    }

    try {
      let query = `SELECT USER_ID AS userId, USERNAME AS userName, MOBILE AS mobile, EMAIL AS email FROM SECURITY_LOGIN WHERE STATUS = 'A' AND MOBILE = ?`;

      const rows = await executeDbQuery(query, [mobileno], false, apiName);

      if (rows.length === 0) {
        return res.status(500).json({
          status: 2, data: {
            code: "AUTH_001",
            message: "Mobile number not registered",
            details: "The provided mobile number is not associated with any existing account. Please create a new account to continue.",
            timestamp: formatTimestamp(new Date()),
          },
        });

      }

      const token = crypto.randomBytes(32).toString("hex");

      return res.json({
        status: 0,
        data: { token },
      });

    } catch (err: any) {
      return res.status(500).json({
        status: 1, data: {
          code: "AUTH_500",
          message: "Internal server error",
          details: err.toString(),
          timestamp: formatTimestamp(new Date()),
        },
      });
    }
  }

  async resetPass(req: Request, res: Response) {
    const apiName = "App/resetpass";
    const port: number = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";
    let connection: any;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const chekdup = `SELECT COUNT(USER_ID) as count FROM SECURITY_LOGIN WHERE USER_ID = ?`;
    const dupdata = await executeDbQuery(chekdup, [userId], false, apiName, port, connection);
    if (Number(dupdata[0]?.count) == 0) {
      await connection.rollback();
      res.json({ status: 2, data: "Invalid User." });
      return;
    }

    const updateQuery = "UPDATE SECURITY_LOGIN SET PASSWORD = ? WHERE USER_ID = ?";
    const params = [input.NEW_PASSWORD, userId];
    try {
      const data = await executeDbQuery(updateQuery, params, true, apiName, port);
      const datas = { message: "Password updated" }
      res.json({ status: 0, data: datas });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getFeed(req: Request, res: Response) {
    const apiName = "App/newsfeed";
    const port = req.socket.localPort!;
    const query = `SELECT FEED_ID id, FEED_HEAD tittle, FEED_MATTER description, IMAGE_URL imageUrl FROM NEWS_FEED WHERE STATUS='A' ORDER BY CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getcieledFeed(req: Request, res: Response) {
    const apiName = "App/Cielednewsfeed";
    const port = req.socket.localPort!;
    const query = `SELECT CEILING(ROW_NUMBER() OVER (ORDER BY FEED_ID) * 1.0 / 15) AS SECTION, FEED_ID AS ID, FEED_HEAD AS NAME, FEED_MATTER AS DESCRIPTION, IMAGE_URL AS FEED_IMAGE FROM  NEWS_FEED WHERE STATUS = 'A' ORDER BY CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getServices(req: Request, res: Response) {
    const apiName = "App/services";
    const port = req.socket.localPort!;
    const query = `SELECT ID id, NAME serviceName , IMAGE_URL imageUrl FROM SERVICES WHERE STATUS='A' ORDER BY NAME`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getSubServices(req: Request, res: Response) {
    const apiName = "App/SubServices";
    const port = req.socket.localPort!;
    const ServiceId = req.params.id || "";
    const query = `SELECT SUB_SERVICE_ID id, NAME subServiceName, IMAGE_URL imageUrl FROM SUB_SERVICES WHERE STATUS='A' AND SERVICE_ID = ? ORDER BY NAME`;

    try {
      const rows = await executeDbQuery(query, [ServiceId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getExploreServices(req: Request, res: Response) {
    const apiName = "App/ExploreServices";
    const port = req.socket.localPort!;
    const ServiceId = req.params.id || "";
    const query = `SELECT ID as id, NAME as serviceName, IMAGE_URL as imageUrl FROM SERVICES WHERE isExplored='true' ORDER BY CREATED_ON DESC LIMIT 8`;
    const query1 = `SELECT ID as id, NAME as serviceName, IMAGE_URL as imageUrl FROM SERVICES ORDER BY NAME ASC LIMIT 12`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      const rows1 = await executeDbQuery(query1, [], false, apiName, port);
      res.json({ status: 0, exploreServices: rows, services: rows1 });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getJobs(req: Request, res: Response) {
    const apiName = "App/Jobs";
    const port = req.socket.localPort!;
    const query = `SELECT JOB_ID id, JOB_TITLE title, EXPERIENCE experience, JOB_TYPE type, IMAGE_URL imageUrl  , false AS isSaved FROM JOBS WHERE STATUS='A' ORDER BY CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getJobsN(req: Request, res: Response) {
    const apiName = "App/JobsNew";
    const port = req.socket.localPort!;
    const query = `SELECT JOB_ID AS id, JOB_TITLE AS title, JOB_TYPE AS type, IMAGE_URL AS imageUrl, 'Just Now' postedAt, 'true' isSaved FROM JOBS ORDER BY CREATED_ON DESC`;

    const query1 = `SELECT JOB_ID AS id, JOB_TITLE AS title, JOB_TYPE AS type, IMAGE_URL AS imageUrl, 'Just Now' postedAt, 'true' isSaved FROM JOBS WHERE isQuickRequirement='true' ORDER BY CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      const rows1 = await executeDbQuery(query1, [], false, apiName, port);

      res.json({ status: 0, quickRequirements: rows1, newHiring: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getJobsByid(req: Request, res: Response) {
    const apiName = "App/getJobsByid";
    const port = req.socket.localPort!;
    const JobId = req.params.id || req.query.id || "";
    const query = `SELECT JOB_ID id, JOB_TITLE title, PACKAGE package, EXPERIENCE experience, JOB_TYPE jobType, DESCRIPTION description, IMAGE_URL imageUrl FROM JOBS WHERE STATUS='A' AND JOB_ID=?`;

    try {
      const rows = await executeDbQuery(query, [JobId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessProfiles(req: Request, res: Response) {
    const apiName = "App/BussinessProfile";
    const port = req.socket.localPort!;
    const query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, ADDRESS address, IMAGE_URL1 imageUrl FROM BUSSINESS_PROFILE WHERE STATUS='A' ORDER BY BUSINESS_NAME`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessBySid(req: Request, res: Response) {
    const apiName = "App/BussinessProfileByServiceId";
    const port = req.socket.localPort!;
    const ServiceId = req.params.id || "";
    const query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl, '2 km' distance FROM BUSSINESS_PROFILE WHERE STATUS='A'  AND SERVICE_ID=? `;

    try {
      const rows = await executeDbQuery(query, [ServiceId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessByServSubId(req: Request, res: Response) {
    const apiName = "App/BussinessProfileByServiceSubSevId";
    const port = req.socket.localPort!;
    const ServiceId = req.params.servId || "";
    const SubServiceID: any = req.params.subServId || "";
    let params = [];
    let query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl, '2 km' distance FROM BUSSINESS_PROFILE WHERE STATUS='A'  AND SERVICE_ID=? `;

    if (SubServiceID.length > 1) {
      query += `   AND SUB_SERVICE_ID=?`;
      params = [ServiceId, SubServiceID];
    } else {

      params = [ServiceId];
    }

    try {
      const rows = await executeDbQuery(query, params, false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessProfilesByid(req: Request, res: Response) {
    const apiName = "App/BussinessProfileById";
    const port = req.socket.localPort!;
    const BusinessId = req.params.id || "";
    const query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl, WEEKDAY_TIMINGS timings, DEFAULT_CONTACT mobile FROM BUSSINESS_PROFILE WHERE STATUS='A' AND BUSINESS_ID=? `;

    try {
      const rows = await executeDbQuery(query, [BusinessId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessByBSids(req: Request, res: Response) {
    const apiName = "App/BussinessByBSids";
    const port = req.socket.localPort!;
    const SubServiceID: any = req.query.SubServiceID || "";
    const ServiceId = req.query.ServiceId || "";
    let perams = [];
    let query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl, WEEKDAY_TIMINGS timings, DEFAULT_CONTACT mobile FROM BUSSINESS_PROFILE WHERE STATUS='A'  AND SERVICE_ID=? `;

    if (SubServiceID.length > 1) {
      query += `   AND SUB_SERVICE_ID=?`;
      perams = [ServiceId, SubServiceID];
    } else {

      perams = [ServiceId];
    }

    try {
      const rows = await executeDbQuery(query, perams, false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessBySIids(req: Request, res: Response) {
    const apiName = "App/BussinessBySIids";
    const port = req.socket.localPort!;
    const SubServiceID: any = req.query.subServiceid || "";
    const ServiceId = req.params.id || "";
    let perams = [];
    let query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl, WEEKDAY_TIMINGS timings, DEFAULT_CONTACT mobile FROM BUSSINESS_PROFILE WHERE STATUS='A'  AND SERVICE_ID=? `;

    if (SubServiceID.length > 1) {
      query += `   AND SUB_SERVICE_ID=?`;
      perams = [ServiceId, SubServiceID];
    } else {

      perams = [ServiceId];
    }

    try {
      const rows = await executeDbQuery(query, perams, false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getbussinessProfilesBySearch(req: Request, res: Response) {
    const apiName = "App/BussinessProfileBySearch";
    const port = req.socket.localPort!;
    const SearchBy = req.query.q ? String(req.query.q) : "";
    let query = `SELECT BUSINESS_ID id, BUSINESS_NAME name, BUSINESS_TYPE type, ADDRESS address, IMAGE_URL1 imageUrl FROM BUSSINESS_PROFILE WHERE STATUS='A' LIMIT 15`;

    if (SearchBy) {
      query += ` AND BUSINESS_NAME LIKE '%${SearchBy}%' ORDER BY BUSINESS_NAME`;
    }

    try {
      const rows = await executeDbQuery(query, [SearchBy], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getAdds(req: Request, res: Response) {
    const apiName = "App/Adds";
    const port = req.socket.localPort!;
    const query = `SELECT ID id, DESCRIPTION description, IMAGE_URL imageUrl FROM ADVERTISEMENTS WHERE STATUS='A' ORDER by CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getAddByid(req: Request, res: Response) {
    const apiName = "App/getAddByid";
    const port = req.socket.localPort!;
    const AddId = req.query.id || "";
    const query = `SELECT ID id, DESCRIPTION description, IMAGE_URL imageUrl FROM ADVERTISEMENTS WHERE STATUS='A' and id=?`;

    try {
      const rows = await executeDbQuery(query, [AddId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }
  async getLocations(req: Request, res: Response) {
    const apiName = "App/Locations";
    const port = req.socket.localPort!;
    const query = `SELECT LOCAT_ID id, LOCAT_NAME name, BEST_TIME bestTime, ATTRACTIONS attractions, ACCESSIBILITY accessibility, OVERVIEW overview, IMAGE_URL1 imageUrl1, IMAGE_URL2 imageUrl2, IMAGE_URL3 imageUrl3, IMAGE_URL4 imageUrl4, IMAGE_URL5 imageUrl5 FROM NEAR_LOCATION where STATUS='A' ORDER BY LOCAT_NAME ASC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getLocationByid(req: Request, res: Response) {
    const apiName = "App/getAddByid";
    const port = req.socket.localPort!;
    const LocateId = req.query.id || "";
    const query = `SELECT LOCAT_ID id, LOCAT_NAME name, BEST_TIME bestTime, ATTRACTIONS attractions, ACCESSIBILITY accessibility, OVERVIEW overview, IMAGE_URL1 imageUrl1, IMAGE_URL2 imageUrl2, IMAGE_URL3 imageUrl3, IMAGE_URL4 imageUrl4, IMAGE_URL5 imageUrl5 FROM NEAR_LOCATION where STATUS='A' and LOCAT_ID=?`;

    try {
      const rows = await executeDbQuery(query, [LocateId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async createMobileUser(req: Request, res: Response) {
    const apiName = "mobileUser/create";
    const port: number = req.socket.localPort!;
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // 1. Check if user exists in USERS
      const checkUser = `SELECT USER_ID FROM SECURITY_LOGIN WHERE MOBILE=? LIMIT 1`;
      const existingUser = await executeDbQuery(checkUser, [input.MOBILE_NUMBER], true, apiName, port, connection);

      let userId: string;

      if (existingUser.length > 0) {
        userId = existingUser[0].USER_ID;
      } else {
        // 2. Generate new userId
        const idRows = await executeDbQuery("CALL GenerateLoginId(?)", ["MUSR"], false, apiName, port, connection);
        userId = idRows[0][0].newId;

        // 3. Insert into USERS
        const insertUser = `INSERT INTO SECURITY_LOGIN (USER_ID, MOBILE, STATUS) VALUES (?, ?, 'A')`;
        await executeDbQuery(insertUser, [userId, input.MOBILE_NUMBER], true, apiName, port, connection);
      }

      // 4. Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // 5. Upsert into OTP_SERVICES
      const upsertQuery = `INSERT INTO OTP_SERVICES (USER_ID, MOBILE_NUMBER, OTP_CODE, OTP_CREATED_AT, STATUS) VALUES (?, ?, ?, NOW(), 'A') ON DUPLICATE KEY UPDATE OTP_CODE=VALUES(OTP_CODE), OTP_CREATED_AT=NOW(), OTP_USED_AT=NULL, UPDATED_ON=NOW()`;

      await executeDbQuery(upsertQuery, [userId, input.MOBILE_NUMBER, otp], true, apiName, port, connection);


      await connection.commit();

      // 6. Send OTP (pseudo)
      // await smsService.send(input.MOBILE_NUMBER, `Your OTP is ${otp}`);

      res.json({ status: 0, result: { message: "OTP sent", userId, OTP: otp } });

    } catch (err: any) {
      if (connection) await connection.rollback();
      res.status(500).json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async loginVerifyOtp(req: Request, res: Response) {
    const apiName = "otp/verify";
    const port: number = req.socket.localPort!;
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();

      const query = ` SELECT USER_ID FROM OTP_SERVICES WHERE MOBILE_NUMBER=? AND OTP_CODE=? AND OTP_USED_AT IS NULL AND OTP_CREATED_AT >= NOW() - INTERVAL 5 MINUTE LIMIT 1 `;
      const rows = await executeDbQuery(query, [input.MOBILE_NUMBER, input.OTP], true, apiName, port, connection);

      if (rows.length === 0) {
        res.json({ status: 2, result: "Invalid or expired OTP" });
        return;
      }

      // Mark OTP as used
      await executeDbQuery("UPDATE OTP_SERVICES SET OTP_USED_AT=NOW(), UPDATED_ON=NOW() WHERE MOBILE_NUMBER=?", [input.MOBILE_NUMBER], true, apiName, port, connection);

      res.json({ status: 0, result: { message: "Login successful", userId: rows[0].USER_ID } });

    } catch (err: any) {
      res.status(500).json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async createUserLocation(req: Request, res: Response) {
    const apiName = "userLocation/create";
    const port = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const checkDup = await executeDbQuery("SELECT COUNT(NAME) as count FROM LOCATIONS WHERE NAME = ?", [input.NAME], true, apiName, port, connection);

      if (Number(checkDup[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, data: "Location already exists." });
        return;
      }

      const locRows = await executeDbQuery("CALL GenerateLocationId('LOC')", [], true, apiName, port, connection);
      const newId = locRows[0][0].newLocationId;

      const insertQuery = "INSERT INTO LOCATIONS (ID, NAME, STATUS) VALUES (?, ?, ?)";
      const params = [newId, input.NAME, input.STATUS || "A"];

      const result = await executeDbQuery(insertQuery, params, true, apiName, port, connection);

      await connection.commit();

      res.json({ status: 0, data: { message: "Location created", locationId: newId, }, });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.status(500).json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getUserLocation(req: Request, res: Response) {
    const apiName = "userLocation/get";
    const port = req.socket.localPort!;
    const query = `SELECT ID id, NAME name from LOCATIONS where STATUS='A' ORDER by NAME`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }

  async getUserProfile(req: Request, res: Response) {
    const apiName = "userLocation/get";
    const port = req.socket.localPort!;
    const { id } = req.query;

    let query = ` SELECT USER_ID AS userId, USERNAME AS userName, MOBILE AS mobile, EMAIL AS email FROM SECURITY_LOGIN WHERE STATUS = 'A' `;
    const params: any[] = [];

    if (id) {
      query += " AND (MOBILE = ? OR USER_ID = ?)";
      params.push(id, id);
    }

    try {
      const rows = await executeDbQuery(query, params, false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, data: err.toString() });
    }
  }


}

export function formatTimestamp(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const yyyy = date.getFullYear();

  const HH = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${HH}:${min}`;
}