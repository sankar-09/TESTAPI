    import express, { Request, Response, Application } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";

export default class JobsController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/jobs", this.router);
    // Endpoints:
    this.router.get("/job", this.getAllJobs.bind(this));
    this.router.get("/jobbyid", this.getJobById.bind(this));
    this.router.put("/job", this.updateJob.bind(this));
    this.router.post("/job", this.createJob.bind(this));
  }

  // Create Job Endpoint
  async createJob(req: Request, res: Response): Promise<void> {
    const apiName = "job/create";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection: any;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Duplicate check: Ensure that a job with the same COMP_NM and DESCRIPTION does not exist.
      const dupQuery = `SELECT COUNT(COMP_NM) as count FROM JOBS WHERE COMP_NM = ? AND JOB_TITLE = ?`;
      const dupResult = await executeDbQuery(dupQuery, [input.COMP_NM, input.JOB_TITLE], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 0, result: "Job already exists." });

        return;
      }

      // Generate new JOB_ID (e.g., JOB001, JOB002, etc.)
      const idResult = await executeDbQuery( `SELECT MAX(CAST(SUBSTRING(JOB_ID, 4) AS UNSIGNED)) AS maxId FROM JOBS`,
        [], false, apiName, port, connection );
      const newId = "JOB" + String((Number(idResult[0]?.maxId || 0) + 1)).padStart(3, "0");

      // Upload image; if no image is provided, uploadImage returns an empty string.
      const image_url = await uploadImage(input.IMAGE_URL);

      // Insert the new job record into the JOBS table.
      const insertQuery = ` INSERT INTO JOBS ( CITY_ID, JOB_ID,DESCRIPTION, JOB_TITLE,  JOB_TYPE, EXPERIENCE, SKILLS, LAST_DATE, COMP_NM, MOBILE, EMAIL, WEBSITE, PACKAGE, COMP_ADDRESS, APPLY_THROUGH, STATUS, IMAGE_URL, CREATED_BY ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) `;
      const params = [ input.CITY_ID, newId, input.DESCRIPTION, input.JOB_TITLE, input.JOB_TYPE, input.EXPERIENCE, input.SKILLS, input.LAST_DATE, input.COMP_NM, input.MOBILE, input.EMAIL, input.WEBSITE, input.PACKAGE, input.COMP_ADDRESS, input.APPLY_THROUGH, input.STATUS, image_url, userId];
      const insertResult = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      const results = {message: "Job created", jobId: newId, affectedRows: insertResult.affectedRows};
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  // Get All Jobs Endpoint
  async getAllJobs(req: Request, res: Response): Promise<void> {
    const apiName = "job/read-all";
    const port = req.socket.localPort!;
    const query = ` SELECT CITY_ID, JOB_ID, JOB_TITLE, DESCRIPTION, JOB_TYPE, EXPERIENCE, SKILLS, LAST_DATE, COMP_NM, MOBILE, EMAIL, WEBSITE, PACKAGE, COMP_ADDRESS, APPLY_THROUGH, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM JOBS `;
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // Get Job by ID Endpoint
  async getJobById(req: Request, res: Response): Promise<void> {
    const apiName = "job/read";   
    const port = req.socket.localPort!;
    const jobId = req.query.id || "";
    const query = ` SELECT CITY_ID, JOB_ID, JOB_TITLE, DESCRIPTION, JOB_TYPE, EXPERIENCE, SKILLS, LAST_DATE, COMP_NM, MOBILE, EMAIL, WEBSITE, PACKAGE, COMP_ADDRESS, APPLY_THROUGH, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM JOBS WHERE JOB_ID = ? `;
    try {
      const rows = await executeDbQuery(query, [jobId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // Update Job Endpoint
  async updateJob(req: Request, res: Response): Promise<void> {
    const apiName = "job/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection: any;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Upload image.
      const image_url = await uploadImage(input.IMAGE_URL);
      // Update the job record.
      const updateQuery = ` UPDATE JOBS SET CITY_ID = ?, JOB_TITLE=?, DESCRIPTION = ?, JOB_TYPE = ?, EXPERIENCE = ?, SKILLS = ?, LAST_DATE = ?, COMP_NM = ?, MOBILE = ?, EMAIL = ?, WEBSITE = ?, PACKAGE = ?, COMP_ADDRESS = ?, APPLY_THROUGH = ?, STATUS = ?, IMAGE_URL = ?, EDITED_BY = ? WHERE JOB_ID = ? `;
      const params = [ input.CITY_ID, input.JOB_TITLE, input.DESCRIPTION, input.JOB_TYPE, input.EXPERIENCE, input.SKILLS, input.LAST_DATE, input.COMP_NM, input.MOBILE, input.EMAIL, input.WEBSITE, input.PACKAGE, input.COMP_ADDRESS, input.APPLY_THROUGH, input.STATUS, image_url, userId, input.JOB_ID, ];
      await executeDbQuery(updateQuery, params, true, apiName, port, connection);
      await connection.commit();
      const results = {message: "Job updated"};
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }
}
