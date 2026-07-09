import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";

export type SetPasswordMode = "invite" | "reset";

interface SetPasswordEmailProps {
  link: string;
  tenantName: string;
  mode: SetPasswordMode;
}

const main = {
  backgroundColor: "#f9fafb",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", sans-serif',
  padding: "32px 0",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "32px",
};

const heading = { color: "#111827", fontSize: "20px", fontWeight: 700, margin: "0 0 16px" };
const paragraph = { color: "#374151", fontSize: "14px", lineHeight: "20px", margin: "0 0 16px" };
const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 24px",
  textDecoration: "none",
};
const muted = { color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "24px 0 0" };

export function SetPasswordEmail({ link, tenantName, mode }: SetPasswordEmailProps) {
  const isInvite = mode === "invite";
  const previewText = isInvite
    ? `Καλώς ήρθατε στο ${tenantName}. Ορίστε τον κωδικό σας.`
    : `Επαναφορά κωδικού — ${tenantName}.`;
  const title = isInvite ? `Καλώς ήρθατε στο ${tenantName}` : "Επαναφορά κωδικού";
  const intro = isInvite
    ? `Έχετε προσκληθεί στο ${tenantName}. Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε τον κωδικό σας και να συνδεθείτε.`
    : "Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:";
  const cta = isInvite ? "Ορισμός κωδικού" : "Επαναφορά κωδικού";
  const footer = isInvite
    ? "Αν δεν περιμένατε αυτή την πρόσκληση, αγνοήστε αυτό το email."
    : "Αν δεν ζητήσατε επαναφορά κωδικού, αγνοήστε αυτό το email.";

  return (
    <Html lang="el">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{title}</Heading>
          <Text style={paragraph}>{intro}</Text>
          <Section style={{ margin: "24px 0" }}>
            <Button href={link} style={button}>
              {cta}
            </Button>
          </Section>
          <Text style={muted}>Ο σύνδεσμος λήγει σε 1 ώρα. {footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function subject({
  tenantName,
  mode,
}: Pick<SetPasswordEmailProps, "tenantName" | "mode">): string {
  return mode === "invite"
    ? `Καλώς ήρθατε στο ${tenantName} — Ορίστε τον κωδικό σας`
    : `Επαναφορά κωδικού — ${tenantName}`;
}

export default SetPasswordEmail;

SetPasswordEmail.PreviewProps = {
  link: "https://kavanow.gr/k/demo/welcome?token=preview",
  tenantName: "Demo Λογαριασμός",
  mode: "invite",
} satisfies SetPasswordEmailProps;
