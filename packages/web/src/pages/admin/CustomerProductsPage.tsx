import { useParams } from "react-router";

export function CustomerProductsPage() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Προϊόντα Πελάτη</h1>
      <p className="mt-2 text-sm text-gray-500">Πελάτης: {id}</p>
    </div>
  );
}
