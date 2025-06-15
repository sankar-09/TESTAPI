import express, { Request, Response, Application } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";
import { userInfo } from "os";

export default class CategoryController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/category", this.router);

    this.router.get("/categories", this.getAllCategories.bind(this));
    this.router.get("/categorybyid", this.getCategoryById.bind(this));
    this.router.put("/categories", this.updateCategory.bind(this));
    this.router.post("/categories", this.createCategory.bind(this));

    this.router.get("/SubServices", this.getAllSubCategories.bind(this));
    this.router.get("/SubServicesbyid", this.getSubCategoryById.bind(this));
    this.router.put("/SubServices", this.updateSubCategory.bind(this));
    this.router.post("/SubServices", this.createSubCategory.bind(this));
    // this.router.get("/subcategories", this.getAllSubCategories.bind(this));
    // this.router.get("/subcategorybyid", this.getSubCategoryById.bind(this));
    // this.router.put("/subcategories", this.updateSubCategory.bind(this));
    // this.router.post("/subcategories", this.createSubCategory.bind(this));
  }

  // -------------------------- Category Endpoints -------------------------- //

  async createCategory(req: Request, res: Response) {
    const apiName = "category/create";
    const port = req.socket.localPort!; const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const dupCheckQuery = `SELECT COUNT(*) as count FROM CATEGORIES WHERE NAME=? AND DESCRIPTION=?`;
      const dupResult = await executeDbQuery(dupCheckQuery, [input.NAME, input.DESCRIPTION], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: { message: "Category already exists" } });
        return;
      }

      const idQuery = `SELECT MAX(CAST(CAT_ID AS UNSIGNED)) AS maxId FROM CATEGORIES`;
      const rows = await executeDbQuery(idQuery, [], false, apiName, port, connection);
      const newId = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(3, '0');
      const imageUrl = await uploadImage(input.IMAGE_URL);

      const insertQuery = `INSERT INTO CATEGORIES (CITY_ID, CAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = [input.CITY_ID, newId, input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Category created", categoryId: newId, affectedRows: result.affectedRows } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllCategories(req: Request, res: Response) {
    const apiName = "category/read-all";
    const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, CAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM CATEGORIES`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getCategoryById(req: Request, res: Response) {
    const apiName = "category/read";
    const port = req.socket.localPort!;
    const id = req.query.id || "";

    const query = `SELECT CITY_ID, CAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM CATEGORIES WHERE CAT_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [id], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateCategory(req: Request, res: Response) {
    const apiName = "category/update";
    const port = req.socket.localPort!; const userId = req.headers["userid"] || "";
    const input = req.body;

    try {
      const imageUrl = await uploadImage(input.IMAGE_URL);
      const query = `UPDATE CATEGORIES SET NAME = ?, DESCRIPTION = ?, STATUS = ?, IMAGE_URL = ?, EDITED_BY = ? WHERE CAT_ID = ?`;
      const params = [input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId, input.CAT_ID];

      const result = await executeDbQuery(query, params, true, apiName, port);
      res.json({ status: 0, result: { message: "Category updated" } });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // ----------------------- Sub Category Endpoints ----------------------- //

  async createSubCategory(req: Request, res: Response) {
    const apiName = "subcategory/create";
    const port = req.socket.localPort!; const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const dupCheckQuery = `SELECT COUNT(*) as count FROM SUBCATEGORIES WHERE NAME=? AND DESCRIPTION=?`;
      const dupResult = await executeDbQuery(dupCheckQuery, [input.NAME, input.DESCRIPTION], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: { message: "Sub-category already exists" } });

        return;
      }

      const idQuery = `SELECT MAX(CAST(SUBCAT_ID AS UNSIGNED)) AS maxId FROM SUBCATEGORIES`;
      const rows = await executeDbQuery(idQuery, [], false, apiName, port, connection);
      const newId = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(4, '0');
      const imageUrl = await uploadImage(input.IMAGE_URL);

      const insertQuery = `INSERT INTO SUBCATEGORIES (CITY_ID, CAT_ID, SUBCAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [input.CITY_ID, input.CAT_ID, newId, input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Sub-category created", subCategoryId: newId, affectedRows: result.affectedRows } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllSubCategories(req: Request, res: Response) {
    const apiName = "subcategory/read-all";
    const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, CAT_ID, SUBCAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SUBCATEGORIES`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getSubCategoryById(req: Request, res: Response) {
    const apiName = "subcategory/read";
    const port = req.socket.localPort!;
    const subcatId = req.query.id || "";

    const query = `SELECT CITY_ID, CAT_ID, SUBCAT_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SUBCATEGORIES WHERE SUBCAT_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [subcatId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.status(500).json({ status: 1, result: err.toString() });
    }
  }

  async updateSubCategory(req: Request, res: Response) {
    const apiName = "subcategory/update";
    const port = req.socket.localPort!; const userId = req.headers["userid"] || "";
    const input = req.body;

    try {
      const imageUrl = await uploadImage(input.IMAGE_URL);
      const query = `UPDATE SUBCATEGORIES SET NAME = ?, DESCRIPTION = ?, STATUS = ?, IMAGE_URL = ?, EDITED_BY = ? WHERE SUBCAT_ID = ?`;

      const params = [input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId, input.SUBCAT_ID];
      const result = await executeDbQuery(query, params, true, apiName, port);

      res.json({ status: 0, result: { message: "Sub-category updated" } });
    } catch (err: any) {
      res.json({ status: 1, error: err.toString() });
    }
  }
}
