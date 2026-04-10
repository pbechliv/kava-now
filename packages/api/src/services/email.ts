import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  ...(config.smtp.user
    ? { auth: { user: config.smtp.user, pass: config.smtp.pass } }
    : {}),
});

export async function sendMagicLink(
  email: string,
  link: string,
  kavaName: string,
): Promise<void> {
  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: `Σύνδεση στο ${kavaName} — KavaNow`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Σύνδεση στο ${kavaName}</h2>
        <p>Πατήστε τον παρακάτω σύνδεσμο για να συνδεθείτε:</p>
        <p>
          <a href="${link}"
             style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">
            Σύνδεση
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Ο σύνδεσμος λήγει σε 15 λεπτά. Αν δεν ζητήσατε σύνδεση, αγνοήστε αυτό το email.
        </p>
      </div>
    `,
  });
}

export async function sendOrderNotification(
  _email: string,
  _orderDetails: unknown,
): Promise<void> {
  console.log("[email] sendOrderNotification — placeholder");
}

export async function sendOrderStatusChange(
  _email: string,
  _orderId: string,
  _newStatus: string,
): Promise<void> {
  console.log("[email] sendOrderStatusChange — placeholder");
}
