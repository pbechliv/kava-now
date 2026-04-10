import { useProfile } from "../../lib/hooks/use-profile";

export function ProfilePage() {
  const { data: customer, isLoading } = useProfile();

  if (isLoading) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">Φόρτωση...</div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center text-sm text-gray-500 py-8">
        Δεν βρέθηκε προφίλ πελάτη.
      </div>
    );
  }

  const fields = [
    { label: "Επωνυμία", value: customer.name },
    { label: "Email", value: customer.email },
    { label: "Τηλέφωνο", value: customer.phone },
    { label: "Υπεύθυνος επικοινωνίας", value: customer.contactPerson },
    { label: "Διεύθυνση", value: customer.address },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Προφίλ</h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex flex-col sm:flex-row sm:items-center px-4 py-3"
            >
              <dt className="text-sm font-medium text-gray-500 sm:w-48">
                {field.label}
              </dt>
              <dd className="mt-1 sm:mt-0 text-sm text-gray-900">
                {field.value || (
                  <span className="text-gray-400">-</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Για αλλαγές στα στοιχεία σας, επικοινωνήστε με τον προμηθευτή σας.
      </p>
    </div>
  );
}
