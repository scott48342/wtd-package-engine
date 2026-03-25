"use client";

import { useState } from "react";
import { useCart, type CartWheelItem } from "@/lib/cart/CartContext";

type AddToCartButtonProps = {
  sku: string;
  rearSku?: string;
  brand: string;
  model: string;
  finish?: string;
  diameter?: string;
  width?: string;
  rearWidth?: string;
  offset?: string;
  rearOffset?: string;
  boltPattern?: string;
  imageUrl?: string;
  unitPrice: number;
  fitmentClass?: "surefit" | "specfit" | "extended";
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
  variant?: "primary" | "secondary";
  showPriceInButton?: boolean;
};

export function AddToCartButton({
  sku,
  rearSku,
  brand,
  model,
  finish,
  diameter,
  width,
  rearWidth,
  offset,
  rearOffset,
  boltPattern,
  imageUrl,
  unitPrice,
  fitmentClass,
  vehicle,
  staggered,
  quantity = 4,
  className = "",
  variant = "primary",
  showPriceInButton = true,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = () => {
    setIsAdding(true);

    const item: CartWheelItem = {
      type: "wheel",
      sku,
      rearSku,
      brand,
      model,
      finish,
      diameter,
      width,
      rearWidth,
      offset,
      rearOffset,
      boltPattern,
      imageUrl,
      unitPrice,
      quantity,
      fitmentClass,
      vehicle,
      staggered,
    };

    // Small delay for visual feedback
    setTimeout(() => {
      addItem(item);
      setIsAdding(false);
    }, 150);
  };

  const total = unitPrice * quantity;

  const baseStyles = "flex h-12 items-center justify-center rounded-xl px-4 text-sm font-extrabold transition-all";
  const variantStyles = variant === "primary"
    ? "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]"
    : "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50";

  return (
    <button
      onClick={handleAddToCart}
      disabled={isAdding}
      className={`${baseStyles} ${variantStyles} ${className} ${isAdding ? "opacity-70" : ""}`}
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
      ) : (
        <span>
          Add Wheels — Set of {quantity}
          {showPriceInButton && Number.isFinite(total) && total > 0 ? ` • $${total.toFixed(2)}` : ""}
        </span>
      )}
    </button>
  );
}
