import express, { Request, Response, Application } from "express";
import { pool, executeDbQuery } from "../db";
import { uploadImage } from "../utils/cloudinaryUtil";
import { authenticateToken } from "../middleWare/authMiddleWare";
import redis from "../redis/redisClient";
import { SERVICE_CACHE_TTL } from "../config/cacheConfig";

export default class ServiceController {
  public router = express.Router();

  constructor(app: Application) {
    app.use("/api/service", this.router);
    this.router.post('/bulk-upload', this.bulkUploadServicess.bind(this));
    this.router.get("/services", authenticateToken as any, this.getAllServices.bind(this));
    this.router.get("/exploreServices", this.getExploreServices.bind(this));
    this.router.get("/servicesbyid", this.getServiceById.bind(this));
    this.router.put("/services", this.updateService.bind(this));
    this.router.put("/exploreServices", this.updateExploreService.bind(this));
    this.router.post("/services", this.createService.bind(this));
    this.router.post("/explore-services", this.createExploreService.bind(this));

    this.router.get("/SubServices", this.getAllSubServices.bind(this));
    this.router.get("/SubServicesbyid", this.getSubServiceById.bind(this));
    this.router.put("/SubServices", this.updateSubService.bind(this));
    this.router.post("/SubServices", this.createSubService.bind(this));

    this.router.get("/Servicesnames", this.Servicesnames.bind(this));
    this.router.get("/SubServicesnames", this.SubServicesnames.bind(this));

    this.router.get("/BussinessProfiles", this.getAllBusinessProfiles.bind(this));
    this.router.get("/BussinessProfilesbyid", this.getBusinessProfileById.bind(this));
    this.router.put("/BussinessProfiles", this.updateBusinessProfile.bind(this));
    this.router.post("/BussinessProfiles", this.createBusinessProfile.bind(this));

    // New
    this.router.get("/BussinessProfilesNew", this.getAllBusinessProfilesNew.bind(this));
    this.router.get("/BussinessProfilesbyidNew", this.getBusinessProfileByIdNew.bind(this));
    this.router.put("/BussinessProfilesNew", this.updateBusinessProfileNew.bind(this));
    this.router.post("/BussinessProfilesNew", this.createBusinessProfileNew.bind(this));



  }

  async createExploreService(req: Request, res: Response) {
    const apiName = "explore-service/create";
    const port = req.socket.localPort!;
    const serviceIds = req.body;

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Get all existing service_ids
      const existingQuery = `SELECT SERVICE_ID FROM EXPLORE_SERVICES WHERE SERVICE_ID IN (${serviceIds.map(() => '?').join(',')})`;
      const existingResult = await executeDbQuery(existingQuery, serviceIds, false, apiName, port, connection);
      const existingIds = new Set(existingResult.map((row: any) => row.SERVICE_ID));

      let insertedCount = 0;

      for (const serviceId of serviceIds) {
        if (!existingIds.has(serviceId)) {
          const insertQuery = `INSERT INTO EXPLORE_SERVICES (SERVICE_ID) VALUES (?)`;
          await executeDbQuery(insertQuery, [serviceId], false, apiName, port, connection);
          insertedCount++;
        }
      }

      await connection.commit();
      res.json({ status: 0, result: { message: "Explore services added", insertedCount, skippedCount: serviceIds.length - insertedCount } });

    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }


  // async createExploreService(req: Request, res: Response) {
  //   const apiName = "explore-service/create";
  //   const port = req.socket.localPort!;
  //   const serviceIds = req.body;
  //   const userId = req.headers["userid"] || "";

  //   let connection;

  //   try {
  //     connection = await pool.getConnection();
  //     await connection.beginTransaction();

  //     const insertedIds: string[] = [];

  //     for (const serviceId of serviceIds) {
  //       const checkDupQuery = `SELECT COUNT(*) as count FROM EXPLORE_SERVICES WHERE SERVICE_ID = ?`;
  //       const dupResult = await executeDbQuery(checkDupQuery, [serviceId], false, apiName, port, connection);

  //       if (Number(dupResult[0]?.count) > 0) {
  //         console.log(`Service ID ${serviceId} already exists. Skipping.`);
  //         continue;
  //       }


  //       const maxIdQuery = `SELECT MAX(CAST(ID AS UNSIGNED)) AS maxId FROM EXPLORE_SERVICES`;
  //       const maxIdResult = await executeDbQuery(maxIdQuery, [], false, apiName, port, connection);
  //       const newId = (Number(maxIdResult[0]?.maxId || 0) + 1).toString().padStart(3, '0');


  //       const insertQuery = `INSERT INTO EXPLORE_SERVICES (ID, SERVICE_ID, CREATED_BY) VALUES (?, ?, ?)`;
  //       await executeDbQuery(insertQuery, [newId, serviceId, userId], false, apiName, port, connection);

  //       insertedIds.push(newId);
  //     }

  //     await connection.commit();
  //     res.json({ status: 0, result: { message: "Explore services added", insertedIds } });

  //   } catch (err: any) {
  //     if (connection) await connection.rollback();
  //     res.json({ status: 1, result: err.toString() });
  //   } finally {
  //     if (connection) connection.release();
  //   }
  // }




  async bulkUploadServicess(req: Request, res: Response) {
    const apiName = "subservice/create";
    const port = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";
    if (!input.CITY_ID) {
      input.CITY_ID = '001'
    }
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      for (let i = 0; i < input.length; i++) {
        const currentItem = input[i];
        const servicename = currentItem.services;
        let serviceID = '';
        const subservicename = currentItem.subservices || '';
        let subserviceID = '';

        const checkServiceDupQuery = ` SELECT ID FROM SERVICES WHERE NAME=? `;
        const serviceDupResult = await executeDbQuery(checkServiceDupQuery, [servicename], false, apiName, port, connection);

        if (serviceDupResult && serviceDupResult.length > 0 && Number(serviceDupResult[0]?.ID) > 0) {
          // Service exists, use its ID
          serviceID = serviceDupResult[0].ID;
        } else {
          // Service does not exist, create a new one
          // NOTE: This ID generation method (MAX(ID) + 1) can lead to race conditions
          // in a high-concurrency environment. Consider using auto-incrementing IDs
          // from the database or a UUID generator for robust ID management.
          const rows = await executeDbQuery(
            "SELECT MAX(CAST(ID AS UNSIGNED)) AS maxId FROM SERVICES",
            [],
            false,
            apiName,
            port,
            connection
          );
          serviceID = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(3, '0');
          const insertServiceQuery = ` INSERT INTO SERVICES (ID, NAME, STATUS) VALUES (?, ?, ?) `;
          const serviceParams = [serviceID, servicename, 'A'];
          await executeDbQuery(insertServiceQuery, serviceParams, false, apiName, port, connection);
        }

        // 2. Now, regardless of whether the service was new or existing,
        //    check and create the sub-service for the current serviceID.
        const checkSubServiceDupQuery = ` SELECT SUB_SERVICE_ID AS ID FROM SUB_SERVICES WHERE NAME = ? AND SERVICE_ID = ? `;
        const subServiceDupResult = await executeDbQuery(checkSubServiceDupQuery, [subservicename, serviceID], false, apiName, port, connection);

        if (subServiceDupResult && subServiceDupResult.length > 0 && Number(subServiceDupResult[0]?.ID) > 0) {
          // Sub-service exists, no action needed (or you could add update logic here if desired)
          subserviceID = subServiceDupResult[0].ID; // Store it if needed later
        } else {
          // Sub-service does not exist, create a new one
          const rows = await executeDbQuery(
            "SELECT MAX(CAST(SUB_SERVICE_ID AS UNSIGNED)) AS maxId FROM SUB_SERVICES",
            [],
            false,
            apiName,
            port,
            connection
          );
          subserviceID = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(4, '0');

          // Call uploadImage with the specific IMAGE_URL for the current item
          const imageUrl = await uploadImage(currentItem.IMAGE_URL);

          // IMPORTANT: Corrected the INSERT query for SUB_SERVICES.
          // The original query had 8 placeholders but only 4 parameters were provided.
          // Assuming your SUB_SERVICES table has columns: SERVICE_ID, SUB_SERVICE_ID, NAME, STATUS.
          // If IMAGE_URL also needs to be stored in SUB_SERVICES, you must add a column for it
          // in your database schema and include a placeholder and parameter here.
          const insertSubServiceQuery = ` INSERT INTO SUB_SERVICES (SERVICE_ID, SUB_SERVICE_ID, NAME, STATUS) VALUES (?, ?, ?, ?) `;
          const subServiceParams = [serviceID, subserviceID, subservicename, 'A'];
          await executeDbQuery(insertSubServiceQuery, subServiceParams, false, apiName, port, connection);
        }
      }

      // Commit the transaction after all operations are successful
      await connection.commit();

      const results = { message: "Services and Sub-services processed successfully." };
      res.json({ status: 0, result: results });

    } catch (err: any) {
      // Rollback the transaction if any error occurs
      if (connection) {
        console.error("Transaction rolled back due to error:", err);
        await connection.rollback();
      }
      res.json({ status: 1, result: err.toString() });
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  }

  async Servicesnames(req: Request, res: Response): Promise<void> {
    const apiName = "service/Servicesnames";
    const port = req.socket.localPort!;
    const query = `SELECT ID, NAME FROM SERVICES WHERE Status = 'A'`;

    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async SubServicesnames(req: Request, res: Response) {
    const apiName = "subservice/SubServicesnames";
    const port = req.socket.localPort!;
    const input = req.query;

    const query = "SELECT SUB_SERVICE_ID as ID, NAME FROM SUB_SERVICES WHERE STATUS='A' and SERVICE_ID = ? ";

    try {
      const rows = await executeDbQuery(query, [input.ID], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async createService(req: Request, res: Response) {
    const apiName = "service/create";
    const port = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const chekdup = ` SELECT COUNT(NAME) as count FROM SERVICES WHERE NAME=? AND DESCRIPTION=?`;
      const dupResult = await executeDbQuery(chekdup, [input.NAME, input.DESCRIPTION], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Service already exists." });
        return;
      }

      const rows = await executeDbQuery("SELECT MAX(CAST(ID AS UNSIGNED)) AS maxId FROM SERVICES", [], false, apiName, port, connection);
      const newId = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(3, '0');
      // console.log('maxid :',rows[0]?.maxId );
      const image_url = await uploadImage(input.IMAGE_URL);

      const insertQuery = ` INSERT INTO SERVICES ( ID, NAME, DESCRIPTION, IMAGE_URL, STATUS, CREATED_BY) VALUES ( ?, ?, ?, ?, ?, ?) `;
      const params = [newId, input.NAME, input.DESCRIPTION, image_url, input.STATUS, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();
      await redis.del("all_services");
      await redis.del(`service:${newId}`);
      const results = { message: "Service created", serviceId: newId, affectedRows: result.affectedRows }
      res.json({ status: 0, result: results });

    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllServices(req: Request, res: Response) {
    const apiName = "service/read-all";
    const port = req.socket.localPort!;
    const cacheKey = "all_services";
    // console.log('headers is',headers);
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        res.json({ status: 0, result: JSON.parse(cachedData), cached: true });
        return;
      }

      const query = ` SELECT CITY_ID, ID, NAME, DESCRIPTION, IMAGE_URL, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SERVICES `;
      const rows = await executeDbQuery(query, [], false, apiName, port);
      await redis.set(cacheKey, JSON.stringify(rows), "EX", SERVICE_CACHE_TTL);
      // await redis.set(cacheKey, JSON.stringify(rows), "EX", 3600); // Cache for 1 hour

      // res.json({ status: 0, result: rows });
      const cached = await redis.get("all_services");
      if (cached) {
        console.log("Redis cache hit");
        res.json({ status: 0, result: JSON.parse(cached) });
        return;
      }
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getExploreServices(req: Request, res: Response): Promise<void> {
    const apiName = "services/explored";
    const port = req.socket.localPort!;
    const query = ` SELECT IMAGE_URL, ID, NAME, isExplored FROM SERVICES ORDER BY NAME`;
    try {
      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getServiceById(req: Request, res: Response) {
    const apiName = "service/read";
    const port = req.socket.localPort!;
    const id = req.query.id || "";
    const query = ` SELECT CITY_ID, ID, NAME, DESCRIPTION, IMAGE_URL, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SERVICES WHERE ID = ? `;

    try {
      const rows = await executeDbQuery(query, [id], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }


  // async getServiceById(req: Request, res: Response) {
  //   const apiName = "service/read";
  //   const port = req.socket.localPort!;
  //   const id = req.query.id || "";
  //   const query = ` SELECT CITY_ID, ID, NAME, DESCRIPTION, IMAGE_URL, STATUS, CREATED_BY, DATE_FORMAT(CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, EDITED_BY, DATE_FORMAT(EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SERVICES WHERE ID = ? `;

  //   try {
  //     const rows = await executeDbQuery(query, [id], false, apiName, port);
  //     res.json({ status: 0, result: rows });
  //   } catch (err: any) {
  //     res.json({ status: 1, result: err.toString() });
  //   }
  // }

  async updateService(req: Request, res: Response) {
    const apiName = "service/update";
    const port = req.socket.localPort!;
    const input = req.body;
    const userId = req.headers["userid"] || "";
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const image_url = await uploadImage(input.IMAGE_URL);

      const query = `UPDATE SERVICES SET NAME=?, DESCRIPTION=?, IMAGE_URL=?, STATUS=?, EDITED_BY=? WHERE ID=?`;
      const params = [input.NAME, input.DESCRIPTION, image_url, input.STATUS, userId, input.ID];

      await executeDbQuery(query, params, true, apiName, port, connection);
      await connection.commit();

      await redis.del("all_services");
      await redis.del(`service:${input.ID}`);

      res.json({ status: 0, result: { message: "Service updated" } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async updateExploreService(req: Request, res: Response): Promise<void> {
    const apiName = "exploreService/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    const input = req.body;
    let connection: any;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const updateQuery = `UPDATE SERVICES SET isExplored = ?, EDITED_BY =? WHERE ID = ?`;
      const params = [input.isExplored ? "true" : "false", userId, input.ServiceID];
      await executeDbQuery(updateQuery, params, true, apiName, port, connection);
      await connection.commit();
      const results = { message: "Explore Service Updated" };
      res.json({ status: 0, result: results });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }
  // async updateService(req: Request, res: Response) {
  //   const apiName = "service/update";
  //   const port = req.socket.localPort!;
  //   let input = req.body;
  //   const userId = req.headers["userid"] || "";
  //    let connection: any;
  //   connection = await pool.getConnection();
  //   await connection.beginTransaction();
  //   await redis.del("all_services");
  //   const image_url = await uploadImage(input.IMAGE_URL);
  //   const query = ` UPDATE SERVICES SET  NAME = ?, DESCRIPTION = ?, IMAGE_URL = ?, STATUS = ?, EDITED_BY = ? WHERE ID = ? `;
  //   const params = [ input.NAME, input.DESCRIPTION, image_url, input.STATUS, userId, input.ID];

  //   try {
  //     const result = await executeDbQuery(query, params, true, apiName, port);
  //      const results={ message: "Service updated"}
  //     res.json({ status:  0, result:results });
  //   } catch (err: any) {
  //     res.json({ status: 1, result: err.toString() });
  //   }
  // }


  //----------------------------Sub Service End Points------------------------//
  async createSubService(req: Request, res: Response) {
    const apiName = "subservice/create";
    const port = req.socket.localPort!;
    let input = req.body;
    const userId = req.headers["userid"] || "";
    if (!input.CITY_ID) {
      input.CITY_ID = '001'
    }
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const checkDup = await executeDbQuery("SELECT COUNT(NAME) as count FROM SUB_SERVICES WHERE NAME = ? AND SERVICE_ID = ?", [input.NAME, input.ServiceID], false, apiName, port, connection);
      if (Number(checkDup[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Sub Service already exists." });
        return;
      }

      const rows = await executeDbQuery("SELECT MAX(CAST(SUB_SERVICE_ID AS UNSIGNED)) AS maxId FROM SUB_SERVICES", [], false, apiName, port, connection);
      const newId = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(4, '0');

      const imageUrl = await uploadImage(input.IMAGE_URL);

      const insertQuery = "INSERT INTO SUB_SERVICES (CITY_ID, SERVICE_ID, SUB_SERVICE_ID, NAME, DESCRIPTION, STATUS, IMAGE_URL, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      const params = [input.CITY_ID, input.ServiceID, newId, input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Sub-service created", subServiceId: newId, affectedRows: result.affectedRows } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllSubServices(req: Request, res: Response) {
    const apiName = "subservice/read-all";
    const port = req.socket.localPort!;
    try {
      const query = "SELECT  S.NAME as Service_name, SUB.SERVICE_ID, SUB.SUB_SERVICE_ID as ID, SUB.NAME, SUB.DESCRIPTION, SUB.STATUS, SUB.IMAGE_URL, SUB.CREATED_BY, DATE_FORMAT(SUB.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, SUB.EDITED_BY, DATE_FORMAT(SUB.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SUB_SERVICES SUB LEFT JOIN SERVICES S ON SUB.SERVICE_ID = S.ID";

      const rows = await executeDbQuery(query, [], false, apiName, port);
      res.json({ status: 0, result: rows });

    }
    catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getSubServiceById(req: Request, res: Response) {
    const apiName = "subservice/read";
    const port = req.socket.localPort!;
    const subServiceId = req.query.id || "";

    const query = "SELECT SUB.CITY_ID, S.ID, S.NAME, SUB.SERVICE_ID, SUB.SUB_SERVICE_ID, SUB.NAME, SUB.DESCRIPTION, SUB.STATUS, SUB.IMAGE_URL, SUB.CREATED_BY, DATE_FORMAT(SUB.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, SUB.EDITED_BY, DATE_FORMAT(SUB.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM SUB_SERVICES SUB LEFT JOIN SERVICES S ON SUB.SERVICE_ID = S.ID WHERE SUB.SUB_SERVICE_ID = ?";

    try {
      const rows = await executeDbQuery(query, [subServiceId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateSubService(req: Request, res: Response) {
    const apiName = "subservice/update";
    const port = req.socket.localPort!;
    const userId = req.headers["userid"] || "";
    let input = req.body;
    let connection: any;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const imageUrl = await uploadImage(input.IMAGE_URL);

      const query = "UPDATE SUB_SERVICES SET CITY_ID = ?, SERVICE_ID = ?, NAME = ?, DESCRIPTION = ?, STATUS = ?, IMAGE_URL = ?, EDITED_BY = ? WHERE SUB_SERVICE_ID = ?";
      const params = ['001', input.ServiceID, input.NAME, input.DESCRIPTION, input.STATUS, imageUrl, userId, input.ID];

      const result = await executeDbQuery(query, params, true, apiName, port);
      await connection.commit();
      res.json({ status: 0, result: { message: "Sub-service updated" } });

    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, error: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  // ---------------------------- Business Profile Endpoints ---------------------------- //

  async createBusinessProfile(req: Request, res: Response) {
    const apiName = "businessprofile/create";
    const port = req.socket.localPort!;
    const input = req.body;
    const userId = req.headers["userid"] || "";
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const checkDup = "SELECT COUNT(BUSINESS_NAME) as count FROM BUSSINESS_PROFILE WHERE BUSINESS_NAME = ? AND MOBILE = ?";
      const dupResult = await executeDbQuery(checkDup, [input.BUSINESS_NAME, input.MOBILE], false, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Business Profile already exists." });
        return;
      }

      const rows = await executeDbQuery("SELECT MAX(CAST(BUSINESS_ID AS UNSIGNED)) AS maxId FROM BUSSINESS_PROFILE", [], false, apiName, port, connection);
      const newId = (Number(rows[0]?.maxId || 0) + 1).toString().padStart(4, '0');

      const image_url1 = await uploadImage(input.IMAGE_URL1);
      const image_url2 = await uploadImage(input.IMAGE_URL2);
      const image_url3 = await uploadImage(input.IMAGE_URL3);
      const image_url4 = await uploadImage(input.IMAGE_URL4);
      const image_url5 = await uploadImage(input.IMAGE_URL5);

      const insertQuery = `INSERT INTO BUSSINESS_PROFILE (CITY_ID, SERVICE_ID, SUB_SERVICE_ID, BUSINESS_ID, BUSINESS_NAME, OWNER_NAME, BUSINESS_TYPE, MOBILE, ADDRESS, WEEKDAY_TIMINGS, SUNDAY_TIMINGS, WEBSITE_URL, EMAIL, DESCRIPTION, LATITUDE, LONGITUDE, DEFAULT_CONTACT, IMAGE_URL1, IMAGE_URL2, IMAGE_URL3, IMAGE_URL4, IMAGE_URL5, STATUS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const params = [input.CITY_ID, input.ServiceID, input.SubServiceID, newId, input.BUSINESS_NAME, input.OWNER_NAME, input.BUSINESS_TYPE, input.MOBILE, input.ADDRESS, input.WEEKDAY_TIMINGS, input.SUNDAY_TIMINGS, input.WEBSITE_URL, input.EMAIL, input.DESCRIPTION, input.LATITUDE, input.LONGITUDE, input.DEFAULT_CONTACT, image_url1, image_url2, image_url3, image_url4, image_url5, input.STATUS, userId];

      const result = await executeDbQuery(insertQuery, params, false, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Business Profile created", subServiceId: newId, affectedRows: result.affectedRows } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllBusinessProfiles(req: Request, res: Response): Promise<void> {
    const apiName = "businessprofile/read-all";
    const port = req.socket.localPort!;


    try {

      const query = `SELECT B.CITY_ID, B.SERVICE_ID, S.NAME SERVICE, B.SUB_SERVICE_ID, SUB.NAME AS SUB_SERVICE, B.BUSINESS_ID, B.BUSINESS_NAME, B.OWNER_NAME, B.BUSINESS_TYPE, B.MOBILE, B.ADDRESS, B.WEEKDAY_TIMINGS, B.SUNDAY_TIMINGS, B.WEBSITE_URL, B.EMAIL, B.DESCRIPTION, B.LATITUDE, B.LONGITUDE, B.DEFAULT_CONTACT, B.IMAGE_URL1, B.IMAGE_URL2, B.IMAGE_URL3, B.IMAGE_URL4, B.IMAGE_URL5, B.STATUS, B.CREATED_BY, DATE_FORMAT(B.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, B.EDITED_BY, DATE_FORMAT(B.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM BUSSINESS_PROFILE B LEFT JOIN SERVICES S ON S.ID=B.SERVICE_ID LEFT JOIN SUB_SERVICES SUB ON SUB.SUB_SERVICE_ID=B.SUB_SERVICE_ID`;

      const rows = await executeDbQuery(query, [], false, apiName, port);

      res.json({ status: 0, result: rows });
      return;
    }
    catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getBusinessProfileById(req: Request, res: Response) {
    const apiName = "businessprofile/read";
    const port = req.socket.localPort!;
    const BusinessId = req.query.id || "";

    const query = `SELECT B.CITY_ID, B.SERVICE_ID, S.NAME SERVICE, B.SUB_SERVICE_ID, SUB.NAME AS SUB_SERVICE, B.BUSINESS_ID, B.BUSINESS_NAME, B.OWNER_NAME, B.BUSINESS_TYPE, B.MOBILE, B.ADDRESS, B.WEEKDAY_TIMINGS, B.SUNDAY_TIMINGS, B.WEBSITE_URL, B.EMAIL, B.DESCRIPTION, B.LATITUDE, B.LONGITUDE, B.DEFAULT_CONTACT, B.IMAGE_URL1, B.IMAGE_URL2, B.IMAGE_URL3, B.IMAGE_URL4, B.IMAGE_URL5, B.STATUS, B.CREATED_BY, DATE_FORMAT(B.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, B.EDITED_BY, DATE_FORMAT(B.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM BUSSINESS_PROFILE B LEFT JOIN SERVICES S ON S.ID=B.SERVICE_ID LEFT JOIN SUB_SERVICES SUB ON SUB.SUB_SERVICE_ID=B.SUB_SERVICE_ID WHERE B.BUSINESS_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [BusinessId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateBusinessProfile(req: Request, res: Response) {
    const apiName = "businessprofile/update";
    const port = req.socket.localPort!;
    const input = req.body;
    const userId = req.headers["userid"] || "";
    let connection: any;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const image_url1 = await uploadImage(input.IMAGE_URL1);
      const image_url2 = await uploadImage(input.IMAGE_URL2);
      const image_url3 = await uploadImage(input.IMAGE_URL3);
      const image_url4 = await uploadImage(input.IMAGE_URL4);
      const image_url5 = await uploadImage(input.IMAGE_URL5);

      const query = `UPDATE BUSSINESS_PROFILE SET CITY_ID = ?, SERVICE_ID = ?, SUB_SERVICE_ID = ?, BUSINESS_NAME = ?, OWNER_NAME = ?, BUSINESS_TYPE = ?, MOBILE = ?, ADDRESS = ?, WEEKDAY_TIMINGS = ?, SUNDAY_TIMINGS = ?, WEBSITE_URL = ?, EMAIL = ?, DESCRIPTION = ?, LATITUDE = ?, LONGITUDE = ?, DEFAULT_CONTACT = ?, IMAGE_URL1 = ?, IMAGE_URL2 = ?, IMAGE_URL3 = ?, IMAGE_URL4 = ?, IMAGE_URL5 = ?, STATUS = ?, EDITED_BY = ? WHERE BUSINESS_ID = ?`;

      const params = [input.CITY_ID, input.ServiceID, input.SubServiceID, input.BUSINESS_NAME, input.OWNER_NAME, input.BUSINESS_TYPE, input.MOBILE, input.ADDRESS, input.WEEKDAY_TIMINGS, input.SUNDAY_TIMINGS, input.WEBSITE_URL, input.EMAIL, input.DESCRIPTION, input.LATITUDE, input.LONGITUDE, input.DEFAULT_CONTACT, image_url1, image_url2, image_url3, image_url4, image_url5, input.STATUS, userId, input.BUSINESS_ID];

      const result = await executeDbQuery(query, params, true, apiName, port);
      await connection.commit();

      res.json({ status: 0, result: { message: "Business Profile updated" } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, error: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  // New
  async createBusinessProfileNew(req: Request, res: Response) {
    const apiName = "businessprofile/create";
    const port = req.socket.localPort!;
    const input = req.body;
    const userId = req.headers["userid"] || "";
    let connection;

    try {
      connection = await pool.getConnection();
      await redis.del("all_bussiness");
      await connection.beginTransaction();

      const checkDup = "SELECT COUNT(BUSINESS_NAME) as count FROM BUSSINESS_PROFILE WHERE BUSINESS_NAME = ? AND MOBILE = ?";
      const dupResult = await executeDbQuery(checkDup, [input.BUSINESS_NAME, input.MOBILE], true, apiName, port, connection);
      if (Number(dupResult[0]?.count) > 0) {
        await connection.rollback();
        res.json({ status: 2, result: "Business Profile already exists." });
        return;
      }

      const rows = await executeDbQuery("CALL Locate_GenerateBusinessId('B');", [], true, apiName, port, connection);

      const newId = rows[0][0].newBusinessId;

      const image_url1 = await uploadImage(input.IMAGE_URL1);
      const image_url2 = await uploadImage(input.IMAGE_URL2);
      const image_url3 = await uploadImage(input.IMAGE_URL3);

      const insertQuery = `INSERT INTO BUSSINESS_PROFILE (CITY_ID, SERVICE_ID, SUB_SERVICE_ID, BUSINESS_ID, BUSINESS_NAME, OWNER_NAME, BUSINESS_TYPE, MOBILE, EMAIL, DESCRIPTION, LAND_MARK, AREA, IDENTITY_TYPE, IDENTITY_NUMBER, IDENTITY_DOC, IMAGE_URL1, IMAGE_URL2, IMAGE_URL3, IS_LOCATED, LATITUDE, LONGITUDE, WEEKDAY_TIMINGS, SUNDAY_TIMINGS, CREATED_BY) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

      const params = ['101', input.SERVICE_ID, input.SUB_SERVICE_ID, newId, input.BUSINESS_NAME, input.OWNER_NAME, input.BUSINESS_TYPE, input.MOBILE, input.EMAIL, input.DESCRIPTION, input.LAND_MARK, input.AREA, input.IDENTITY_TYPE, input.IDENTITY_NUMBER, input.IDENTITY_DOC, image_url1, image_url2, image_url3, input.IS_LOCATED, input.LATITUDE, input.LONGITUDE, input.WEEKDAY_TIMINGS, input.SUNDAY_TIMINGS, userId];

      const result = await executeDbQuery(insertQuery, params, true, apiName, port, connection);
      await connection.commit();

      res.json({ status: 0, result: { message: "Business Profile created", BussinessId: newId, affectedRows: result.affectedRows } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, result: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }

  async getAllBusinessProfilesNew(req: Request, res: Response): Promise<void> {
    const apiName = "businessprofile/read-all";
    const port = req.socket.localPort!;
    const cacheKey = "all_bussiness";

    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        res.json({ status: 0, result: JSON.parse(cachedData), cached: true });
        return;
      }
      const query = `SELECT B.CITY_ID, B.BUSINESS_ID, B.BUSINESS_NAME, B.SERVICE_ID, S.NAME, B.SUB_SERVICE_ID, SB.NAME, B.OWNER_NAME, B.BUSINESS_TYPE, B.MOBILE, B.EMAIL, B.DESCRIPTION, B.LAND_MARK, B.AREA, B.IDENTITY_TYPE, B.IDENTITY_NUMBER, B.IDENTITY_DOC, B.IS_LOCATED, B.LATITUDE, B.LONGITUDE, B.WEEKDAY_TIMINGS, B.SUNDAY_TIMINGS, B.STATUS, B.CREATED_BY, DATE_FORMAT(B.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, B.EDITED_BY, DATE_FORMAT(B.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM BUSSINESS_PROFILE B LEFT JOIN SERVICES S ON B.SERVICE_ID = S.ID LEFT JOIN SUB_SERVICES SB ON SB.SUB_SERVICE_ID = B.SUB_SERVICE_ID ORDER BY BUSINESS_NAME`;

      const rows = await executeDbQuery(query, [], false, apiName, port);

      await redis.set(cacheKey, JSON.stringify(rows), "EX", 3600); // Cache for 1 hour

      // res.json({ status: 0, result: rows });
      const cached = await redis.get("all_bussiness");
      if (cached) {
        console.log("Redis cache hit");
        res.json({ status: 0, result: JSON.parse(cached) });
        return;
      }
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async getBusinessProfileByIdNew(req: Request, res: Response) {
    const apiName = "businessprofile/read";
    const port = req.socket.localPort!;
    const BusinessId = req.query.id || "";

    const query = `SELECT B.CITY_ID, B.BUSINESS_ID, B.BUSINESS_NAME, B.SERVICE_ID, S.NAME, B.SUB_SERVICE_ID, SB.NAME, B.OWNER_NAME, B.BUSINESS_TYPE, B.MOBILE, B.EMAIL, B.DESCRIPTION, B.LAND_MARK, B.AREA, B.IDENTITY_TYPE, B.IDENTITY_NUMBER, B.IDENTITY_DOC, B.IS_LOCATED, B.LATITUDE, B.LONGITUDE, B.WEEKDAY_TIMINGS, B.SUNDAY_TIMINGS, B.STATUS, B.CREATED_BY, DATE_FORMAT(B.CREATED_ON, '%d/%m/%Y %H:%i') AS CREATED_ON, B.EDITED_BY, DATE_FORMAT(B.EDITED_ON, '%d/%m/%Y %H:%i') AS EDITED_ON FROM BUSSINESS_PROFILE B LEFT JOIN SERVICES S ON B.SERVICE_ID = S.ID LEFT JOIN SUB_SERVICES SB ON SB.SUB_SERVICE_ID = B.SUB_SERVICE_ID WHERE B.BUSINESS_ID = ?`;

    try {
      const rows = await executeDbQuery(query, [BusinessId], false, apiName, port);
      res.json({ status: 0, result: rows });
    } catch (err: any) {
      res.json({ status: 1, result: err.toString() });
    }
  }

  async updateBusinessProfileNew(req: Request, res: Response) {
    const apiName = "businessprofile/update";
    const port = req.socket.localPort!;
    const input = req.body;
    const userId = req.headers["userid"] || "";
    let connection: any;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await redis.del("all_bussiness");

      const image_url1 = await uploadImage(input.IMAGE_URL1);
      const image_url2 = await uploadImage(input.IMAGE_URL2);
      const image_url3 = await uploadImage(input.IMAGE_URL3);

      const query = ` UPDATE BUSSINESS_PROFILE SET CITY_ID = ?, SERVICE_ID = ?, SUB_SERVICE_ID = ?,BUSINESS_NAME = ?, OWNER_NAME = ?, BUSINESS_TYPE = ?, MOBILE = ?, EMAIL = ?, DESCRIPTION = ?, LAND_MARK = ?, AREA = ?, IDENTITY_TYPE = ?, IDENTITY_NUMBER = ?, IDENTITY_DOC = ?, IMAGE_URL1 = ?, IMAGE_URL2 = ?, IMAGE_URL3 = ?, IS_LOCATED = ?, LATITUDE = ?, LONGITUDE = ?, WEEKDAY_TIMINGS = ?, SUNDAY_TIMINGS = ?, STATUS = ?, EDITED_BY = ?, EDITED_ON = NOW() WHERE BUSINESS_ID = ?;`;

      const params = [input.CITY_ID || '101', input.SERVICE_ID, input.SUB_SERVICE_ID, input.BUSINESS_NAME, input.OWNER_NAME, input.BUSINESS_TYPE, input.MOBILE, input.EMAIL, input.DESCRIPTION, input.LAND_MARK, input.AREA, input.IDENTITY_TYPE, input.IDENTITY_NUMBER, input.IDENTITY_DOC, image_url1, image_url2, image_url3, input.IS_LOCATED, input.LATITUDE, input.LONGITUDE, input.WEEKDAY_TIMINGS, input.SUNDAY_TIMINGS, input.STATUS, userId, input.BUSINESS_ID];

      const result = await executeDbQuery(query, params, true, apiName, port);
      await connection.commit();

      res.json({ status: 0, result: { message: "Business Profile updated" } });
    } catch (err: any) {
      if (connection) await connection.rollback();
      res.json({ status: 1, error: err.toString() });
    } finally {
      if (connection) connection.release();
    }
  }


}
