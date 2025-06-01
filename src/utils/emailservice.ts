import nodemailer from "nodemailer";
import hbs from "nodemailer-express-handlebars";
import path from "path";
import dotenv from "dotenv";
import { create } from "express-handlebars";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const handlebarOptions = {
  viewEngine: create({
    extname: ".hbs",
    partialsDir: path.resolve("./src/template/"),
    defaultLayout: false,
  }),
  viewPath: path.resolve("./src/template/"),
  extName: ".hbs",
};

transporter.use("compile", hbs(handlebarOptions));

export const sendEmail = async (
  to: string,
  subject: string,
  template: string,
  variables: any
) => {
  transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    // @ts-expect-error: 'template' is used by nodemailer-express-handlebars plugin
    template,
    context: variables,
    attachments: [
      {
        filename: "logo2.jpeg",
        path: path.resolve("./src/template/logo2.jpeg"),
        cid: "logo2",
      },
    ],
  });
};
