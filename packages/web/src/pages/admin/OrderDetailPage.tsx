import { useParams } from "react-router";

export function OrderDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Παραγγελία</h1>
      <p className="mt-2 text-sm text-gray-500">ID: {id}</p>
    </div>
  );
}
