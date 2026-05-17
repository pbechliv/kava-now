import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface MembershipAddedEmailProps {
  loginUrl: string;
  tenantName: string;
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

export function MembershipAddedEmail({ loginUrl, tenantName }: MembershipAddedEmailProps) {
  return (
    <Html lang="el">
      <Head />
      <Preview>Έχετε προστεθεί στο {tenantName} στο KavaNow.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Έχετε προστεθεί στο {tenantName}</Heading>
          <Text style={paragraph}>
            Ένας υπάρχων λογαριασμός σας έχει συνδεθεί με τον λογαριασμό {tenantName}. Μπορείτε να
            συνδεθείτε με τον τρέχοντα κωδικό σας.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button href={loginUrl} style={button}>
              Σύνδεση
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function subject({ tenantName }: { tenantName: string }): string {
  return `Έχετε προστεθεί στο ${tenantName} — KavaNow`;
}

export default MembershipAddedEmail;

MembershipAddedEmail.PreviewProps = {
  loginUrl: "https://kavanow.gr/k/demo/login",
  tenantName: "Demo Λογαριασμός",
} satisfies MembershipAddedEmailProps;
