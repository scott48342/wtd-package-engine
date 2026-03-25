"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type CartWheelItem = {
  type: "wheel";
  sku: string;
  rearSku?: string; // For staggered setups
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
  quantity: number;
  fitmentClass?: "surefit" | "specfit" | "extended";
  vehicle?: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    modification?: string;
  };
  staggered?: boolean;
};

export type CartTireItem = {
  type: "tire";
  sku: string;
  rearSku?: string;
  brand: string;
  model: string;
  size: string;
  rearSize?: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  vehicle?: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    modification?: string;
  };
  staggered?: boolean;
};

export type CartItem = CartWheelItem | CartTireItem;

type CartContextValue = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (sku: string, type: "wheel" | "tire") => void;
  updateQuantity: (sku: string, type: "wheel" | "tire", quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getTotal: () => number;
  hasWheels: () => boolean;
  hasTires: () => boolean;
  getWheels: () => CartWheelItem[];
  getTires: () => CartTireItem[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  lastAddedItem: CartItem | null;
};

const CartContext = createContext<CartContextValue | null>(null);

const CART_STORAGE_KEY = "wt_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState<CartItem | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
    setHydrated(true);
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      } catch {
        // Ignore storage errors
      }
    }
  }, [items, hydrated]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      // Check if item already exists (same SKU and type)
      const existingIndex = prev.findIndex(
        (i) => i.sku === item.sku && i.type === item.type
      );

      if (existingIndex >= 0) {
        // Update quantity of existing item
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + item.quantity,
        };
        return updated;
      }

      // Add new item
      return [...prev, item];
    });
    setLastAddedItem(item);
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((sku: string, type: "wheel" | "tire") => {
    setItems((prev) => prev.filter((i) => !(i.sku === sku && i.type === type)));
  }, []);

  const updateQuantity = useCallback(
    (sku: string, type: "wheel" | "tire", quantity: number) => {
      if (quantity <= 0) {
        removeItem(sku, type);
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.sku === sku && i.type === type ? { ...i, quantity } : i
        )
      );
    },
    [removeItem]
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setLastAddedItem(null);
  }, []);

  const getItemCount = useCallback(() => {
    return items.reduce((sum, i) => sum + i.quantity, 0);
  }, [items]);

  const getTotal = useCallback(() => {
    return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }, [items]);

  const hasWheels = useCallback(() => {
    return items.some((i) => i.type === "wheel");
  }, [items]);

  const hasTires = useCallback(() => {
    return items.some((i) => i.type === "tire");
  }, [items]);

  const getWheels = useCallback(() => {
    return items.filter((i): i is CartWheelItem => i.type === "wheel");
  }, [items]);

  const getTires = useCallback(() => {
    return items.filter((i): i is CartTireItem => i.type === "tire");
  }, [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getItemCount,
        getTotal,
        hasWheels,
        hasTires,
        getWheels,
        getTires,
        isOpen,
        setIsOpen,
        lastAddedItem,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
