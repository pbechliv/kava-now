import nodemailer from "nodemailer";
import { Resend } from "resend";
import { render } from "@react-email/render";
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
  if (!transporter) {
    throw new Error("No email transport configured");
  }
  await transporter.sendMail({ from: fromAddress, to, subject, html });
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
