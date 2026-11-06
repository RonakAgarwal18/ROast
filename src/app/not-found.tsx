import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <div className="font-display font-bold text-8xl text-groww">404</div>
      <h1 className="font-display text-3xl md:text-4xl font-bold mt-4">
        This dish is <span className="font-accent italic font-normal text-ambery">not on the menu</span>
      </h1>
      <p className="text-muted mt-3 max-w-md mx-auto">
        The page you're after doesn't exist — no receipt for it anywhere in the kitchen.
      </p>
      <div className="mt-8 flex gap-3 justify-center">
        <Link
          href="/league"
          className="rounded-full bg-groww text-black font-display font-bold px-6 py-3 hover:brightness-110"
        >
          Back to the league
        </Link>
        <Link
          href="/add"
          className="rounded-full border-2 border-cream/60 font-display font-bold px-6 py-3 hover:border-groww hover:text-groww"
        >
          Paste an analysis
        </Link>
      </div>
    </div>
  );
}
