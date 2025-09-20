import express, { Request, Response, Application } from "express";
import { uploadImage } from "../utils/cloudinaryUtil";
import { promises } from "dns";
import { executeDbQuery, pool } from "../db";
import jwt from "jsonwebtoken";
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
    this.router.get("/locations", this.getLocations.bind(this));
    this.router.get("/locationByid", this.getLocationByid.bind(this));


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
      const dupdata = await executeDbQuery(checkDup, [input.EMAIL], false, apiName, port, connection);
      if (Number(dupdata[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, data: "User already exists." });
        return;
      }

      // Generate new Login ID
      await executeDbQuery("CALL GenerateLoginId(@id)", [], false, apiName, port, connection);
      const idRows = await executeDbQuery("SELECT @id as LoginId", [], false, apiName, port, connection);
      const LoginId = idRows[0]?.LoginId;

      const insertQuery = `INSERT INTO SECURITY_LOGIN (CITY_ID, USER_ID, USERNAME, EMAIL, PASSWORD, LOCATION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = ['101', LoginId, input.NAME, input.EMAIL, input.PASSWORD, input.LOCATION, 'A', userId];
      const data = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      res.json({
        status: 0, data: { message: "User created", LoginId: LoginId, affectedRows: data.affectedRows, },
      });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, data: err.toString() });
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
      Response.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
    }
  }

  async getJobsN(req: Request, res: Response) {
    const apiName = "App/JobsNew";
    const port = req.socket.localPort!;
    const query = `SELECT JOB_ID AS id, JOB_TITLE AS title, JOB_TYPE AS type, IMAGE_URL AS imageUrl, 'Just Now' postedAt, 'true' isSaved FROM JOBS WHERE HIRING_TYPE='N' ORDER BY CREATED_ON DESC`;
    
    const query1 = `SELECT JOB_ID AS id, JOB_TITLE AS title, JOB_TYPE AS type, IMAGE_URL AS imageUrl, 'Just Now' postedAt, 'true' isSaved FROM JOBS WHERE HIRING_TYPE='Q' ORDER BY CREATED_ON DESC`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      const rows1 = await executeDbQuery(query1, [], false, apiName, port);

      res.json({ status: 0, quickRequirements:rows1, newHiring: rows });
    } catch (err: any) {
      res.json({ status: 1, data: err.toString() });
    }
  }

  async getJobsByid(req: Request, res: Response) {
    const apiName = "App/getJobsByid";
    const port = req.socket.localPort!;
    const JobId =req.params.id || req.query.id || "";
    const query = `SELECT JOB_ID id, JOB_TITLE title, PACKAGE package, EXPERIENCE experience, JOB_TYPE jobType, DESCRIPTION description, IMAGE_URL imageUrl FROM JOBS WHERE STATUS='A' AND JOB_ID=?`;

    try {
      const rows = await executeDbQuery(query, [JobId], false, apiName, port);
      res.json({ status: 0, data: rows });
    } catch (err: any) {
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
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
      res.json({ status: 1, data: err.toString() });
    }
  }
}