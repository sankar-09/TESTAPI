import express, { Request, Response, Application } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";
import { promises } from "dns";

export default class NewsFeedController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/feed", this.router);

    this.router.get("/newsfeeds", this.getAllNewsFeeds.bind(this));
    this.router.get("/newsfeedbyid", this.getNewsFeedById.bind(this));
    this.router.put("/newsfeeds", this.updateNewsFeed.bind(this));
    this.router.put("/acceptFeed", this.acceptFeed.bind(this));
    this.router.post("/newsfeeds", this.createNewsFeed.bind(this));
  }

  async createNewsFeed(req: Request, res: Response) {
  const apiName = "newsfeed/create";
  const port = req.socket.localPort!;
  const userId = req.headers["userid"] || "";
  const input = req.body;
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Duplicate check: count rows where FEED_HEAD and FEED_MATTER match.
    const chekdup = `SELECT COUNT(FEED_HEAD) as count FROM NEWS_FEED WHERE FEED_HEAD=? AND FEED_MATTER=?`;
    const dupResult = await executeDbQuery(chekdup, [input.FEED_HEAD, input.FEED_MATTER], true, apiName, port, connection);
    if (Number(dupResult[0]?.count) > 0) {
      await connection.rollback();
      res.json({ status: 2, result: "News feed already exists." });
      return;
    }

    // Generate new FEED_ID.
    const result = await executeDbQuery("SELECT MAX(CAST(SUBSTRING(FEED_ID, 5) AS UNSIGNED)) AS maxId FROM NEWS_FEED", [], true, apiName, port, connection);
    const newId = "FEED" + String((Number(result[0]?.maxId || 0) + 1)).padStart(3, "0");

    // Upload image.
    const image_url = await uploadImage(input.IMAGE_URL);

    // Insert new news feed.
    const insertQuery = `INSERT INTO NEWS_FEED (CITY_ID, FEED_ID, FEED_HEAD, FEED_MATTER, IMAGE_URL, FEED_DATE, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [ '001', newId, input.FEED_HEAD, input.FEED_MATTER, image_url, input.FEED_DATE, 'P', userId ];
    const insertResult = await executeDbQuery(insertQuery, params, true, apiName, port, connection);
    await connection.commit();

    const results = { message: "News feed created", feedId: newId, affectedRows: insertResult.affectedRows };
    res.json({ status: 0, result: results });
  } catch (err: any) {
    if (connection) await connection.rollback();
    res.json({ status: 1, result: err.toString() });
  } finally {
    if (connection) connection.release();
  }
}


  async getAllNewsFeeds(req: Request, res: Response) {
    const apiName = "newsfeed/read-all";
    const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, FEED_ID, FEED_HEAD, FEED_MATTER, IMAGE_URL, DATE_FORMAT(FEED_DATE, '%d/%m/%Y %H:%i') AS FEED_DATE, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM NEWS_FEED`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getNewsFeedById(req: Request, res: Response) {
    const apiName = "newsfeed/read";
    const port = req.socket.localPort!;
    const feedId = req.query.id || "";
    const query = `SELECT CITY_ID, FEED_ID, FEED_HEAD, FEED_MATTER, IMAGE_URL, CREATED_BY, DATE_FORMAT(FEED_DATE, '%d/%m/%Y %H:%i') AS FEED_DATE, STATUS, CREATED_BY, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM NEWS_FEED WHERE FEED_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [feedId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateNewsFeed(req: Request, res: Response) {
    const apiName = "newsfeed/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
     let connection: any;
     if(!input.CITY_ID){
      input.CITY_ID='101'
     }
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const image_url = await uploadImage(input.IMAGE_URL);
    const updateQuery = ` UPDATE NEWS_FEED SET CITY_ID = ?, FEED_HEAD = ?, FEED_MATTER = ?, IMAGE_URL = ?, FEED_DATE = ?,  EDITED_BY = ? WHERE FEED_ID = ? `;
    const params = [ input.CITY_ID, input.FEED_HEAD, input.FEED_MATTER, image_url, input.FEED_DATE, userId,  input.FEED_ID];

    try {
      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = {message: "News feed updated"};
      res.json({ status: 0, result:results });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

    async acceptFeed(req: Request, res: Response) {
    const apiName = "newsfeed/accept";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    
    const input = req.body;
     let connection: any;
   
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const updateQuery = `UPDATE NEWS_FEED SET STATUS='A', ACCEPTED_BY=? WHERE FEED_ID=?`;
    const params = [userId, input.feedId];

    try {
      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = {message: "News feed accepted"};
      res.json({ status: 0, result:results });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }
}

