"use client";

import Link from "next/link";
import { useCart, type CartWheelItem, type CartTireItem } from "@/lib/cart/CartContext";
import { BRAND } from "@/lib/brand";

const FITMENT_LABELS = {
  surefit: { label: "Best Fit", color: "text-green-700", bg: "bg-green-100" },
  specfit: { label: "Good Fit", color: "text-blue-700", bg: "bg-blue-100" },
  extended: { label: "Aggressive Fit", color: "text-orange-700", bg: "bg-orange-100" },
} as const;

function WheelCartItem({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: CartWheelItem;
  onRemove: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  const fitment = item.fitmentClass ? FITMENT_LABELS[item.fitmentClass] : null;
  const total = item.unitPrice * item.quantity;

  return (
    <div className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      {/* Image */}
      <div className="w-28 h-28 flex-shrink-0 rounded-xl border border-neutral-100 bg-neutral-50 overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.model}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
            No image
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-neutral-500">{item.brand}</div>
            <h3 className="font-extrabold text-lg text-neutral-900">{item.model}</h3>
            {item.finish ? (
              <div className="text-sm text-neutral-600">{item.finish}</div>
            ) : null}
          </div>
          {fitment ? (
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${fitment.bg} ${fitment.color}`}>
              {fitment.label}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-600">
          {item.diameter ? <span>{item.diameter}"</span> : null}
          {item.width ? <span>× {item.width}"</span> : null}
          {item.boltPattern ? <span>• {item.boltPattern}</span> : null}
          {item.offset ? <span>• ET{item.offset}</span> : null}
        </div>

        {item.vehicle ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-800">
            <span className="text-green-600">✓</span>
            Fits {item.vehicle.year} {item.vehicle.make} {item.vehicle.model}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600">Qty:</label>
            <select
              value={item.quantity}
              onChange={(e) => onUpdateQty(Number(e.target.value))}
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold"
            >
              {[1, 2, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              onClick={onRemove}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>

          <div className="text-right">
            <div className="text-xl font-extrabold text-neutral-900">
              ${total.toFixed(2)}
            </div>
            <div className="text-xs text-neutral-500">
              ${item.unitPrice.toFixed(2)} each
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TireCartItem({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: CartTireItem;
  onRemove: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  const total = item.unitPrice * item.quantity;

  return (
    <div className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="w-28 h-28 flex-shrink-0 rounded-xl border border-neutral-100 bg-neutral-50 overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.model}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
            No image
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-neutral-500">{item.brand}</div>
        <h3 className="font-extrabold text-lg text-neutral-900">{item.model}</h3>
        <div className="text-sm text-neutral-600">{item.size}</div>

        {item.vehicle ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-800">
            <span className="text-green-600">✓</span>
            Fits {item.vehicle.year} {item.vehicle.make} {item.vehicle.model}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-600">Qty:</label>
            <select
              value={item.quantity}
              onChange={(e) => onUpdateQty(Number(e.target.value))}
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold"
            >
              {[1, 2, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              onClick={onRemove}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>

          <div className="text-right">
            <div className="text-xl font-extrabold text-neutral-900">
              ${total.toFixed(2)}
            </div>
            <div className="text-xs text-neutral-500">
              ${item.unitPrice.toFixed(2)} each
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const {
    items,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getItemCount,
    hasWheels,
    hasTires,
    getWheels,
  } = useCart();

  const total = getTotal();
  const itemCount = getItemCount();
  const wheels = getWheels();
  const vehicle = wheels[0]?.vehicle;

  // Build URLs for next steps
  const tiresParams = new URLSearchParams();
  if (vehicle) {
    tiresParams.set("year", vehicle.year);
    tiresParams.set("make", vehicle.make);
    tiresParams.set("model", vehicle.model);
    if (vehicle.trim) tiresParams.set("trim", vehicle.trim);
    if (vehicle.modification) tiresParams.set("modification", vehicle.modification);
  }
  if (wheels[0]) {
    tiresParams.set("wheelSku", wheels[0].sku);
    if (wheels[0].diameter) tiresParams.set("wheelDia", wheels[0].diameter);
    if (wheels[0].width) tiresParams.set("wheelWidth", wheels[0].width);
  }

  const tiresUrl = `/tires?${tiresParams.toString()}`;

  if (items.length === 0) {
    return (
      <main className="bg-neutral-50 min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h1 className="text-3xl font-extrabold text-neutral-900">Your Cart</h1>
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <div className="text-5xl mb-4">🛒</div>
            <h2 className="text-xl font-bold text-neutral-900">Your cart is empty</h2>
            <p className="mt-2 text-neutral-600">
              Start shopping for wheels and tires that fit your vehicle.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/wheels"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-6 text-sm font-extrabold text-white hover:bg-red-700"
              >
                Shop Wheels
              </Link>
              <Link
                href="/tires"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 text-sm font-extrabold text-neutral-900 hover:bg-neutral-50"
              >
                Shop Tires
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-neutral-50 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold text-neutral-900">
            Your Cart ({itemCount} {itemCount === 1 ? "item" : "items"})
          </h1>
          <button
            onClick={clearCart}
            className="text-sm text-neutral-500 hover:text-red-600 font-medium"
          >
            Clear cart
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Cart Items */}
          <div className="space-y-4">
            {/* Wheels Section */}
            {hasWheels() ? (
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-3">Wheels</h2>
                <div className="space-y-3">
                  {items
                    .filter((i): i is CartWheelItem => i.type === "wheel")
                    .map((item) => (
                      <WheelCartItem
                        key={item.sku}
                        item={item}
                        onRemove={() => removeItem(item.sku, "wheel")}
                        onUpdateQty={(qty) => updateQuantity(item.sku, "wheel", qty)}
                      />
                    ))}
                </div>
              </div>
            ) : null}

            {/* Tires Section */}
            {hasTires() ? (
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-3">Tires</h2>
                <div className="space-y-3">
                  {items
                    .filter((i): i is CartTireItem => i.type === "tire")
                    .map((item) => (
                      <TireCartItem
                        key={item.sku}
                        item={item}
                        onRemove={() => removeItem(item.sku, "tire")}
                        onUpdateQty={(qty) => updateQuantity(item.sku, "tire", qty)}
                      />
                    ))}
                </div>
              </div>
            ) : null}

            {/* Upsell: Add tires if only wheels */}
            {hasWheels() && !hasTires() ? (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">🛞</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-900">Complete your setup with tires</h3>
                    <p className="mt-1 text-sm text-amber-800">
                      Add matching tires for your new wheels and save on installation.
                    </p>
                    <Link
                      href={tiresUrl}
                      className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-5 text-sm font-extrabold text-white hover:bg-amber-700"
                    >
                      Add Tires
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Order Summary */}
          <div className="lg:sticky lg:top-24 h-fit">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-bold text-neutral-900">Order Summary</h2>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Subtotal</span>
                  <span className="font-semibold text-neutral-900">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Shipping</span>
                  <span className="font-semibold text-green-700">FREE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Tax</span>
                  <span className="text-neutral-500">Calculated at checkout</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-200 flex justify-between items-center">
                <span className="text-lg font-bold text-neutral-900">Estimated Total</span>
                <span className="text-2xl font-extrabold text-neutral-900">${total.toFixed(2)}</span>
              </div>

              <div className="mt-5 space-y-3">
                <Link
                  href="/checkout"
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-extrabold text-white hover:bg-red-700"
                >
                  Proceed to Checkout
                </Link>

                {hasWheels() && !hasTires() ? (
                  <Link
                    href={tiresUrl}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 hover:bg-neutral-50"
                  >
                    Add Tires First
                  </Link>
                ) : null}
              </div>

              {/* Trust badges */}
              <div className="mt-5 pt-4 border-t border-neutral-100 space-y-2 text-xs text-neutral-600">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Free shipping on orders over $500</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Guaranteed fitment</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Expert support included</span>
                </div>
              </div>

              <div className="mt-4 text-center">
                <a href={BRAND.links.tel} className="text-sm font-bold text-neutral-700 hover:underline">
                  Questions? Call us
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
