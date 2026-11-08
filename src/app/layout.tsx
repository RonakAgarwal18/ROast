import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk, Inter, Instrument_Serif } from "next/font/google";
import { getOwnerSession } from "@/lib/auth";
import { logout } from "@/lib/actions";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ROast — We ROast the tip, before it burns your money",
  description:
    "ROast is a stock-tip accountability league. AIs serve picks; we keep score — every claim, dated, receipted and judged.",
  openGraph: {
    title: "ROast — We ROast the tip, before it burns your money",
    description:
      "The AI stock-tip accountability league. Paste an analysis, we keep the receipts and judge every claim: WELL-DONE, HALF-COOKED, ROASTED or BURNT.",
    type: "website",
    siteName: "ROast",
  },
  twitter: {
    card: "summary",
    title: "ROast — We ROast the tip, before it burns your money",
    description:
      "AIs serve picks; we keep score. Every tip on record, every verdict with receipts.",
  },
};

// Grouped navigation: the analysis flow is the front door (its own
// button); everything else folds into three dropdowns. A group label
// links to its first page — hover (or keyboard focus) reveals the rest.
const NAV_GROUPS = [
  {
    label: "Portfolios",
    href: "/portfolios",
    items: [
      { href: "/portfolios", label: "Portfolios", desc: "Every AI's book, live P&L" },
      { href: "/checklists", label: "Checklists", desc: "Claims, judged with receipts" },
      { href: "/calendar", label: "Calendar", desc: "Results & events that matter" },
    ],
  },
  {
    label: "Markets",
    href: "/movers",
    items: [
      { href: "/movers", label: "Daily Movers", desc: "Who moved, and the news around it" },
      { href: "/funds", label: "Funds", desc: "Benchmarks every book must beat" },
      { href: "/world", label: "World", desc: "Indices, metals & headlines" },
    ],
  },
  {
    label: "My Desk",
    href: "/my-desk",
    items: [
      { href: "/my-desk", label: "My Desk", desc: "The human's real portfolio" },
      { href: "/records", label: "Records", desc: "The Burnt Bin — verdict history" },
    ],
  },
];

function NavDropdown({ group }: { group: (typeof NAV_GROUPS)[number] }) {
  return (
    <div className="relative group">
      <Link
        href={group.href}
        className="px-3 py-1.5 rounded-full text-muted hover:text-cream hover:bg-panel2 whitespace-nowrap inline-flex items-center gap-1"
      >
        {group.label}
        <span className="text-[9px] opacity-70">▾</span>
      </Link>
      <div className="absolute left-0 top-full pt-2 hidden group-hover:block group-focus-within:block z-50">
        <div className="rounded-xl border border-edge bg-panel p-1.5 min-w-60 shadow-2xl">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg hover:bg-panel2"
            >
              <span className="block text-cream font-medium">{item.label}</span>
              <span className="block text-xs text-muted mt-0.5">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const owner = await getOwnerSession();
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-base text-cream">
        <header className="border-b border-edge/70 sticky top-0 z-40 bg-base/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 flex items-center gap-6 h-14">
            <Link href="/" className="font-display tracking-tight text-xl flex items-center gap-2">
              <Image src="/logo.png" alt="ROast logo" width={30} height={30} className="rounded-md" priority />
              <span className="font-bold">
                RO<span className="text-groww">ast</span>
              </span>
            </Link>
            <nav className="hidden md:flex gap-1 text-sm items-center">
              <Link
                href="/league"
                className="px-3 py-1.5 rounded-full text-muted hover:text-cream hover:bg-panel2 whitespace-nowrap"
              >
                League
              </Link>
              {NAV_GROUPS.map((g) => (
                <NavDropdown key={g.label} group={g} />
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="pill border-ambery/60 text-ambery hidden xl:inline-flex">
                Scorekeeper, never tipster
              </span>
              <Link
                href="/add"
                className="rounded-full bg-groww text-black font-display font-bold px-4 py-1.5 text-sm hover:brightness-110 whitespace-nowrap"
              >
                + Add Analysis
              </Link>
              <details className="relative md:hidden">
                <summary className="px-3 py-1.5 rounded-full border border-edge text-sm cursor-pointer list-none">
                  Menu
                </summary>
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-edge bg-panel p-2 shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
                  <Link href="/league" className="block px-3 py-2 rounded-lg hover:bg-panel2 font-medium">
                    League
                  </Link>
                  {NAV_GROUPS.map((g) => (
                    <div key={g.label} className="mt-2">
                      <div className="px-3 py-1 text-[11px] uppercase tracking-widest text-muted">
                        {g.label}
                      </div>
                      {g.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block px-3 py-2 rounded-lg hover:bg-panel2"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-edge/70 mt-16">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted flex flex-wrap gap-3 justify-between items-center">
            <span>
              RO<span className="text-groww">ast</span> — every tip on record, every verdict with receipts.
            </span>
            <span className="text-cream/80 font-semibold">
              We don't recommend anything. We only keep score.
            </span>
            <span className="flex gap-4 items-center">
              <Link href="/admin" className="hover:text-groww">
                Price updates
              </Link>
              {owner ? (
                <form action={logout} className="inline-flex">
                  <button className="hover:text-groww cursor-pointer">Owner logout</button>
                </form>
              ) : (
                <Link href="/login" className="hover:text-groww">
                  Owner login
                </Link>
              )}
              <span>Paper portfolios only. Not investment advice.</span>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
