"use client";

// Search-as-you-type stock picker (Groww/Zerodha style), replacing the
// native <select> that tried to list all 5,000+ stocks. Renders a
// hidden input with the chosen stock's id under the given field name,
// so it drops into any server-action form unchanged.
import { useEffect, useRef, useState } from "react";

type Hit = {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  lastClose: number | null;
};

const inr = (n: number | null) =>
  n == null ? "—" : "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function StockPicker({
  name,
  initial,
}: {
  name: string;
  initial?: Hit | null;
}) {
  const [selected, setSelected] = useState<Hit | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as Hit[];
        if (seq.current === my) {
          setHits(data);
          setActive(0);
        }
      } catch {
        if (seq.current === my) setHits([]);
      } finally {
        if (seq.current === my) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (h: Hit) => {
    setSelected(h);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative w-80 max-w-full">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="w-full rounded-lg border border-edge bg-base px-3 py-2 text-sm text-left hover:border-groww/60 cursor-pointer"
        >
          <span className="font-semibold text-cream">{selected.symbol}</span>{" "}
          <span className="text-muted">· {selected.name}</span>
          <span className="float-right text-muted">{inr(selected.lastClose)}</span>
          <span className="block text-[11px] text-groww mt-0.5">Selected — tap to change</span>
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            value={query}
            required={!selected}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder="Search stocks — try RELIANCE, Tata, GESHIP…"
            className="w-full rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60"
            autoComplete="off"
          />
          {open && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-edge bg-panel shadow-2xl overflow-hidden">
              {loading && hits.length === 0 && (
                <div className="px-3 py-2.5 text-sm text-muted">Searching…</div>
              )}
              {!loading && hits.length === 0 && (
                <div className="px-3 py-2.5 text-sm text-muted">
                  No stock matches “{query}” in the master.
                </div>
              )}
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(h)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-baseline gap-2 ${
                    i === active ? "bg-panel2" : ""
                  }`}
                >
                  <span className="font-semibold text-cream shrink-0">{h.symbol}</span>
                  <span className="pill shrink-0">{h.exchange}</span>
                  <span className="text-muted truncate flex-1">{h.name}</span>
                  <span className="text-cream/80 shrink-0">{inr(h.lastClose)}</span>
                </button>
              ))}
              {hits.length > 0 && (
                <div className="px-3 py-1.5 text-[11px] text-muted border-t border-edge/60">
                  ↑↓ navigate · Enter to select · prices are the last close
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
