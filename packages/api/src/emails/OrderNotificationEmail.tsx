import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

interface OrderNotificationTenant {
  name: string;
  slug: string;
}

interface OrderNotificationCustomer {
  name: string;
}

interface OrderNotificationOrder {
  notes: string | null;
  createdAt: Date | string;
}

interface OrderNotificationItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
}

interface OrderNotificationEmailProps {
  tenant: OrderNotificationTenant;
  customer: OrderNotificationCustomer;
  order: OrderNotificationOrder;
  items: OrderNotificationItem[];
  adminOrderUrl: string;
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
  maxWidth: "640px",
  padding: "32px",
};
const heading = { color: "#d97706", fontSize: "20px", fontWeight: 700, margin: "0 0 16px" };
const paragraph = { color: "#374151", fontSize: "14px", lineHeight: "20px", margin: "0 0 8px" };
const tableHeader = {
  backgroundColor: "#f9fafb",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 12px",
  borderBottom: "2px solid #e5e7eb",
};
const cell = {
  color: "#374151",
  fontSize: "13px",
  padding: "8px 12px",
  borderBottom: "1px solid #e5e7eb",
};
const cellRight = { ...cell, textAlign: "right" as const };
const cellCenter = { ...cell, textAlign: "center" as const };
const totalCell = {
  color: "#111827",
  fontSize: "14px",
  fontWeight: 700,
  padding: "12px",
  textAlign: "right" as const,
};
const button = {
  backgroundColor: "#d97706",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 24px",
  textDecoration: "none",
};

function formatPrice(n: number): string {
  return n.toFixed(2);
}

export function OrderNotificationEmail({
  customer,
  order,
  items,
  adminOrderUrl,
}: OrderNotificationEmailProps) {
  const total = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const createdAt = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);

  return (
    <Html lang="el">
      <Head />
      <Preview>Νέα παραγγελία από {customer.name}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Νέα παραγγελία</Heading>
          <Text style={paragraph}>
            <strong>Πελάτης:</strong> {customer.name}
          </Text>
          <Text style={paragraph}>
            <strong>Ημερομηνία:</strong> {createdAt.toLocaleString("el-GR")}
          </Text>
          {order.notes && (
            <Text style={paragraph}>
              <strong>Σημειώσεις:</strong> {order.notes}
            </Text>
          )}

          <Section style={{ margin: "16px 0" }}>
            <Row>
              <Column style={{ ...tableHeader, textAlign: "left" }}>Προϊόν</Column>
              <Column style={{ ...tableHeader, textAlign: "center", width: "60px" }}>Ποσ.</Column>
              <Column style={{ ...tableHeader, textAlign: "right", width: "90px" }}>Τιμή</Column>
              <Column style={{ ...tableHeader, textAlign: "right", width: "90px" }}>Σύνολο</Column>
            </Row>
            {items.map((item) => (
              <Row key={item.id}>
                <Column style={cell}>{item.productName}</Column>
                <Column style={cellCenter}>{item.quantity}</Column>
                <Column style={cellRight}>{formatPrice(Number(item.unitPrice))}€</Column>
                <Column style={cellRight}>
                  {formatPrice(Number(item.unitPrice) * item.quantity)}€
                </Column>
              </Row>
            ))}
            <Row>
              <Column style={totalCell} colSpan={3}>
                Σύνολο:
              </Column>
              <Column style={totalCell}>{formatPrice(total)}€</Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />

          <Section style={{ textAlign: "center" }}>
            <Button href={adminOrderUrl} style={button}>
              Προβολή παραγγελίας
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function subject({ customer }: Pick<OrderNotificationEmailProps, "customer">): string {
  return `Νέα παραγγελία από ${customer.name}`;
}

export default OrderNotificationEmail;

OrderNotificationEmail.PreviewProps = {
  tenant: { name: "Demo Λογαριασμός", slug: "demo" },
  customer: { name: "Παναγιώτης Παπαδόπουλος" },
  order: { notes: "Παράδοση μετά τις 18:00", createdAt: new Date() },
  items: [
    { id: "1", productName: "Μύθος 330ml", quantity: 24, unitPrice: "1.20" },
    { id: "2", productName: "Alpha 500ml", quantity: 12, unitPrice: "1.80" },
  ],
  adminOrderUrl: "https://kavanow.gr/k/demo/admin/orders/preview",
} satisfies OrderNotificationEmailProps;
