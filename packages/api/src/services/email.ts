import nodemailer from "nodemailer";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ORDER_STATUS_LABELS } from "@kava-now/shared";
import type { OrderStatus } from "@kava-now/shared";
import { config } from "../config";
import {
  SetPasswordEmail,
  subject as setPasswordSubject,
  type SetPasswordMode,
} from "../emails/SetPasswordEmail";
import {
  MembershipAddedEmail,
  subject as membershipAddedSubject,
} from "../emails/MembershipAddedEmail";
import {
  OrderNotificationEmail,
  subject as orderNotificationSubject,
} from "../emails/OrderNotificationEmail";
import {
  OrderStatusChangeEmail,
  subject as orderStatusChangeSubject,
} from "../emails/OrderStatusChangeEmail";

const useResend = Boolean(config.resend.apiKey);

const resend = useResend ? new Resend(config.resend.apiKey) : null;

const transporter = useResend
  ? null
  : nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}),
    });

const fromAddress = useResend ? config.resend.from : config.smtp.from;

async function deliver({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (resend) {
    const recipients = Array.isArray(to) ? to : [to];
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject,
      html,
    });
    if (error) {
      throw new Error(`Resend: ${error.message}`);
    }
    return;
  }
  await transporter!.sendMail({ from: fromAddress, to, subject, html });
}

export async function sendPasswordSet(
  email: string,
  link: string,
  tenantName: string,
  mode: SetPasswordMode,
): Promise<void> {
  const html = await render(SetPasswordEmail({ link, tenantName, mode }));
  await deliver({ to: email, subject: setPasswordSubject({ tenantName, mode }), html });
}

export async function sendMembershipAdded(
  email: string,
  loginUrl: string,
  tenantName: string,
): Promise<void> {
  const html = await render(MembershipAddedEmail({ loginUrl, tenantName }));
  await deliver({ to: email, subject: membershipAddedSubject({ tenantName }), html });
}

interface OrderNotificationTenant {
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
  tenant: OrderNotificationTenant,
  customer: OrderNotificationCustomer,
  order: OrderNotificationOrder,
  items: OrderNotificationItem[],
): Promise<void> {
  const recipients = tenant.notificationEmails;
  if (!recipients || recipients.length === 0) {
    console.log("[email] No notification emails configured for tenant:", tenant.slug);
    return;
  }

  const adminOrderUrl = `${config.appOrigin}/k/${tenant.slug}/admin/orders/${order.id}`;
  const html = await render(
    OrderNotificationEmail({
      tenant: { name: tenant.name, slug: tenant.slug },
      customer: { name: customer.name },
      order: { notes: order.notes, createdAt: order.createdAt },
      items,
      adminOrderUrl,
    }),
  );
  await deliver({
    to: recipients,
    subject: orderNotificationSubject({ customer: { name: customer.name } }),
    html,
  });
}

export async function sendOrderStatusChange(
  customerEmail: string,
  order: { id: string },
  newStatus: OrderStatus,
): Promise<void> {
  const statusLabel = ORDER_STATUS_LABELS[newStatus];
  const orderShortId = order.id.slice(0, 8);
  const html = await render(OrderStatusChangeEmail({ orderShortId, statusLabel }));
  await deliver({
    to: customerEmail,
    subject: orderStatusChangeSubject({ orderShortId, statusLabel }),
    html,
  });
}
