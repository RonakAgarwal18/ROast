import { redirect } from "next/navigation";
import { login } from "@/lib/actions";
import { getOwnerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

type SP = { error?: string; next?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const next =
    sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/admin";

  // Already signed in? Straight through.
  if (await getOwnerSession()) redirect(next);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-edge bg-panel p-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Owner <span className="font-accent italic font-normal text-groww">login</span>
        </h1>
        <p className="text-sm text-muted mt-2">
          The league is public to read. Serving, judging and editing are the
          owner&apos;s job only.
        </p>

        {sp.error === "1" && (
          <p className="mt-4 rounded-lg border border-loss/50 bg-base px-3 py-2 text-sm text-loss">
            That email and password don&apos;t match the owner on file.
          </p>
        )}
        {sp.error === "config" && (
          <p className="mt-4 rounded-lg border border-loss/50 bg-base px-3 py-2 text-sm text-loss">
            Login is not configured on this deployment yet (owner env vars missing).
          </p>
        )}

        <form action={login} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="owner@example.com"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${inputCls} mt-1`}
            />
          </label>
          <button className="w-full rounded-full bg-groww text-black font-display font-bold px-4 py-2.5 cursor-pointer hover:brightness-110">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
