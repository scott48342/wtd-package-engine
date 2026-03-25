"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";

type TireSize = {
  size: string;
  label: string;
  isOem?: boolean;
  isPlusSize?: boolean;
};

type TireMatchingBannerProps = {
  wheelDiameter?: string;
  wheelWidth?: string;
  wheelSku?: string;
  oemSizes: string[];
  plusSizes?: string[];
  selectedSize?: string;
  vehicle?: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    modification?: string;
  };
  baseUrl: string;
};

export function TireMatchingBanner({
  wheelDiameter,
  wheelWidth,
  wheelSku,
  oemSizes,
  plusSizes = [],
  selectedSize,
  vehicle,
  baseUrl,
}: TireMatchingBannerProps) {
  const { getWheels, getTotal, hasWheels, hasTires } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const wheels = mounted ? getWheels() : [];
  const cartWheel = wheels[0];
  const cartTotal = mounted ? getTotal() : 0;

  // Only show if there's wheel context (from URL or cart)
  const hasWheelContext = Boolean(wheelSku || wheelDiameter || cartWheel);
  if (!hasWheelContext) return null;

  const wheelInCart = Boolean(cartWheel);
  const effectiveWheel = cartWheel || {
    brand: "Your Wheel",
    model: wheelSku || "",
    diameter: wheelDiameter,
    width: wheelWidth,
    imageUrl: undefined,
    unitPrice: 0,
    quantity: 4,
  };

  // Build recommended sizes with labels
  const recommendedSizes: TireSize[] = [];

  // Add OEM sizes first
  oemSizes.slice(0, 2).forEach((size, idx) => {
    recommendedSizes.push({
      size,
      label: idx === 0 ? "OEM Recommended" : "OEM Option",
      isOem: true,
    });
  });

  // Add plus sizes
  plusSizes.slice(0, 2).forEach((size) => {
    recommendedSizes.push({
      size,
      label: "Plus Size",
      isPlusSize: true,
    });
  });

  // Build URL for size selection
  function getSizeUrl(size: string) {
    const params = new URLSearchParams();
    if (vehicle?.year) params.set("year", vehicle.year);
    if (vehicle?.make) params.set("make", vehicle.make);
    if (vehicle?.model) params.set("model", vehicle.model);
    if (vehicle?.trim) params.set("trim", vehicle.trim);
    if (vehicle?.modification) params.set("modification", vehicle.modification);
    if (wheelSku) params.set("wheelSku", wheelSku);
    if (wheelDiameter) params.set("wheelDia", wheelDiameter);
    if (wheelWidth) params.set("wheelWidth", wheelWidth);
    params.set("size", size);
    return `${baseUrl}?${params.toString()}`;
  }

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-blue-50 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛞</span>
            <h2 className="text-lg font-extrabold text-neutral-900">
              Complete Your Wheel Package
            </h2>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Add matching tires for your {effectiveWheel.diameter}" wheels
          </p>
        </div>

        {/* Skip option */}
        <Link
          href="/cart"
          className="text-xs font-semibold text-neutral-500 hover:text-neutral-700 hover:underline"
        >
          Skip for now →
        </Link>
      </div>

      {/* Wheel Context Card */}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-3">
        {effectiveWheel.imageUrl ? (
          <div className="w-16 h-16 rounded-lg border border-neutral-100 bg-neutral-50 overflow-hidden flex-shrink-0">
            <img
              src={effectiveWheel.imageUrl}
              alt="Selected wheel"
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-lg border border-neutral-100 bg-neutral-50 flex items-center justify-center text-neutral-400 text-xl flex-shrink-0">
            ⚙️
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-neutral-900 truncate">
            {effectiveWheel.brand} {effectiveWheel.model}
          </div>
          <div className="text-xs text-neutral-600">
            {effectiveWheel.diameter}" × {effectiveWheel.width}" • Set of {effectiveWheel.quantity}
          </div>
          {mounted && cartWheel && cartWheel.unitPrice > 0 ? (
            <div className="text-sm font-bold text-green-700 mt-1">
              ${(cartWheel.unitPrice * cartWheel.quantity).toFixed(2)} in cart
            </div>
          ) : null}
        </div>
        <div className="flex-shrink-0">
          {wheelInCart ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800">
              ✓ In Cart
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">
              Selected
            </span>
          )}
        </div>
      </div>

      {/* Size Selection */}
      {recommendedSizes.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-bold text-neutral-900 mb-2">
            Choose your tire size:
          </div>
          <div className="flex flex-wrap gap-2">
            {recommendedSizes.map((ts) => {
              const isActive = ts.size === selectedSize;
              return (
                <Link
                  key={ts.size}
                  href={getSizeUrl(ts.size)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-neutral-900 text-white"
                      : ts.isOem
                        ? "border border-green-300 bg-green-50 text-green-900 hover:bg-green-100"
                        : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  <span className="font-bold">{ts.size}</span>
                  {!isActive && (
                    <span className="ml-2 text-xs opacity-75">{ts.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Package Summary (when tires in cart) */}
      {mounted && hasTires() ? (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-green-900">
                ✓ Package Ready
              </div>
              <div className="text-xs text-green-700">
                Wheels + Tires selected
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-green-900">
                ${cartTotal.toFixed(2)}
              </div>
              <Link
                href="/cart"
                className="text-xs font-bold text-green-700 hover:underline"
              >
                View package →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Vehicle Fit Confirmation */}
      {vehicle ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
          <span className="text-green-600">✓</span>
          <span>
            Showing tires that fit your {vehicle.year} {vehicle.make} {vehicle.model}
          </span>
        </div>
      ) : null}
    </div>
  );
}
