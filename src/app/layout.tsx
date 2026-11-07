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

const NAV = [
  { href: "/league", label: "League" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/add", label: "Add Analysis" },
  { href: "/checklists", label: "Checklists" },
  { href: "/calendar", label: "Calendar" },
  { href: "/my-desk", label: "My Desk" },
  { href: "/records", label: "Records" },
];

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
            <nav className="flex gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 rounded-full text-muted hover:text-cream hover:bg-panel2 whitespace-nowrap"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto pill border-ambery/60 text-ambery hidden md:inline-flex">
              Scorekeeper, never tipster
            </span>
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
