import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";

interface SectionFrameProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a sheet section and adds a fullscreen toggle.
 * When expanded, the section renders in a full-viewport overlay.
 */
export function SectionFrame({ title, children, className = "" }: SectionFrameProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  const toggle = (
    <button
      type="button"
      data-readonly-allowed="true"
      onClick={() => setFullscreen((v) => !v)}
      title={fullscreen ? `Exit fullscreen (Esc)` : `Expand ${title} to fullscreen`}
      aria-label={fullscreen ? "Exit fullscreen" : `Expand ${title} to fullscreen`}
      className="absolute top-1 right-1.5 z-20 h-5 w-5 inline-flex items-center justify-center rounded text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/20 transition-colors"
    >
      {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
    </button>
  );

  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[80] bg-[hsl(var(--dash-bg))] flex flex-col">
        <div className="flex-1 overflow-auto sheet-scroll p-3">
          <div className="relative">
            {children}
            {toggle}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className={`relative [&>*:first-child]:h-full ${className}`}>
      {children}
      {toggle}
    </div>
  );
}
