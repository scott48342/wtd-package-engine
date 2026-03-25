"use client";

import { useCart } from "@/lib/cart/CartContext";

export function CartIcon() {
  const { getItemCount, setIsOpen } = useCart();
  const count = getItemCount();

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="relative flex items-center justify-center rounded-full p-2 hover:bg-neutral-100 transition-colors"
      aria-label={`Shopping cart with ${count} items`}
    >
      <svg
        className="w-6 h-6 text-neutral-700"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>

      {/* Badge */}
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
