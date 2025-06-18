import express, { Request, Response, Application } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";

export default class NearLocationController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/near", this.router);

    this.router.get("/locations", this.getAllLocations.bind(this));
    this.router.get("/locationbyid", this.getLocationById.bind(this));
    this.router.post("/locations", this.createLocation.bind(this));
    this.router.put("/locations", this.updateLocation.bind(this));
  }

  async createLocation(req: Request, res: Response) {
    const apiName = "nearlocation/create";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const checkDup = `SELECT COUNT(LOCAT_NAME) AS count FROM NEAR_LOCATION WHERE LOCAT_NAME = ? AND OVERVIEW = ?`;
      const dupResult = await executeDbQuery(checkDup, [input.LOCAT_NAME, input.OVERVIEW], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Location already exists." });
        return;
      }

      const result = await executeDbQuery("SELECT MAX(CAST(SUBSTRING(LOCAT_ID, 6) AS UNSIGNED)) AS maxId FROM NEAR_LOCATION", [], false, apiName, port, connection);
      const newId = "LOCAT" + String((Number(result[0]?.maxId || 0) + 1)).padStart(3, "0");

      // Upload all images
      const images = [];
      for (let i = 1; i <= 10; i++) {
        const url = input[`IMAGE_URL${i}`];
        images.push(url ? await uploadImage(url) : "");
      }

      const insertQuery = `INSERT INTO NEAR_LOCATION (CITY_ID, LOCAT_ID, LOCAT_NAME, OVERVIEW, BEST_TIME, ATTRACTIONS, ACCESSIBILITY, IMAGE_URL1, IMAGE_URL2, IMAGE_URL3, IMAGE_URL4, IMAGE_URL5, IMAGE_URL6, IMAGE_URL7, IMAGE_URL8, IMAGE_URL9, IMAGE_URL10, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [ input.CITY_ID || "001", newId, input.LOCAT_NAME, input.OVERVIEW, input.BEST_TIME, input.ATTRACTIONS, input.ACCESSIBILITY, images[0], images[1], images[2], images[3], images[4], images[5], images[6], images[7], images[8], images[9], "A", userId ];

      const insertResult = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();

      const results = { message: "Location created", locationId: newId, affectedRows: insertResult.affectedRows };
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllLocations(req: Request, res: Response) {
    const apiName = "nearlocation/read-all";
    const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, LOCAT_ID, LOCAT_NAME, OVERVIEW, BEST_TIME, ATTRACTIONS, ACCESSIBILITY, IMAGE_URL1, IMAGE_URL2, IMAGE_URL3, IMAGE_URL4, IMAGE_URL5, IMAGE_URL6, IMAGE_URL7, IMAGE_URL8, IMAGE_URL9, IMAGE_URL10, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM NEAR_LOCATION`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getLocationById(req: Request, res: Response) {
    const apiName = "nearlocation/read";
    const port = req.socket.localPort!;
    const locatId = req.query.id || "";
    const query = `SELECT CITY_ID, LOCAT_ID, LOCAT_NAME, OVERVIEW, BEST_TIME, ATTRACTIONS, ACCESSIBILITY, IMAGE_URL1, IMAGE_URL2, IMAGE_URL3, IMAGE_URL4, IMAGE_URL5, IMAGE_URL6, IMAGE_URL7, IMAGE_URL8, IMAGE_URL9, IMAGE_URL10, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM NEAR_LOCATION WHERE LOCAT_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [locatId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateLocation(req: Request, res: Response) {
    const apiName = "nearlocation/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Upload all images
      const images = [];
      for (let i = 1; i <= 10; i++) {
        const url = input[`IMAGE_URL${i}`];
        images.push(url ? await uploadImage(url) : null);
      }

      const updateQuery = `UPDATE NEAR_LOCATION SET CITY_ID = ?, LOCAT_NAME = ?, OVERVIEW = ?, BEST_TIME = ?, ATTRACTIONS = ?, ACCESSIBILITY = ?, IMAGE_URL1 = ?, IMAGE_URL2 = ?, IMAGE_URL3 = ?, IMAGE_URL4 = ?, IMAGE_URL5 = ?, IMAGE_URL6 = ?, IMAGE_URL7 = ?, IMAGE_URL8 = ?, IMAGE_URL9 = ?, IMAGE_URL10 = ?, EDITED_BY = ? WHERE LOCAT_ID = ?`;
      const params = [ input.CITY_ID || "001", input.LOCAT_NAME, input.OVERVIEW, input.BEST_TIME, input.ATTRACTIONS, input.ACCESSIBILITY, images[0], images[1], images[2], images[3], images[4], images[5], images[6], images[7], images[8], images[9], userId, input.LOCAT_ID ];

      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = { message: "Location updated" };
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }
}
