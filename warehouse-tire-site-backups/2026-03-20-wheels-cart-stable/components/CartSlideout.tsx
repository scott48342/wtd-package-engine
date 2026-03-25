"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart, type CartWheelItem, type CartTireItem } from "@/lib/cart/CartContext";

const FITMENT_LABELS = {
  surefit: { label: "Best Fit", color: "text-green-700", bg: "bg-green-100" },
  specfit: { label: "Good Fit", color: "text-blue-700", bg: "bg-blue-100" },
  extended: { label: "Aggressive Fit", color: "text-orange-700", bg: "bg-orange-100" },
} as const;

function WheelItemCard({ item }: { item: CartWheelItem }) {
  const fitment = item.fitmentClass ? FITMENT_LABELS[item.fitmentClass] : null;
  const total = item.unitPrice * item.quantity;

  return (
    <div className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      {/* Image */}
      <div className="w-20 h-20 flex-shrink-0 rounded-lg border border-neutral-100 bg-neutral-50 overflow-hidden">
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
        <div className="text-xs font-semibold text-neutral-500">{item.brand}</div>
        <div className="font-extrabold text-neutral-900 truncate">{item.model}</div>
        {item.finish ? (
          <div className="text-sm text-neutral-600">{item.finish}</div>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {item.diameter ? <span className="text-neutral-600">{item.diameter}"</span> : null}
          {item.width ? <span className="text-neutral-600">× {item.width}"</span> : null}
          {item.boltPattern ? (
            <span className="text-neutral-500">• {item.boltPattern}</span>
          ) : null}
        </div>

        {item.staggered && item.rearSku ? (
          <div className="mt-1 text-xs text-amber-700 font-medium">
            Staggered setup (front + rear)
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-extrabold text-neutral-900">
              ${total.toFixed(2)}
            </span>
            <span className="text-neutral-500 ml-1">
              ({item.quantity} × ${item.unitPrice.toFixed(2)})
            </span>
          </div>
          {fitment ? (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${fitment.bg} ${fitment.color}`}>
              {fitment.label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TireItemCard({ item }: { item: CartTireItem }) {
  const total = item.unitPrice * item.quantity;

  return (
    <div className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="w-20 h-20 flex-shrink-0 rounded-lg border border-neutral-100 bg-neutral-50 overflow-hidden">
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
        <div className="text-xs font-semibold text-neutral-500">{item.brand}</div>
        <div className="font-extrabold text-neutral-900 truncate">{item.model}</div>
        <div className="text-sm text-neutral-600">{item.size}</div>

        {item.staggered && item.rearSize ? (
          <div className="mt-1 text-xs text-amber-700 font-medium">
            Staggered: Front {item.size} / Rear {item.rearSize}
          </div>
        ) : null}

        <div className="mt-2 text-sm">
          <span className="font-extrabold text-neutral-900">
            ${total.toFixed(2)}
          </span>
          <span className="text-neutral-500 ml-1">
            ({item.quantity} × ${item.unitPrice.toFixed(2)})
          </span>
        </div>
      </div>
    </div>
  );
}

export function CartSlideout() {
  const router = useRouter();
  const {
    items,
    isOpen,
    setIsOpen,
    lastAddedItem,
    getTotal,
    getItemCount,
    hasWheels,
    hasTires,
    getWheels,
    removeItem,
  } = useCart();

  const slideoutRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, setIsOpen]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        isOpen &&
        slideoutRef.current &&
        !slideoutRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, setIsOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const wheels = getWheels();
  const vehicle = lastAddedItem?.vehicle || wheels[0]?.vehicle;
  const total = getTotal();
  const itemCount = getItemCount();

  // Build tires URL with vehicle and wheel info
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
  const installUrl = `/quote/new?${tiresParams.toString()}`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

      {/* Slideout Panel */}
      <div
        ref={slideoutRef}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-neutral-50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-neutral-900">
              {lastAddedItem ? "Added to Cart!" : "Your Cart"}
            </h2>
            <p className="text-sm text-neutral-600">
              {itemCount} {itemCount === 1 ? "item" : "items"} • ${total.toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-2 hover:bg-neutral-100 transition-colors"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Vehicle Confirmation */}
        {vehicle ? (
          <div className="mx-5 mt-4 rounded-xl bg-green-50 border border-green-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-lg">✓</span>
              <div>
                <div className="text-sm font-bold text-green-900">
                  Fits your {vehicle.year} {vehicle.make} {vehicle.model}
                </div>
                <div className="text-xs text-green-700">Guaranteed fitment</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.map((item) =>
            item.type === "wheel" ? (
              <div key={`wheel-${item.sku}`} className="relative">
                <WheelItemCard item={item} />
                <button
                  onClick={() => removeItem(item.sku, "wheel")}
                  className="absolute top-2 right-2 rounded-full p-1 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
                  aria-label="Remove item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div key={`tire-${item.sku}`} className="relative">
                <TireItemCard item={item} />
                <button
                  onClick={() => removeItem(item.sku, "tire")}
                  className="absolute top-2 right-2 rounded-full p-1 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
                  aria-label="Remove item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          )}
        </div>

        {/* Upsell Section */}
        {hasWheels() && !hasTires() ? (
          <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">🛞</span>
              <div>
                <div className="font-bold text-amber-900">Complete your setup</div>
                <div className="text-sm text-amber-800 mt-1">
                  Add tires that match your new wheels for the complete package.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="border-t border-neutral-200 bg-white px-5 py-4 space-y-3">
          {/* Total */}
          <div className="flex items-center justify-between text-lg">
            <span className="font-semibold text-neutral-700">Total</span>
            <span className="font-extrabold text-neutral-900">${total.toFixed(2)}</span>
          </div>

          {/* Primary CTA - changes based on cart contents */}
          {hasWheels() && !hasTires() ? (
            <Link
              href={tiresUrl}
              onClick={() => setIsOpen(false)}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-extrabold text-white hover:bg-red-700 transition-colors"
            >
              Add Tires to Complete Setup
            </Link>
          ) : (
            <Link
              href="/cart"
              onClick={() => setIsOpen(false)}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-extrabold text-white hover:bg-red-700 transition-colors"
            >
              View Cart / Checkout
            </Link>
          )}

          {/* Secondary actions */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={installUrl}
              onClick={() => setIsOpen(false)}
              className="flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-900 hover:bg-neutral-50 transition-colors"
            >
              Continue to Install
            </Link>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Keep Shopping
            </button>
          </div>

          {/* Trust badges */}
          <div className="pt-3 border-t border-neutral-100 flex flex-wrap justify-center gap-4 text-xs text-neutral-500">
            <span>✓ Free shipping over $500</span>
            <span>✓ Expert support</span>
          </div>
        </div>
      </div>
    </>
  );
}
