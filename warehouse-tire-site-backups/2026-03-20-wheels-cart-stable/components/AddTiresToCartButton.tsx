"use client";

import { useState } from "react";
import { useCart, type CartTireItem } from "@/lib/cart/CartContext";

type AddTiresToCartButtonProps = {
  sku: string;
  rearSku?: string;
  brand: string;
  model: string;
  size: string;
  rearSize?: string;
  imageUrl?: string;
  unitPrice: number;
  vehicle?: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    modification?: string;
  };
  staggered?: boolean;
  quantity?: number;
  className?: string;
  variant?: "primary" | "secondary" | "compact";
  showPriceInButton?: boolean;
};

export function AddTiresToCartButton({
  sku,
  rearSku,
  brand,
  model,
  size,
  rearSize,
  imageUrl,
  unitPrice,
  vehicle,
  staggered,
  quantity = 4,
  className = "",
  variant = "primary",
  showPriceInButton = true,
}: AddTiresToCartButtonProps) {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = () => {
    setIsAdding(true);

    const item: CartTireItem = {
      type: "tire",
      sku,
      rearSku,
      brand,
      model,
      size,
      rearSize,
      imageUrl,
      unitPrice,
      quantity,
      vehicle,
      staggered,
    };

    setTimeout(() => {
      addItem(item);
      setIsAdding(false);
    }, 150);
  };

  const total = unitPrice * quantity;

  const baseStyles = {
    primary: "flex h-12 items-center justify-center rounded-xl px-4 text-sm font-extrabold bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition-all",
    secondary: "flex h-11 items-center justify-center rounded-xl px-4 text-sm font-bold border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 transition-all",
    compact: "flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-all",
  };

  return (
    <button
      onClick={handleAddToCart}
      disabled={isAdding}
      className={`${baseStyles[variant]} ${className} ${isAdding ? "opacity-70" : ""}`}
    >
      {isAdding ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Adding...
        </span>
      ) : variant === "compact" ? (
        <span>
          + Add Set of {quantity}
          {showPriceInButton && Number.isFinite(total) && total > 0 ? (
            <span className="ml-1 text-neutral-500">${total.toFixed(0)}</span>
          ) : null}
        </span>
      ) : (
        <span>
          Add Tires — Set of {quantity}
          {showPriceInButton && Number.isFinite(total) && total > 0 ? ` • $${total.toFixed(2)}` : ""}
        </span>
      )}
    </button>
  );
}

// Simplified quick-add for tire cards
export function QuickAddTireButton({
  sku,
  brand,
  model,
  size,
  imageUrl,
  unitPrice,
  vehicle,
  quantity = 4,
}: {
  sku: string;
  brand: string;
  model: string;
  size: string;
  imageUrl?: string;
  unitPrice: number;
  vehicle?: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    modification?: string;
  };
  quantity?: number;
}) {
  const { addItem, hasWheels } = useCart();
  const [isAdding, setIsAdding] = useState(false);

  // Only show quick-add if there are wheels in cart (completing a package)
  if (!hasWheels()) return null;

  const handleAdd = () => {
    setIsAdding(true);
    setTimeout(() => {
      addItem({
        type: "tire",
        sku,
        brand,
        model,
        size,
        imageUrl,
        unitPrice,
        quantity,
        vehicle,
      });
      setIsAdding(false);
    }, 150);
  };

  const total = unitPrice * quantity;

  return (
    <button
      onClick={handleAdd}
      disabled={isAdding}
      className="w-full rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-xs font-bold text-green-800 hover:bg-green-100 transition-colors disabled:opacity-60"
    >
      {isAdding ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Adding...
        </span>
      ) : (
        <span>
          ✓ Add to Package
          {Number.isFinite(total) && total > 0 ? (
            <span className="ml-1 text-green-600">• ${total.toFixed(0)}</span>
          ) : null}
        </span>
      )}
    </button>
  );
}
