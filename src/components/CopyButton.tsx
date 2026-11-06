"use client";

import { useState } from "react";

/** Copy-to-clipboard button for the Prompt Kit. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="pill border-groww/60 text-groww hover:bg-groww-dim cursor-pointer"
    >
      {copied ? "Copied ✓" : "Copy prompt"}
    </button>
  );
}
