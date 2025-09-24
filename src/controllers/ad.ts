import express, { Application, Request, Response } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";

export default class AdsController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/ads", this.router);
    this.router.post("/ad", this.createAd.bind(this));
    this.router.get("/ad", this.getAllAds.bind(this));
    this.router.get("/adbyid", this.getAdById.bind(this));
    this.router.put("/ad", this.updateAd.bind(this));
  }

  async createAd(req: Request, res: Response): Promise<void> {
    const apiName = "ad/create";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Check duplicate (optional, based on description & date)
    //   const dupQuery = `SELECT COUNT(*) AS count FROM ADVERTISEMENTS WHERE DESCRIPTION = ? AND FROM_DATE = ? AND TO_DATE = ?`;
    //   const dupResult = await executeDbQuery(dupQuery, [input.DESCRIPTION, input.FROM_DATE, input.TO_DATE], false, apiName, port, connection);

    //   if (Number(dupResult[0]?.count) > 0) {
    //     await connection.rollback();
    //     res.json({ status: 0, result: "Ad already exists for this date and description." });
    //     return;
    //   }

      const imageUrl = await uploadImage(input.IMAGE_URL);

      const insertQuery = `
        INSERT INTO ADVERTISEMENTS (IMAGE_URL, DESCRIPTION, FROM_DATE, TO_DATE, STATUS, CREATED_BY)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = [imageUrl, input.DESCRIPTION, input.FROM_DATE, input.TO_DATE, input.STATUS, userId];

      const insertResult = await executeDbQuery(insertQuery, params, true, apiName, port, connection);
      await connection.commit();

      res.json({
        status: 0,
        result: {
          message: "Ad created",
          affectedRows: insertResult.affectedRows
        }
      });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllAds(req: Request, res: Response): Promise<void> {
    const apiName = "ad/read-all";
    const port = req.socket.localPort!;
    const query = `
      SELECT 
        ID, IMAGE_URL, DESCRIPTION, FROM_DATE, TO_DATE, STATUS, CREATED_BY,
        DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON,
        EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON
      FROM ADVERTISEMENTS
    `;
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getAdById(req: Request, res: Response): Promise<void> {
    const apiName = "ad/read-by-id";
    const port = req.socket.localPort!;
    const adId = req.query.id || "";
    const query = `
      SELECT 
        ID, IMAGE_URL, DESCRIPTION, FROM_DATE, TO_DATE, STATUS, CREATED_BY,
        DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON,
        EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON
      FROM ADVERTISEMENTS WHERE ID = ?
    `;
    try {
      const rows = await executeDbQuery(query, [adId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateAd(req: Request, res: Response): Promise<void> {
    const apiName = "ad/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const imageUrl = await uploadImage(input.IMAGE_URL);

      const updateQuery = `
        UPDATE ADVERTISEMENTS SET
          IMAGE_URL = ?, DESCRIPTION = ?, FROM_DATE = ?, TO_DATE = ?, STATUS = ?, EDITED_BY = ?
        WHERE ID = ?
      `;
      const params = [imageUrl, input.DESCRIPTION, input.FROM_DATE, input.TO_DATE, input.STATUS, userId, input.ID];

      await executeDbQuery(updateQuery, params, true, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Ad updated" } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }
}
