import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

interface OrderStatusChangeEmailProps {
  orderShortId: string;
  statusLabel: string;
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
const heading = { color: "#d97706", fontSize: "20px", fontWeight: 700, margin: "0 0 16px" };
const paragraph = { color: "#374151", fontSize: "14px", lineHeight: "20px", margin: "0 0 16px" };
const status = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: 700,
  margin: "0 0 16px",
};
const muted = { color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "24px 0 0" };

export function OrderStatusChangeEmail({
  orderShortId,
  statusLabel,
}: OrderStatusChangeEmailProps) {
  return (
    <Html lang="el">
      <Head />
      <Preview>
        Η παραγγελία σας #{orderShortId} άλλαξε σε: {statusLabel}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Ενημέρωση Παραγγελίας</Heading>
          <Text style={paragraph}>
            Η κατάσταση της παραγγελίας σας <strong>#{orderShortId}</strong> άλλαξε σε:
          </Text>
          <Text style={status}>{statusLabel}</Text>
          <Text style={muted}>
            Αν έχετε ερωτήσεις σχετικά με την παραγγελία σας, επικοινωνήστε μαζί μας.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function subject({
  orderShortId,
  statusLabel,
}: OrderStatusChangeEmailProps): string {
  return `Η παραγγελία σας #${orderShortId} - ${statusLabel}`;
}

export default OrderStatusChangeEmail;

OrderStatusChangeEmail.PreviewProps = {
  orderShortId: "abc12345",
  statusLabel: "Σε επεξεργασία",
} satisfies OrderStatusChangeEmailProps;
