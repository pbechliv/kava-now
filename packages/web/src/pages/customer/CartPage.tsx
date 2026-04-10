import { useState } from "react";
import { useNavigate } from "react-router";
import { useCartStore, setCartSlug } from "../../lib/store/cart";
import { useCreateOrder } from "../../lib/hooks/use-customer-orders";
import { useAuth } from "../../lib/hooks/use-auth";
import { UNIT_LABELS } from "@kava-now/shared";

export function CartPage() {
  const { kava } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (kava?.slug) {
    setCartSlug(kava.slug);
  }

  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalPrice = useCartStore((s) => s.totalPrice);

  const createOrder = useCreateOrder();

  const cartItems = Object.values(items);

  const handleSubmit = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    createOrder.mutate(
      {
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          navigate("/orders");
        },
      },
    );
  };

  if (cartItems.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Καλάθι</h1>
        <div className="mt-8 text-center">
          <p className="text-gray-500">Το καλάθι σας είναι άδειο.</p>
          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Πλοήγηση στον κατάλογο
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Καλάθι</h1>

      {/* Cart items */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Προϊόν</th>
              <th className="pb-2 pr-4 font-medium text-center">Τιμή</th>
              <th className="pb-2 pr-4 font-medium text-center">Ποσότητα</th>
              <th className="pb-2 pr-4 font-medium text-right">Σύνολο</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {cartItems.map((item) => (
              <tr key={item.product.id} className="border-b border-gray-100">
                <td className="py-3 pr-4">
                  <div className="font-medium text-gray-900">
                    {item.product.name}
                  </div>
                  {item.product.brand && (
                    <div className="text-xs text-gray-500">
                      {item.product.brand}
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4 text-center text-gray-700">
                  {item.product.resolvedPrice.toFixed(2)}&euro;
                  <span className="text-xs text-gray-400">
                    /{UNIT_LABELS[item.product.unit]}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.product.id, item.quantity - 1)
                      }
                      className="rounded px-2 py-0.5 text-gray-600 hover:bg-gray-100"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(
                          item.product.id,
                          parseInt(e.target.value) || 1,
                        )
                      }
                      className="w-12 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.product.id, item.quantity + 1)
                      }
                      className="rounded px-2 py-0.5 text-gray-600 hover:bg-gray-100"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right font-medium text-gray-900">
                  {(item.product.resolvedPrice * item.quantity).toFixed(2)}&euro;
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Αφαίρεση"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="mt-6">
        <label
          htmlFor="order-notes"
          className="block text-sm font-medium text-gray-700"
        >
          Σημειώσεις παραγγελίας
        </label>
        <textarea
          id="order-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Προαιρετικές σημειώσεις..."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* Total + Submit */}
      <div className="mt-6 flex items-center justify-between rounded-lg bg-gray-50 p-4">
        <div>
          <span className="text-sm text-gray-600">Σύνολο: </span>
          <span className="text-xl font-bold text-gray-900">
            {totalPrice().toFixed(2)}&euro;
          </span>
        </div>
        <div className="flex gap-2">
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Ακύρωση
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createOrder.isPending}
            className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {createOrder.isPending
              ? "Υποβολή..."
              : confirming
                ? "Επιβεβαίωση Παραγγελίας"
                : "Υποβολή Παραγγελίας"}
          </button>
        </div>
      </div>

      {createOrder.isError && (
        <p className="mt-2 text-sm text-red-600">
          {createOrder.error?.message || "Σφάλμα κατά την υποβολή"}
        </p>
      )}
    </div>
  );
}
