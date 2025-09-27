import express, { Request, Response } from "express";
import { pool, executeDbQuery } from "../db";
import { request } from "http";
import { uploadImage } from "../utils/cloudinaryUtil";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleWare/authMiddleWare";
import { sendEmail } from "../utils/emailservice";
import { generateAndStoreOtp } from "../utils/otp";
const OTP_TTL_MIN = 5;
//token
// const secretKey =(process.env.ACCESS_TOKEN_KEY as string) || "'your_secret_key";
//   const secretKeyRefresh =(process.env.REFRESH_TOKEN_KEY as string) || "'your_secret_key_refresh";
const secretKey = process.env.ACCESS_TOKEN_KEY || 'Y6u$3vZq!7LqFg#29xVrE!8TmQpLuR1C';
const secretKeyRefresh = process.env.REFRESH_TOKEN_KEY || 'J9p@WmZx*3BtRh$12qNsTy^Xz7KvOc5D';

class UserController {
  public router = express.Router();

  constructor(app: any) {
    app.use("/api/user", this.router);

    this.router.get("/users", this.getAllUsers.bind(this));
    this.router.get("/usersbyid", this.getUserById.bind(this));
    this.router.put("/users", this.updateUser.bind(this));
    this.router.post("/users", this.createUser.bind(this));
    this.router.post("/mobileUsers", this.createMobileUser.bind(this));
    this.router.post("/login", this.Login.bind(this));
    this.router.post("/requestOtp", this.requestOtp.bind(this));
    this.router.post("/mobileLogin", this.loginVerifyOtp.bind(this))
    this.router.put("/changepass", this.changePass.bind(this));

    this.router.get("/roles", this.getAllRoles.bind(this));
    this.router.put("/roles", this.updateRole.bind(this));
    this.router.post("/roles", this.createRole.bind(this));

    this.router.post("/refresh-token", this.refreshToken.bind(this));
  }

  // async Login(Request: Request, Response: Response) {
  //   const apiName = "user/Login";
  //   let input=Request.body;
  //   try {

  //     let query=`select U.USER_ID, U.NAME, U.EMAIL, U.IMAGE_URL, R.ROLE_NAME FROM USERS U LEFT JOIN ROLES R ON R.ROLE_ID=U.ROLE WHERE U.EMAIL=? and U.PASSWORD=? `;
  //     const params=[input.email,input.password];

  //     let connection = await pool.getConnection();
  //     const result = await executeDbQuery(query, params, false, apiName);
  //     if(result.length>=1){
  //       Response.json({ status: 0, result: result });
  //     }else{
  //     Response.json({ status: 2, result: {message:'user not fund'} });

  //     }

  //   } catch (err:any) {
  //     Response.json({ status: 1, result: err.toString()});
  //   }
  // }
  refreshToken(req: Request, res: Response) {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ status: 1, message: "Refresh token missing" });
      return;
    }

    try {
      const decoded = jwt.verify(refreshToken, secretKeyRefresh) as any;

      const newAccessToken = jwt.sign(
        { userId: decoded.userId, role: decoded.role },
        secretKey,
        { algorithm: "HS256", expiresIn: "10m" }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, role: decoded.role },
        secretKeyRefresh,
        { algorithm: "HS256", expiresIn: "7d" }
      );

      res.json({
        status: 0,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      res.status(403).json({ status: 1, message: "Invalid refresh token" });
    }
  };

  async Login(Request: Request, Response: Response) {
    const apiName = "user/Login";
    // console.log(secretKey);
    let input = Request.body;
    try {
      let query = `
        SELECT U.USER_ID, U.NAME, U.EMAIL, R.ROLE_NAME 
        FROM USERS U 
        LEFT JOIN ROLES R ON R.ROLE_ID = U.ROLE 
        WHERE U.EMAIL = ? AND U.PASSWORD = ? AND U.STATUS='A'
      `;
      const params = [input.email, input.password];

      const result = await executeDbQuery(query, params, false, apiName);
      if (result.length >= 1) {
        const user = result[0];

        // Generate JWT access token only
        const accessToken = jwt.sign(
          { userId: user.USER_ID, role: user.ROLE_NAME },
          secretKey,
          { algorithm: "HS256", expiresIn: "1m" }
        );
        const refreshToken = jwt.sign(
          { userId: user.USER_ID, role: user.ROLE_NAME },
          secretKeyRefresh,
          { algorithm: "HS256", expiresIn: "7d" }
        );
        Response.json({
          status: 0,
          message: "login success",
          accessToken, refreshToken, result: result
        });
      } else {
        Response.json({ status: 2, result: { message: "user not found" } });
      }
    } catch (err: any) {
      Response.json({ status: 1, result: err.toString() });
    }
  }

  async requestOtp(req: Request, res: Response): Promise<void> {
    const apiName = "user/requestOtp";
    const port: number = req.socket.localPort!;
    let connection;
    const input = req.body;

    if (!input.MOBILE_NUMBER) {
      res.status(400).json({ status: 1, result: "mobile required" });
      return;
    }

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const users = await executeDbQuery( `SELECT USER_ID, EMAIL FROM MOBILE_USERS WHERE MOBILE_NUMBER = ? AND STATUS='A'`, [input.MOBILE_NUMBER], true, apiName, port, connection );

      if (!users.length) {
        await connection.rollback();
        res.json({ status: 2, result: "user not found, please register" });
        return;
      }

      const userId = users[0].USER_ID;

      const { otp, expiresAt } = await generateAndStoreOtp( input.MOBILE_NUMBER, OTP_TTL_MIN );

      await executeDbQuery( `INSERT INTO MOBILE_OTPS (MOBILE_NUMBER, OTP_CODE, EXPIRES_AT, CREATED_AT) VALUES (?,?,?,NOW())`, [input.MOBILE_NUMBER, otp, expiresAt], true, apiName, port, connection );

      await connection.commit();

      const result = { message: "otp generated", otp, expiresAt };
      res.json({ status: 0, result });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async loginVerifyOtp(req: Request, res: Response): Promise<void> {
    const apiName = "user/verifyOtp";
    const port: number = req.socket.localPort!;
    const input = req.body;

    try {
      if (!input.MOBILE_NUMBER || !input.OTP) {
        res.status(400).json({ status: 1, result: "mobile and otp required" });
        return;
      }

      // 1. Check user existence
      const userQuery = ` SELECT USER_ID, EMAIL FROM MOBILE_USERS WHERE MOBILE_NUMBER = ? AND STATUS='A'`;
      const users = await executeDbQuery(userQuery, [input.MOBILE_NUMBER], false, apiName, port);

      if (users.length === 0) {
        res.json({ status: 2, result: { message: "user not found" } });
        return;
      }

      const user = users[0];

      // 2. Get most recent OTP
      const otpQuery = `SELECT ID, OTP_CODE, IS_USED, EXPIRES_AT FROM MOBILE_OTPS WHERE MOBILE_NUMBER = ? AND PURPOSE='LOGIN' ORDER BY CREATED_AT DESC LIMIT 1`;
      const otps = await executeDbQuery(otpQuery, [input.MOBILE_NUMBER], false, apiName, port);

      if (otps.length === 0) {
        res.json({ status: 2, result: { message: "no otp found, request new otp" } });
        return;
      }

      const lastOtp = otps[0];
      const now = new Date();

      // 3. Validate OTP
      if (lastOtp.IS_USED) {
        res.json({ status: 2, result: { message: "otp already used" } });
        return;
      }
      if (new Date(lastOtp.EXPIRES_AT).getTime() < now.getTime()) {
        res.json({ status: 2, result: { message: "otp expired" } });
        return;
      }
      if (lastOtp.OTP_CODE !== input.OTP) {
        res.json({ status: 2, result: { message: "invalid otp" } });
        return;
      }

      // 4. Mark OTP used
      const updateQuery = `UPDATE MOBILE_OTPS SET IS_USED = 1, USED_AT = ? WHERE ID = ?`;
      await executeDbQuery(updateQuery, [now, lastOtp.ID], false, apiName, port);

      res.json({ status: 0, message: "login success", result: user });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }


  async changePass(req: Request, res: Response) {
    const apiName = "user/changepass";
    const port: number = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";
    let connection: any;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const chekdup = `SELECT COUNT(EMAIL) as count FROM USERS WHERE EMAIL = ? AND PASSWORD = ? AND USER_ID = ?`;
    const dupResult = await executeDbQuery(chekdup, [input.EMAIL, input.OLD_PASSWORD, userId], false, apiName, port, connection);
    if (Number(dupResult[0]?.count) == 0) {
      await connection.rollback();
      res.json({ status: 2, result: "Invalid Credentials." });
      return;
    }

    const updateQuery = "UPDATE USERS SET PASSWORD = ? WHERE EMAIL = ? AND USER_ID = ?";
    const params = [input.NEW_PASSWORD, input.EMAIL, userId];
    try {
      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = { message: "Password updated" }
      res.json({ status: 0, result: results });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async createUser(req: Request, res: Response) {
    const apiName = "user/create";
    const port: number = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    let connection;
    let input = req.body;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const chekdup = ` SELECT COUNT(EMAIL) as count FROM USERS WHERE EMAIL=? AND MOBILE_NUMBER=?`;
      const dupResult = await executeDbQuery(chekdup, [input.EMAIL, input.MOBILE_NUMBER], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "User already exists." });
        return;
      }

      await executeDbQuery("CALL GenerateUserId(@id)", [], false, apiName, port, connection);

      const idRows = await executeDbQuery("SELECT @id as newUserId", [], false, apiName, port, connection);
      const newUserId = idRows[0]?.newUserId;
      const image_url = await uploadImage(input.IMAGE_URL);
      const insertQuery = ` INSERT INTO USERS ( CITY_ID, USER_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, MOBILE_NUMBER, ALTERNATE_NUMBER, EMAIL, ROLE, ADDRESS, STATUS, IMAGE_URL, CREATED_BY ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

      const params = [input.CITY_ID, newUserId, input.NAME, input.SURNAME, input.FATHER_NAME, input.GENDER, input.DOB, input.MOBILE_NUMBER, input.ALTERNATE_NUMBER, input.EMAIL, input.ROLE, input.ADDRESS, input.STATUS, image_url, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      //send mail to user
      try {
        await sendEmail(
          input.EMAIL,
          "Welcome to Our Locate App Services",
          "welcome",
          {
            name: input.NAME,
            email: input.EMAIL,
          }
        );

        // res.json("email sent successfullys");
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        res.json("email not sent");
      }

      const results = { message: "User created", userId: newUserId, affectedRows: result.affectedRows }
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async createMobileUser(req: Request, res: Response) {
    const apiName = "mobileUser/create";
    const port: number = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    let connection;
    let input = req.body;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const chekdup = ` SELECT COUNT(EMAIL) as count FROM MOBILE_USERS WHERE EMAIL=? AND MOBILE_NUMBER=?`;
      const dupResult = await executeDbQuery(chekdup, [input.EMAIL, input.MOBILE_NUMBER], true, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "User already exists." });
        return;
      }

      await executeDbQuery("CALL GenerateUserId(@id)", [], false, apiName, port, connection);

      const idRows = await executeDbQuery("SELECT @id as newUserId", [], false, apiName, port, connection);
      const newUserId = idRows[0]?.newUserId;
      const insertQuery = `INSERT INTO MOBILE_USERS (USER_ID, MOBILE_NUMBER, EMAIL ) VALUE ('', ?, ?)`;

      const params = [input.MOBILE_NUMBER, input.EMAIL];

      const result = await executeDbQuery(insertQuery, params, true, apiName, port, connection);
      await connection.commit();

      const results = { message: "User created", affectedRows: result.affectedRows }
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }


  async getAllUsers(req: Request, res: Response) {
    const apiName = "user/read-all";
    const port: number = req.socket?.localPort ?? 3000;
    const query = "SELECT CITY_ID, USER_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, MOBILE_NUMBER, ALTERNATE_NUMBER, EMAIL, ROLE, ADDRESS, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM USERS";
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getUserById(req: Request, res: Response) {
    const apiName = "user/read";
    const port: number = req.socket.localPort!;
    const id = req.query.id;
    const query = "SELECT CITY_ID, USER_ID, NAME, SURNAME, FATHER_NAME, GENDER, DOB, MOBILE_NUMBER, ALTERNATE_NUMBER, EMAIL, ROLE, ADDRESS, STATUS, IMAGE_URL, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM USERS WHERE USER_ID = ?";
    try {
      const rows = await executeDbQuery(query, [id], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateUser(req: Request, res: Response) {
    const apiName = "user/update";
    const port: number = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    let input = req.body;
    let connection: any;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const image_url = await uploadImage(input.IMAGE_URL);
    const updateQuery = "UPDATE USERS SET CITY_ID = ?, NAME = ?, SURNAME = ?, FATHER_NAME = ?, GENDER = ?, DOB = ?, MOBILE_NUMBER = ?, ALTERNATE_NUMBER = ?, EMAIL = ?, ROLE = ?, ADDRESS = ?, STATUS = ?, IMAGE_URL = ?, EDITED_BY = ? WHERE USER_ID = ?";
    const params = [input.CITY_ID, input.NAME, input.SURNAME, input.FATHER_NAME, input.GENDER, input.DOB, input.MOBILE_NUMBER, input.ALTERNATE_NUMBER, input.EMAIL, input.ROLE, input.ADDRESS, input.STATUS, image_url, userId, input.USER_ID];
    try {
      const result = await executeDbQuery(updateQuery, params, true, apiName, port);
      const results = { message: "User updated" }
      res.json({ status: 0, result: results });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  //----------------------Role End Points----------------------------//
  //   async createRole(req: Request, res: Response) {
  //     const apiName = "role/create"; const port = req.socket.localPort!; const input = req.body; let connection;
  //     try {
  //       connection = await pool.getConnection(); await connection.beginTransaction();

  //        const chekdup = ` SELECT COUNT(*) as count FROM ROLES WHERE ROLE_NAME=? AND DESCRIPTION=?`;
  //           const dupResult = await executeDbQuery(chekdup, [input.ROLE_NAME, input.DESCRIPTION], false, apiName, port, connection);
  //           if (Number(dupResult[0]?.count) > 0) {
  //               await connection.rollback();
  //               res.status(409).json({ status: 2, result: "Role already exists." });
  //               return;
  //           }

  //       const maxIdResult = await executeDbQuery("SELECT IFNULL(MAX(ROLE_ID), 1110) AS maxId FROM ROLES", [], false, apiName, port, connection);
  //       const newId = Number(maxIdResult[0]?.maxId || 1110) + 1;
  //       const insertQuery = `INSERT INTO ROLES (CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?)`;
  //       const params = [input.CITY_ID, newId, input.ROLE_ID, input.DESCRIPTION, input.STATUS, input.CREATED_BY];
  //       const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
  //       await connection.commit();
  //       const results = {message: "Role created", roleId: newId, affectedRows: result.affectedRows};
  //       res.json({ status: 0, results:result });
  //     } catch (err: any) {
  //       if (connection) await connection.rollback(); res.json({ status: 1, result: err.toString() });
  //     } finally {
  //       if (connection) connection.release();
  //     }
  //   }

  //   async getAllRoles(req: Request, res: Response) {
  //     const apiName = "role/read-all"; const port = req.socket.localPort!;
  //     const query = `SELECT CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, CREATED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON, EDITED_BY FROM ROLES`;
  //     try {
  //       const rows = await executeDbQuery(query, [], false, apiName, port);
  //       res.json({ status: 0, result: rows });
  //     } catch (err: any) {
  //       res.json({ status: 1, result: err.toString() });
  //     }
  //   }


  //   async updateRole(req: Request, res: Response) {
  //     const apiName = "role/update"; const port = req.socket.localPort!; const input = req.body;
  //     let connection: any;
  //     connection = await pool.getConnection();
  //       await connection.beginTransaction();
  //     const chekdup = ` SELECT COUNT(*) as count FROM ROLES WHERE ROLE_NAME=? AND DESCRIPTION=?`;
  //           const dupResult = await executeDbQuery(chekdup, [input.ROLE_NAME, input.DESCRIPTION], false, apiName, port, connection);
  //           if (Number(dupResult[0]?.count) > 0) {
  //               await connection.rollback();
  //               res.status(409).json({ status: 2, result: "Role already exists." });
  //               return;
  //           }

  //     const query = `UPDATE ROLES SET CITY_ID = ?, ROLE_NAME = ?, DESCRIPTION = ?, STATUS = ?, EDITED_BY = ? WHERE ROLE_ID = ?`;
  //     const params = [input.CITY_ID, input.ROLE_NAME, input.DESCRIPTION, input.STATUS, input.EDITED_BY, input.ROLE_ID];
  //     try {
  //       const result = await executeDbQuery(query, params, true, apiName, port);
  //       const results = {message: "Role updated"};
  //       res.json({ status: 0, result:results });
  //     } catch (err: any) {
  //       res.json({ status: 1, error: err.toString() });
  //     }
  //   }

  // }

  // export default UserController;


  async createRole(req: Request, res: Response) {
    const apiName = "role/create";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const chekdup = ` SELECT COUNT(ROLE_NAME) as count FROM ROLES WHERE ROLE_NAME=? AND DESCRIPTION=?`;
      const dupResult = await executeDbQuery(chekdup, [input.ROLE_NAME, input.DESCRIPTION], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Role already exists." });
        return;
      }

      const maxIdResult = await executeDbQuery(
        "SELECT IFNULL(MAX(ROLE_ID), 1110) AS maxId FROM ROLES",
        [],
        false,
        apiName,
        port,
        connection
      );
      const newId = Number(maxIdResult[0]?.maxId || 1110) + 1;
      const insertQuery = `INSERT INTO ROLES (CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [
        input.CITY_ID,
        newId,
        input.ROLE_NAME,
        input.DESCRIPTION,
        input.STATUS,
        userId,
      ];
      const result = await executeDbQuery(
        insertQuery,
        params,
        false,
        apiName,
        port,
        connection
      );
      await connection.commit();
      const results = {
        message: "Role created",
        ROLE_ID: newId,
        affectedRows: result.affectedRows,
      };
      res.json({ status: 0, results: result });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllRoles(req: Request, res: Response) {

    const apiName = "role/read-all"; const port = req.socket.localPort!;
    const query = `SELECT CITY_ID, ROLE_ID, ROLE_NAME, DESCRIPTION, STATUS, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, CREATED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON, EDITED_BY FROM ROLES`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateRole(req: Request, res: Response) {
    const apiName = "role/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    const query = `UPDATE ROLES SET CITY_ID = ?, ROLE_NAME = ?, DESCRIPTION = ?, STATUS = ?, EDITED_BY = ? WHERE ROLE_ID = ?`;
    const params = [
      input.CITY_ID,
      input.ROLE_NAME,
      input.DESCRIPTION,
      input.STATUS,
      userId,
      input.ROLE_ID,
    ];
    try {
      const result = await executeDbQuery(query, params, true, apiName, port);
      const results = { message: "Role updated" };
      res.json({ status: 0, result: results });
    } catch (err: any) {
      res.json({ status: 1, error: err.toString() });
    }
  }
}

export default UserController;
