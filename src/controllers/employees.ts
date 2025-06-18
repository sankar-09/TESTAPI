import express, { Request, Response } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";

class EmployeeController {
  public router = express.Router();

  constructor(app: any) {
    // Base path now uses "employee" instead of "user"
    app.use("/api/employee", this.router);
    this.router.get("/employees", this.getAllEmployees.bind(this));
    this.router.get("/employeebyid", this.getEmployeeById.bind(this));
    this.router.put("/employees", this.updateEmployee.bind(this));
    this.router.post("/employees", this.createEmployee.bind(this));
    this.router.post("/login", this.login.bind(this));

    // Role endpoints (unchanged)
    this.router.get("/roles", this.getAllRoles.bind(this));
    this.router.put("/roles", this.updateRole.bind(this));
    this.router.post("/roles", this.createRole.bind(this));
  }

  // ---------------- Employee endpoints ---------------- //

  // Login Endpoint – verifies employee based on email and password.
  async login(req: Request, res: Response) {
    const apiName = "employee/login";
    const input = req.body;
    try {
      const query = `SELECT EMPLOYEE_ID, NAME, EMAIL, IMAGE_URL, ROLE FROM EMPLOYEES WHERE EMAIL = ? AND PASSWORD = ?`;
      const params = [input.email, input.password];
      const connection = await pool.getConnection();
      const result = await executeDbQuery(query, params, false, apiName);
      // (Optional) you can release the connection here if executeDbQuery hasn’t already.
      if (result.length >= 1) {
        res.json({ status: 0, result: result });
      } else {
        res.json({ status: 2, result: { message: "Employee not found" } });
      }
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // Create Employee Endpoint – creates a new employee record using the EMPLOYEES table.
  async createEmployee(req: Request, res: Response) {
    const apiName = "employee/create";
    const port: number = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Check for duplicate employee (by EMAIL and MOBILE_NUMBER)
      const checkDup = `SELECT COUNT(*) as count FROM EMPLOYEES WHERE EMAIL = ? AND MOBILE_NUMBER = ?`;
      const dupResult = await executeDbQuery(checkDup, [input.EMAIL, input.MOBILE_NUMBER], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Employee already exists." });
        return;
      }

      // Generate new employee ID
      await executeDbQuery("CALL GenerateEmpId(@id)", [], false, apiName, port, connection);
      const idRows = await executeDbQuery("SELECT @id as newEmpId", [], false, apiName, port, connection);
      const newEmpId = idRows[0]?.newEmpId;

      // Upload image if one is provided
      const image_url = await uploadImage(input.IMAGE_URL);

      // Insert employee record – note the column order follows the EMPLOYEES table definition.
      const insertQuery = `INSERT INTO EMPLOYEES (CITY_ID, ROLE, EMPLOYEE_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, EMAIL, MOBILE_NUMBER, ALTERNATE_NUMBER, ADDRESS, STATUS, IMAGE_URL, PASSWORD, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [input.CITY_ID, input.ROLE, newEmpId, input.NAME, input.SURNAME, input.FATHER_NAME, input.GENDER, input.DOB, input.EMAIL, input.MOBILE_NUMBER, input.ALTERNATE_NUMBER, input.ADDRESS, input.STATUS, image_url, input.PASSWORD, userId ];
      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      res.json({ status: 0, result: { message: "Employee created", employeeId: newEmpId, affectedRows: result.affectedRows, },
      });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  // Get All Employees Endpoint
  async getAllEmployees(req: Request, res: Response) {
    const apiName = "employee/read-all";
    const port: number = req.socket?.localPort ?? 3000;
    // Format the dates for human readability using DATE_FORMAT
    const query = ` SELECT CITY_ID, ROLE, EMPLOYEE_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, EMAIL, MOBILE_NUMBER, ALTERNATE_NUMBER, ADDRESS, STATUS, IMAGE_URL,CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM EMPLOYEES`;
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // Get Employee by ID Endpoint
  async getEmployeeById(req: Request, res: Response) {
    const apiName = "employee/read";
    const port: number = req.socket.localPort!;
    const id = req.query.id;
    const query = `SELECT CITY_ID, ROLE, EMPLOYEE_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, EMAIL, MOBILE_NUMBER, ALTERNATE_NUMBER, ADDRESS, STATUS, IMAGE_URL,CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON,EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM EMPLOYEES WHERE EMPLOYEE_ID = ?`;
    try {
      const rows = await executeDbQuery(query, [id], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  // Update Employee Endpoint
  async updateEmployee(req: Request, res: Response) {
    const apiName = "employee/update";
    const port: number = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection: any;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      // Upload new image if provided (or reuse current image)
      const image_url = await uploadImage(input.IMAGE_URL);
      const updateQuery = `UPDATE EMPLOYEES SET CITY_ID = ?, ROLE = ?, NAME = ?, SURNAME = ?, FATHER_NAME = ?, GENDER = ?, DOB = ?, EMAIL = ?, MOBILE_NUMBER = ?, ALTERNATE_NUMBER = ?, ADDRESS = ?, STATUS = ?, IMAGE_URL = ?, PASSWORD = ?, EDITED_BY = ? WHERE EMPLOYEE_ID = ?`;
      const params = [ input.CITY_ID, input.ROLE, input.NAME, input.SURNAME, input.FATHER_NAME, input.GENDER, input.DOB, input.EMAIL, input.MOBILE_NUMBER, input.ALTERNATE_NUMBER, input.ADDRESS, input.STATUS, image_url, input.PASSWORD, userId, input.EMPLOYEE_ID];
      await executeDbQuery(updateQuery, params, true, apiName, port);
      await connection.commit();
      res.json({ status: 0, result: { message: "Employee updated" } });
    } catch (err: any) {
      await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      connection.release();
    }
  }

  //----------------------Role End Points----------------------------//
  async createRole(req: Request, res: Response) {
    const apiName = "role/create"; const port = req.socket.localPort!; const input = req.body; let connection; const userId = req.headers["userid"] || "";
    try {
      connection = await pool.getConnection(); await connection.beginTransaction();

       const chekdup = ` SELECT COUNT(*) as count FROM ROLES WHERE ROLE_NAME=? AND DESCRIPTION=?`;
          const dupResult = await executeDbQuery(chekdup, [input.role_name, input.description], false, apiName, port, connection);
          if (Number(dupResult[0]?.count) > 0) {
              await connection.rollback();
              res.json({ status: 2, result: "Role already exists." });
              return;
          }

      const maxIdResult = await executeDbQuery("SELECT IFNULL(MAX(ROLE_ID), 1110) AS maxId FROM ROLES", [], false, apiName, port, connection);
      const newId = Number(maxIdResult[0]?.maxId || 1110) + 1;
      const insertQuery = `INSERT INTO ROLES (CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [input.city_id, newId, input.role_name, input.description, input.status, userId];
      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      const results = {message: "Role created", roleId: newId, affectedRows: result.affectedRows};
      res.json({ status: 0, results:result });
    } catch (err: any) {
      if (connection) await connection.rollback(); res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllRoles(req: Request, res: Response) {
    const apiName = "role/read-all"; const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, DATE_FORMAT(CREATED_AT, '%d/%m/%Y %H:%i') AS CREATED_ON, CREATED_BY, DATE_FORMAT(UPDATED_AT, '%d/%m/%Y %H:%i') AS EDITED_ON, UPDATED_BY FROM ROLES`;
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }


  async updateRole(req: Request, res: Response) {
    const apiName = "role/update"; const port = req.socket.localPort!; const input = req.body; const userId = req.headers["userid"] || "";

    const query = `UPDATE ROLES SET CITY_ID = ?, ROLE_NAME = ?, DESCRIPTION = ?, STATUS = ?, UPDATED_BY = ? WHERE ROLE_ID = ?`;
    const params = [input.city_id, input.role_name, input.description, input.status, userId, input.role_id];
    try {
      const result = await executeDbQuery(query, params, true, apiName, port);
      const results = {message: "Role updated"};
      res.json({ status: 0, result:results });
    } catch (err: any) {
      res.json({ status: 1, error: err.toString() });
    }
  }
}

export default EmployeeController;
