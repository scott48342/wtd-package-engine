"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { FavoritesButton } from "@/components/FavoritesButton";
import { useCart } from "@/lib/cart/CartContext";

export type WheelFinishThumb = {
  finish: string;
  sku: string;
  imageUrl?: string;
  price?: number;
  pair?: WheelPair;
};

export type WheelPick = {
  sku: string;
  diameter?: string;
  width?: string;
  offset?: string;
};

export type WheelPair = {
  staggered: boolean;
  front: WheelPick;
  rear?: WheelPick;
};

function fmtSizePart(v: string) {
  const s = String(v || "").trim();
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toString();
}

// Fitment configuration with accent colors
const FITMENT_CONFIG = {
  surefit: {
    label: "Best Fit",
    confidence: "Direct fit for your vehicle",
    accentColor: "bg-green-500",
    badgeBg: "bg-green-100",
    badgeText: "text-green-800",
    badgeBorder: "border-green-200",
  },
  specfit: {
    label: "Good Fit",
    confidence: "Fits your vehicle • Aftermarket setup",
    accentColor: "bg-blue-500",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    badgeBorder: "border-blue-200",
  },
  extended: {
    label: "Aggressive Fit",
    confidence: "Fits your vehicle • Custom fitment",
    accentColor: "bg-orange-500",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-800",
    badgeBorder: "border-orange-200",
  },
} as const;

export function WheelsStyleCard({
  brand,
  title,
  baseSku,
  baseFinish,
  baseImageUrl,
  price,
  sizeLabel,
  finishThumbs,
  viewParams,
  specLabel,
  selectToTires,
  pair,
  fitmentClass,
  isPopular,
}: {
  brand: string;
  title: string;
  baseSku: string;
  baseFinish?: string;
  baseImageUrl?: string;
  price?: number;
  sizeLabel?: { diameter?: string; width?: string };
  finishThumbs?: WheelFinishThumb[];
  viewParams?: Record<string, string | undefined>;
  specLabel?: { boltPattern?: string; offset?: string };
  selectToTires?: boolean;
  pair?: WheelPair;
  fitmentClass?: "surefit" | "specfit" | "extended";
  isPopular?: boolean;
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const thumbs = useMemo(() => (finishThumbs || []).filter((t) => t?.sku), [finishThumbs]);

  const [selectedSku, setSelectedSku] = useState<string>(baseSku);
  const [selectedImage, setSelectedImage] = useState<string | undefined>(baseImageUrl);
  const [selectedFinish, setSelectedFinish] = useState<string | undefined>(baseFinish);
  const [selectedPrice, setSelectedPrice] = useState<number | undefined>(price);
  const [selectedPair, setSelectedPair] = useState<WheelPair | undefined>(pair);
  const [isQuickAdding, setIsQuickAdding] = useState(false);

  const fromPrice = useMemo(() => {
    const ps = (finishThumbs || [])
      .map((t) => (typeof t?.price === "number" ? t.price : null))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!ps.length) return undefined;
    return Math.min(...ps);
  }, [finishThumbs]);

  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(viewParams || {})) {
      if (v) sp.set(k, v);
    }
    if (!sp.get("year") || !sp.get("make") || !sp.get("model")) {
      sp.delete("year");
      sp.delete("make");
      sp.delete("model");
      sp.delete("trim");
      sp.delete("modification");
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [viewParams]);

  const viewHref = `/wheels/${encodeURIComponent(selectedSku || baseSku)}${qs}`;

  function selectAndGoToTires() {
    const sku = selectedSku || baseSku;
    const p = selectedPair;
    const front = p?.front?.sku ? p.front : { sku, diameter: sizeLabel?.diameter, width: sizeLabel?.width, offset: specLabel?.offset };
    const rear = p?.staggered && p?.rear?.sku ? p.rear : undefined;

    try {
      localStorage.setItem(
        "wt_selected_wheel",
        JSON.stringify({
          sku: front.sku,
          brand,
          title,
          finish: selectedFinish,
          price: selectedPrice,
          imageUrl: selectedImage,
          diameter: front.diameter ?? sizeLabel?.diameter,
          width: front.width ?? sizeLabel?.width,
          boltPattern: specLabel?.boltPattern,
          offset: front.offset ?? specLabel?.offset,
          rearSku: rear?.sku,
          rearDiameter: rear?.diameter,
          rearWidth: rear?.width,
          rearOffset: rear?.offset,
          staggered: Boolean(rear?.sku),
        })
      );
    } catch {
      // ignore
    }

    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(viewParams || {})) {
      if (v) sp.set(k, v);
    }
    if (!sp.get("year") || !sp.get("make") || !sp.get("model")) {
      sp.delete("year");
      sp.delete("make");
      sp.delete("model");
      sp.delete("trim");
      sp.delete("modification");
    }

    sp.set("wheelSku", front.sku);
    sp.set("wheelSkuFront", front.sku);
    if (rear?.sku) sp.set("wheelSkuRear", rear.sku);

    const dia = front.diameter ?? sizeLabel?.diameter;
    const wFront = front.width ?? sizeLabel?.width;
    const wRear = rear?.width;

    if (dia) sp.set("wheelDia", String(dia));
    if (dia) sp.set("wheelDiaFront", String(dia));
    if (rear?.diameter) sp.set("wheelDiaRear", String(rear.diameter));

    if (wFront) sp.set("wheelWidth", String(wFront));
    if (wFront) sp.set("wheelWidthFront", String(wFront));
    if (wRear) sp.set("wheelWidthRear", String(wRear));

    router.push(`/tires?${sp.toString()}`);
  }

  function quickAddToCart() {
    setIsQuickAdding(true);
    
    // Build vehicle object from viewParams
    const year = viewParams?.year;
    const make = viewParams?.make;
    const model = viewParams?.model;
    const trim = viewParams?.trim;
    const modification = viewParams?.modification;
    
    const vehicle = year && make && model
      ? { year, make, model, trim: trim || undefined, modification: modification || undefined }
      : undefined;

    setTimeout(() => {
      addItem({
        type: "wheel",
        sku: selectedSku || baseSku,
        brand,
        model: title,
        finish: selectedFinish,
        diameter: sizeLabel?.diameter,
        width: sizeLabel?.width,
        offset: specLabel?.offset,
        boltPattern: specLabel?.boltPattern,
        imageUrl: selectedImage,
        unitPrice: typeof selectedPrice === "number" ? selectedPrice : 0,
        quantity: 4,
        fitmentClass,
        vehicle,
      });
      setIsQuickAdding(false);
    }, 150);
  }

  const bolt = specLabel?.boltPattern ? String(specLabel.boltPattern).trim() : "";
  const fitConfig = fitmentClass ? FITMENT_CONFIG[fitmentClass] : null;
  const accentColor = fitConfig?.accentColor || "bg-neutral-300";

  return (
    <div className="relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 hover:shadow-md transition-shadow">
      {/* Fitment-based left accent bar */}
      <div className={`pointer-events-none absolute left-0 top-0 h-full w-1 ${accentColor}`} />

      {/* Popular badge - absolute positioned */}
      {isPopular ? (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            🔥 Popular
          </span>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-600">{brand}</div>
          {/* Fitment badge */}
          {fitConfig ? (
            <div className="mt-1">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${fitConfig.badgeBg} ${fitConfig.badgeText} ${fitConfig.badgeBorder}`}>
                {fitConfig.label}
              </span>
            </div>
          ) : null}
        </div>
        <FavoritesButton
          type="wheel"
          sku={selectedSku || baseSku}
          label={`${brand} ${title}${selectedFinish ? ` - ${selectedFinish}` : ""}`}
          href={viewHref}
          imageUrl={selectedImage}
        />
      </div>

      {selectToTires ? (
        <button
          type="button"
          onClick={() => selectAndGoToTires()}
          className="block w-full text-left"
        >
          <h3 className="mt-1 text-base font-extrabold tracking-tight text-neutral-900">{title}</h3>
          {selectedFinish ? <div className="mt-1 text-sm text-neutral-600">{selectedFinish}</div> : null}

          {/* Size display */}
          {selectedPair?.front?.diameter || selectedPair?.front?.width || sizeLabel?.diameter || sizeLabel?.width ? (
            <div className="mt-2 grid gap-1 text-sm font-semibold text-neutral-700">
              <div>
                {selectedPair?.staggered && selectedPair?.rear?.sku ? "Front: " : ""}
                {fmtSizePart(selectedPair?.front?.diameter || sizeLabel?.diameter || "")}
                {(selectedPair?.front?.diameter || sizeLabel?.diameter) && (selectedPair?.front?.width || sizeLabel?.width) ? "×" : ""}
                {fmtSizePart(selectedPair?.front?.width || sizeLabel?.width || "")}
                {bolt ? <span className="text-neutral-500 ml-2">• {bolt}</span> : null}
              </div>
              {selectedPair?.staggered && selectedPair?.rear?.sku ? (
                <div>
                  Rear: {fmtSizePart(selectedPair?.rear?.diameter || selectedPair?.front?.diameter || "")}
                  {(selectedPair?.rear?.diameter || selectedPair?.front?.diameter) && selectedPair?.rear?.width ? "×" : ""}
                  {fmtSizePart(selectedPair?.rear?.width || "")}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Fitment confidence text */}
          {fitConfig ? (
            <div className="mt-2 text-xs text-neutral-600">
              <span className="text-green-600">✓</span> {fitConfig.confidence}
            </div>
          ) : null}

          {/* Product image */}
          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={title}
                className="h-48 w-full object-contain bg-white"
                loading="lazy"
              />
            ) : (
              <div className="grid h-48 place-items-center bg-white p-3 text-center">
                <div>
                  <div className="text-xs font-extrabold text-neutral-900">Image coming soon</div>
                  <div className="mt-1 text-[11px] text-neutral-600">{brand}</div>
                </div>
              </div>
            )}
          </div>
        </button>
      ) : (
        <Link href={viewHref} className="block">
          <h3 className="mt-1 text-base font-extrabold tracking-tight text-neutral-900">{title}</h3>
          {selectedFinish ? <div className="mt-1 text-sm text-neutral-600">{selectedFinish}</div> : null}

          {/* Size display */}
          {selectedPair?.front?.diameter || selectedPair?.front?.width || sizeLabel?.diameter || sizeLabel?.width ? (
            <div className="mt-2 grid gap-1 text-sm font-semibold text-neutral-700">
              <div>
                {selectedPair?.staggered && selectedPair?.rear?.sku ? "Front: " : ""}
                {fmtSizePart(selectedPair?.front?.diameter || sizeLabel?.diameter || "")}
                {(selectedPair?.front?.diameter || sizeLabel?.diameter) && (selectedPair?.front?.width || sizeLabel?.width) ? "×" : ""}
                {fmtSizePart(selectedPair?.front?.width || sizeLabel?.width || "")}
                {bolt ? <span className="text-neutral-500 ml-2">• {bolt}</span> : null}
              </div>
              {selectedPair?.staggered && selectedPair?.rear?.sku ? (
                <div>
                  Rear: {fmtSizePart(selectedPair?.rear?.diameter || selectedPair?.front?.diameter || "")}
                  {(selectedPair?.rear?.diameter || selectedPair?.front?.diameter) && selectedPair?.rear?.width ? "×" : ""}
                  {fmtSizePart(selectedPair?.rear?.width || "")}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Fitment confidence text */}
          {fitConfig ? (
            <div className="mt-2 text-xs text-neutral-600">
              <span className="text-green-600">✓</span> {fitConfig.confidence}
            </div>
          ) : null}

          {/* Product image */}
          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={title}
                className="h-48 w-full object-contain bg-white"
                loading="lazy"
              />
            ) : (
              <div className="grid h-48 place-items-center bg-white p-3 text-center">
                <div>
                  <div className="text-xs font-extrabold text-neutral-900">Image coming soon</div>
                  <div className="mt-1 text-[11px] text-neutral-600">{brand}</div>
                </div>
              </div>
            )}
          </div>
        </Link>
      )}

      {/* Finish thumbnails */}
      {thumbs.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {thumbs.slice(0, 8).map((t) => {
            const active = t.sku === selectedSku;
            return (
              <button
                key={t.sku}
                type="button"
                onClick={() => {
                  setSelectedSku(t.sku);
                  setSelectedFinish(t.finish);
                  if (t.imageUrl) setSelectedImage(t.imageUrl);
                  if (typeof t.price === "number") setSelectedPrice(t.price);
                }}
                className={
                  "overflow-hidden rounded-lg border bg-white " +
                  (active ? "border-neutral-900" : "border-neutral-200 hover:border-neutral-300")
                }
                title={t.finish}
                aria-pressed={active}
              >
                {t.imageUrl ? (
                  <img src={t.imageUrl} alt={t.finish} className="h-10 w-10 object-contain" loading="lazy" />
                ) : (
                  <div className="h-10 w-10 bg-neutral-50" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Finish dropdown - shown when multiple finishes available */}
      {thumbs.length > 1 ? (
        <div className="mt-3">
          <label className="text-[11px] font-semibold text-neutral-600">Finish</label>
          <select
            value={selectedFinish || ""}
            onChange={(e) => {
              const fin = e.target.value;
              const hit = thumbs.find((t) => String(t.finish) === fin);
              setSelectedFinish(fin);
              if (hit?.sku) setSelectedSku(hit.sku);
              if (hit?.imageUrl) setSelectedImage(hit.imageUrl);
              if (typeof hit?.price === "number") setSelectedPrice(hit.price);
              if (hit?.pair) setSelectedPair(hit.pair);
            }}
            className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold"
          >
            {thumbs.map((t) => (
              <option key={t.sku || t.finish} value={t.finish}>
                {t.finish}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Price */}
      <div className="mt-4">
        <div className="text-2xl font-extrabold text-neutral-900">
          {typeof selectedPrice === "number"
            ? `$${selectedPrice.toFixed(2)}`
            : (typeof fromPrice === "number" ? `From $${fromPrice.toFixed(2)}` : "Call for price")}
        </div>
        <div className="text-sm text-neutral-600">each</div>
      </div>

      {/* Install & Trust messaging */}
      <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-neutral-700">
          <span className="text-green-600">✓</span>
          <span>Install available near you</span>
          <span className="text-neutral-400">📍</span>
        </div>
        <div className="text-neutral-500">
          Guaranteed fitment for your vehicle
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4 space-y-2">
        {/* Primary: View Details */}
        {selectToTires ? (
          <button
            type="button"
            onClick={() => selectAndGoToTires()}
            className="w-full rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-extrabold text-white hover:bg-red-700"
          >
            View Details
          </button>
        ) : (
          <Link
            href={viewHref}
            className="block w-full rounded-xl bg-red-600 px-4 py-3 text-center text-sm font-extrabold text-white hover:bg-red-700"
          >
            View Details
          </Link>
        )}

        {/* Secondary: Quick Add */}
        <button
          type="button"
          onClick={quickAddToCart}
          disabled={isQuickAdding}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2 text-center text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition-colors disabled:opacity-60"
        >
          {isQuickAdding ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Adding...
            </span>
          ) : (
            <span>
              Quick Add Set of 4
              {typeof selectedPrice === "number" && selectedPrice > 0 ? (
                <span className="text-neutral-500 ml-1">• ${(selectedPrice * 4).toFixed(0)}</span>
              ) : null}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
