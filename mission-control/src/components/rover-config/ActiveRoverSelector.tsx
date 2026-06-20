import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useMemo,
} from "react";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoverOption {
  id: string;
  name: string;
  tag: string;
  ipAddress: string;
  port: number;
  active: boolean;
}

export interface ActiveRoverSelectorProps {
  rovers: RoverOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void
) {
  useEffect(() => {
    const listener = (e: PointerEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };

    document.addEventListener("pointerdown", listener);

    return () => {
      document.removeEventListener("pointerdown", listener);
    };
  }, [ref, handler]);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx(
        "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
        open ? "rotate-180" : "rotate-0"
      )}
      aria-hidden="true"
    >
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

function IconSignal({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="w-3.5 h-3.5 flex-shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="5"
        className={active ? "fill-[oklch(0.74_0.18_175)]" : "fill-muted-foreground/40"}
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3 text-muted-foreground/60 flex-shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex items-center gap-3 h-11 px-3.5 rounded-2xl border border-border bg-card/60 animate-pulse">
      <div className="w-3.5 h-3.5 rounded bg-muted" />
      <div className="flex-1 h-3 rounded bg-muted" />
      <div className="w-3.5 h-3.5 rounded bg-muted" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveRoverSelector({
  rovers,
  value,
  onChange,
  loading = false,
  disabled = false,
  label = "Active Rover",
  className = "",
}: ActiveRoverSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const uid = useId();

  const labelId = `rover-label-${uid}`;
  const triggerId = `rover-trigger-${uid}`;
  const listId = `rover-list-${uid}`;

  const isDisabled = disabled || loading;

  // ─── Memoized Data ─────────────────────────────────────────────────────────

  const selected = useMemo(
    () => rovers.find((r) => r.id === value) ?? null,
    [rovers, value]
  );

  const onlineRovers = useMemo(
    () => rovers.filter((r) => r.active),
    [rovers]
  );

  const offlineRovers = useMemo(
    () => rovers.filter((r) => !r.active),
    [rovers]
  );

  // ─── Close Handler ─────────────────────────────────────────────────────────

  const close = useCallback(() => {
    setOpen(false);
    setFocusedId(null);

    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  useClickOutside(wrapperRef, close);

  // ─── Select Handler ────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      close();
    },
    [onChange, close]
  );

  // ─── Keyboard Navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isDisabled) return;

      const navigable = onlineRovers;

      if (navigable.length === 0) return;

      if (!open) {
        if (
          ["Enter", " ", "Space", "ArrowDown", "ArrowUp"].includes(e.key)
        ) {
          e.preventDefault();

          setOpen(true);
          setFocusedId(value ?? navigable[0]?.id ?? null);
        }

        return;
      }

      const currentIdx = navigable.findIndex(
        (r) => r.id === focusedId
      );

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          close();
          break;

        case "ArrowDown":
          e.preventDefault();

          setFocusedId(
            navigable[
              Math.min(currentIdx + 1, navigable.length - 1)
            ]?.id ?? null
          );

          break;

        case "ArrowUp":
          e.preventDefault();

          setFocusedId(
            navigable[Math.max(currentIdx - 1, 0)]?.id ?? null
          );

          break;

        case "Home":
          e.preventDefault();
          setFocusedId(navigable[0]?.id ?? null);
          break;

        case "End":
          e.preventDefault();
          setFocusedId(
            navigable[navigable.length - 1]?.id ?? null
          );
          break;

        case "Enter":
        case " ":
        case "Space":
          e.preventDefault();

          if (focusedId) {
            handleSelect(focusedId);
          }

          break;

        case "Tab":
          close();
          break;
      }
    },
    [
      close,
      focusedId,
      handleSelect,
      isDisabled,
      onlineRovers,
      open,
      value,
    ]
  );

  // ─── Scroll Focused Item Into View ─────────────────────────────────────────

  useEffect(() => {
    if (!open || !focusedId || !listRef.current) return;

    const option = document.getElementById(
      `${listId}-option-${focusedId}`
    );

    option?.scrollIntoView({
      block: "nearest",
    });
  }, [focusedId, open, listId]);

  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {/* Accessible Live Region */}
      <div className="sr-only" aria-live="polite">
        {selected
          ? `${selected.name} selected`
          : "No rover selected"}
      </div>

      {/* Label */}
      <label
        id={labelId}
        htmlFor={triggerId}
        className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground select-none"
      >
        {label}
      </label>

      {loading ? (
        <Skeleton />
      ) : (
        <div
          ref={wrapperRef}
          className="relative"
          onKeyDown={handleKeyDown}
        >
          {/* Trigger */}
          <button
            ref={triggerRef}
            id={triggerId}
            type="button"
            role="combobox"
            aria-label="Select active rover"
            aria-labelledby={labelId}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-expanded={open}
            aria-activedescendant={
              focusedId
                ? `${listId}-option-${focusedId}`
                : undefined
            }
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;

              setOpen((prev) => {
                if (!prev) {
                  setFocusedId(
                    value ?? onlineRovers[0]?.id ?? null
                  );
                }

                return !prev;
              });
            }}
            className={clsx(
              "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isDisabled &&
                "border-border bg-card/40 opacity-50 cursor-not-allowed",
              !isDisabled &&
                open &&
                "border-primary/50 bg-card shadow-[0_0_0_3px_rgba(251,146,60,0.08)] ring-1 ring-primary/20",
              !isDisabled &&
                !open &&
                "border-border bg-card/60 hover:border-primary/40"
            )}
          >
            <IconSignal active={selected?.active ?? false} />

            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {selected.name}
                  </p>

                  <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                    {selected.tag} · {selected.ipAddress}:
                    {selected.port}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a rover…
                </p>
              )}
            </div>

            {!selected && onlineRovers.length > 0 && (
              <span className="text-[10px] font-mono text-[oklch(0.74_0.18_175)] bg-[oklch(0.74_0.18_175)]/15 border border-[oklch(0.74_0.18_175)]/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {onlineRovers.length} online
              </span>
            )}

            {selected?.active && (
              <span className="text-[9px] font-bold tracking-widest uppercase text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
                Active
              </span>
            )}

            <IconChevron open={open} />
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className={clsx(
                "absolute z-50 w-full mt-1.5",
                "bg-card border border-border rounded-2xl",
                "shadow-[0_8px_32px_rgba(0,0,0,0.6)]",
                "overflow-hidden",
                "animate-in fade-in slide-in-from-top-1 duration-150"
              )}
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />

                <span className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                  Fleet · {onlineRovers.length} online /{" "}
                  {offlineRovers.length} offline
                </span>
              </div>

              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-labelledby={labelId}
                className="max-h-64 overflow-y-auto py-1"
              >
                {onlineRovers.length > 0 && (
                  <>
                    {onlineRovers.map((rover) => {
                      const optionId = `${listId}-option-${rover.id}`;

                      return (
                        <div
                          key={rover.id}
                          id={optionId}
                          role="option"
                          aria-selected={rover.id === value}
                          data-id={rover.id}
                          onMouseEnter={() =>
                            setFocusedId(rover.id)
                          }
                          onClick={() =>
                            handleSelect(rover.id)
                          }
                          className={clsx(
                            "relative flex items-center gap-3 px-3 py-2.5",
                            "cursor-pointer select-none transition-colors duration-100",
                            rover.id === focusedId
                              ? "bg-primary/10"
                              : "hover:bg-muted"
                          )}
                        >
                          {rover.id === value && (
                            <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />
                          )}

                          <IconSignal active />

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {rover.name}
                            </p>

                            <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                              {rover.tag} · {rover.ipAddress}:
                              {rover.port}
                            </p>
                          </div>

                          {rover.id === value && (
                            <span className="text-[9px] font-bold tracking-widest uppercase text-primary">
                              Active
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {offlineRovers.length > 0 && (
                  <div className="border-t border-border mt-1 pt-1">
                    <div className="px-3 py-1 font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70">
                      Offline · unavailable
                    </div>

                    {offlineRovers.map((rover) => (
                      <div
                        key={rover.id}
                        className="flex items-center gap-3 px-3 py-2 opacity-40 pointer-events-none"
                      >
                        <IconLock />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground truncate">
                            {rover.name}
                          </p>

                          <p className="font-mono text-[10px] text-muted-foreground/70 truncate mt-0.5">
                            {rover.tag} · {rover.ipAddress}:
                            {rover.port}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {rovers.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No rovers configured.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <p className="text-[11px] text-muted-foreground leading-tight">
        {rovers.length === 0
          ? "No rovers available. Add one from the Fleet panel."
          : onlineRovers.length === 0
          ? "All rovers are offline. Offline rovers cannot be selected."
          : "Only online rovers can be set as active."}
      </p>
    </div>
  );
}