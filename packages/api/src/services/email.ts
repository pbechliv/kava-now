import nodemailer from "nodemailer";
import { config } from "../config";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";

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

interface OrderNotificationKava {
  id: string;
  name: string;
  slug: string;
  notificationEmails: string[];
}

interface OrderNotificationCustomer {
  id: string;
  name: string;
  email: string | null;
}

interface OrderNotificationOrder {
  id: string;
  notes: string | null;
  createdAt: Date;
}

interface OrderNotificationItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
}

export async function sendOrderNotification(
  kava: OrderNotificationKava,
  customer: OrderNotificationCustomer,
  order: OrderNotificationOrder,
  items: OrderNotificationItem[],
): Promise<void> {
  const recipients = kava.notificationEmails;
  if (!recipients || recipients.length === 0) {
    console.log("[email] No notification emails configured for kava:", kava.slug);
    return;
  }

  const total = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${item.productName}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${Number(item.unitPrice).toFixed(2)}&euro;</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${(Number(item.unitPrice) * item.quantity).toFixed(2)}&euro;</td>
        </tr>`,
    )
    .join("");

  const baseDomain = config.baseDomain;
  const adminOrderUrl = `http://${kava.slug}.${baseDomain}/admin/orders/${order.id}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">Νέα παραγγελία</h2>
      <p><strong>Πελάτης:</strong> ${customer.name}</p>
      <p><strong>Ημερομηνία:</strong> ${new Date(order.createdAt).toLocaleString("el-GR")}</p>
      ${order.notes ? `<p><strong>Σημειώσεις:</strong> ${order.notes}</p>` : ""}

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Προϊόν</th>
            <th style="padding: 8px 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Ποσ.</th>
            <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Τιμή</th>
            <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding: 8px 12px; text-align: right; font-weight: bold;">Σύνολο:</td>
            <td style="padding: 8px 12px; text-align: right; font-weight: bold;">${total.toFixed(2)}&euro;</td>
          </tr>
        </tfoot>
      </table>

      <p>
        <a href="${adminOrderUrl}"
           style="display: inline-block; padding: 12px 24px; background: #d97706; color: #fff; text-decoration: none; border-radius: 6px;">
          Προβολή παραγγελίας
        </a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: config.smtp.from,
    to: recipients.join(", "),
    subject: `Νέα παραγγελία από ${customer.name}`,
    html,
  });
}

export async function sendOrderStatusChange(
  customerEmail: string,
  order: { id: string },
  newStatus: OrderStatus,
): Promise<void> {
  const statusLabel = ORDER_STATUS_LABELS[newStatus];

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #d97706;">Ενημέρωση Παραγγελίας</h2>
      <p>Η κατάσταση της παραγγελίας σας <strong>#${order.id.slice(0, 8)}</strong> άλλαξε σε:</p>
      <p style="font-size: 18px; font-weight: bold; color: #1f2937;">${statusLabel}</p>
      <p style="color: #666; font-size: 14px;">
        Αν έχετε ερωτήσεις σχετικά με την παραγγελία σας, επικοινωνήστε μαζί μας.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: config.smtp.from,
    to: customerEmail,
    subject: `Η παραγγελία σας #${order.id.slice(0, 8)} - ${statusLabel}`,
    html,
  });
}

export async function sendPasswordReset(
  email: string,
  link: string,
  kavaName: string,
): Promise<void> {
  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: `Επαναφορά κωδικού — ${kavaName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Επαναφορά κωδικού</h2>
        <p>Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:</p>
        <p>
          <a href="${link}"
             style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">
            Επαναφορά κωδικού
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Ο σύνδεσμος λήγει σε 15 λεπτά. Αν δεν ζητήσατε επαναφορά κωδικού, αγνοήστε αυτό το email.
        </p>
      </div>
    `,
  });
}
