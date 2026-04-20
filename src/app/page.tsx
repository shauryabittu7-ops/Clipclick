import Link from "next/link";

export default function Home() {
  return (
    <main className="h-full w-full flex flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-4">
        <p className="text-xs tracking-[0.3em] text-[var(--fg-muted)] uppercase">
          Reel · Browser-native video
        </p>
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight max-w-3xl">
          The video editor that runs on{" "}
          <span className="text-[var(--accent)]">your GPU.</span>
        </h1>
        <p className="text-[var(--fg-muted)] max-w-xl mx-auto text-lg">
          Offline-first. Zero-cloud. Captions, color, and export — all in the browser.
        </p>
      </div>
      <Link
        href="/editor"
        className="btn-accent rounded-full px-8 py-3 font-semibold text-base"
      >
        Open Editor →
      </Link>
    </main>
  );
}
