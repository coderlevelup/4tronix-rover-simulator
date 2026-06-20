'use client';

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoverType = 'physical' | 'simulator';

export interface RoverConfig {
  name: string;
  tag: string;
  roverType: RoverType;
  ipAddress: string;
  port: number;
}

interface FormValues {
  name: string;
  tag: string;
  roverType: RoverType;
  ipAddress: string;
  port: string;
}

interface FieldError {
  name?: string;
  tag?: string;
  ipAddress?: string;
  port?: string;
}

export interface RoverConfigFormProps {
  /** Populate fields for edit mode; omit for create mode */
  initialValues?: Partial<RoverConfig>;
  /** Called with validated form data on submit */
  onSubmit: (data: RoverConfig) => Promise<void> | void;
  /** Optional cancel handler */
  onCancel?: () => void;
  /** Override the submit button label */
  submitLabel?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const IP_RE =
  /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const TAG_RE = /^[a-z0-9-]+$/;

function validate(values: FormValues): FieldError {
  const errors: FieldError = {};

  if (!values.name.trim()) {
    errors.name = "Rover name is required.";
  } else if (values.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  } else if (values.name.trim().length > 48) {
    errors.name = "Name must be 48 characters or fewer.";
  }

  if (!values.tag.trim()) {
    errors.tag = "Tag is required.";
  } else if (!TAG_RE.test(values.tag.trim())) {
    errors.tag = "Only lowercase letters, numbers, and hyphens.";
  } else if (values.tag.trim().length > 32) {
    errors.tag = "Tag must be 32 characters or fewer.";
  }

  if (!values.ipAddress.trim()) {
    errors.ipAddress = "IP address is required.";
  } else if (!IP_RE.test(values.ipAddress.trim())) {
    errors.ipAddress = "Enter a valid IPv4 address (e.g. 192.168.1.10).";
  }

  const portStr = values.port?.toString().trim();

if (!portStr) {
  errors.port = "Port is required.";
} else if (!/^\d+$/.test(portStr)) {
  errors.port = "Port must be a number.";
} else {
  const portNum = Number(portStr);

  if (portNum < 1 || portNum > 65535) {
    errors.port = "Port must be between 1 and 65535.";
  }
}

  return errors;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground select-none"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[11px] text-destructive leading-tight"
        >
          <span
            aria-hidden
            className="inline-block w-3.5 h-3.5 rounded-full border border-destructive text-destructive text-[9px] text-center leading-[13px] flex-shrink-0"
          >
            !
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase = [
  "w-full bg-card/60 border rounded-2xl px-3 py-2.5",
  "text-sm text-foreground placeholder:text-muted-foreground font-mono",
  "focus:outline-none focus:ring-1 transition-colors duration-150",
].join(" ");

const inputNormal =
  "border-border hover:border-primary/40 focus:border-primary focus:ring-primary/30";
const inputError =
  "border-destructive/60 hover:border-destructive focus:border-destructive focus:ring-destructive/20";

// ─── Main Component ───────────────────────────────────────────────────────────

const EMPTY: FormValues = { name: "", tag: "", roverType: "physical", ipAddress: "", port: "" };

export default function RoverConfigForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
}: RoverConfigFormProps) {
  const isEdit = Boolean(initialValues);
  const defaultLabel = isEdit ? "Save Changes" : "Deploy Rover";

  const [values, setValues] = useState<FormValues>(() => {
    const merged = { ...EMPTY, ...initialValues };
    return {
      ...merged,
      port: typeof merged.port === "number" ? merged.port.toString() : merged.port,
    };
  });
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(false);

  const set = useCallback(
    (field: keyof RoverConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
    },
    []
  );

  const blur = useCallback(
    (_field: keyof RoverConfig) => () => {
      // no-op: validation only happens on submit
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        tag: values.tag.trim(),
        roverType: values.roverType,
        ipAddress: values.ipAddress.trim(),
        port: Number(values.port),
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/40 border-b border-border flex-shrink-0">
        {/* Status dot */}
        <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-glow-mars flex-shrink-0" />
        <p className="font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex-1">
          {isEdit ? "Edit Configuration" : "New Rover Configuration"}
        </p>
        {/* Corner decorations */}
        <div className="flex gap-1.5">
          {["bg-muted-foreground/40", "bg-muted-foreground/40", "bg-primary"].map((c, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${c}`} />
          ))}
        </div>
      </div>

      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Corner tick marks – purely decorative */}
          {[
            "top-0 left-0 border-t border-l",
            "top-0 right-0 border-t border-r",
          ].map((cls, i) => (
            <span
              key={i}
              className={`absolute ${cls} border-primary/30 w-3 h-3 pointer-events-none`}
            />
          ))}

          <form
            onSubmit={handleSubmit}
            noValidate
            className="px-5 sm:px-7 py-6 flex flex-col gap-5"
          >
            {/* Row 1 – Name + Tag */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                id="rover-name"
                label="Rover Name"
                hint="Human-readable display name."
                error={errors.name}
              >
                <input
                  id="rover-name"
                  type="text"
                  placeholder="Perseverance"
                  autoComplete="off"
                  value={values.name}
                  onChange={set("name")}
                  onBlur={blur("name")}
                  disabled={loading}
                  className={`${inputBase} ${errors.name ? inputError : inputNormal}`}
                />
              </Field>

              <Field
                id="rover-tag"
                label="Tag / Identifier"
                hint="slug-style, unique ID."
                error={errors.tag}
              >
                <input
                  id="rover-tag"
                  type="text"
                  placeholder="perseverance-01"
                  autoComplete="off"
                  value={values.tag}
                  onChange={set("tag")}
                  onBlur={blur("tag")}
                  disabled={loading}
                  className={`${inputBase} ${errors.tag ? inputError : inputNormal}`}
                />
              </Field>
            </div>

            {/* Divider */}
            <div className="border-t border-border border-dashed" />

            {/* Rover Type Toggle */}
            <Field
              id="rover-type"
              label="Rover Type"
              hint="Select whether this is a physical rover or simulator."
            >
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setValues(prev => ({ ...prev, roverType: 'physical' }))}
                  disabled={loading}
                  className={`
                    flex-1 px-4 py-3 rounded-2xl border transition-all duration-200
                    ${values.roverType === 'physical'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/60'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl">🤖</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Physical</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setValues(prev => ({ ...prev, roverType: 'simulator' }))}
                  disabled={loading}
                  className={`
                    flex-1 px-4 py-3 rounded-2xl border transition-all duration-200
                    ${values.roverType === 'simulator'
                      ? 'border-[oklch(0.72_0.14_240)] bg-[oklch(0.72_0.14_240)]/12 text-[oklch(0.72_0.14_240)]'
                      : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/60'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl">🖥️</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Simulator</span>
                  </div>
                </button>
              </div>
            </Field>

            {/* Divider */}
            <div className="border-t border-border border-dashed" />

            {/* Row 2 – IP + Port */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
              <Field
                id="rover-ip"
                label="IP Address"
                hint="IPv4 address of the rover."
                error={errors.ipAddress}
              >
                <input
                  id="rover-ip"
                  type="text"
                  inputMode="numeric"
                  placeholder="192.168.0.100"
                  autoComplete="off"
                  value={values.ipAddress}
                  onChange={set("ipAddress")}
                  onBlur={blur("ipAddress")}
                  disabled={loading}
                  className={`${inputBase} ${errors.ipAddress ? inputError : inputNormal}`}
                />
              </Field>

              <Field
                id="rover-port"
                label="Port"
                hint="1 – 65 535"
                error={errors.port}
              >
                <input
                  id="rover-port"
                  type="text"
                  inputMode="numeric"
                  placeholder="8080"
                  autoComplete="off"
                  value={values.port}
                  onChange={set("port")}
                  onBlur={blur("port")}
                  disabled={loading}
                  className={`${inputBase} sm:w-28 ${errors.port ? inputError : inputNormal}`}
                />
              </Field>
            </div>

            {/* Global error count banner */}
            {Object.keys(errors).length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/30 rounded-2xl px-3.5 py-2.5"
              >
                <span className="text-destructive text-sm leading-none mt-0.5">⚠</span>
                <p className="text-xs text-destructive leading-snug">
                  {Object.keys(errors).length === 1
                    ? "Please fix 1 error before continuing."
                    : `Please fix ${Object.keys(errors).length} errors before continuing.`}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={loading}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl border border-border text-sm text-muted-foreground
                             hover:text-foreground hover:border-primary/40 transition-colors duration-150
                             disabled:opacity-40 disabled:cursor-not-allowed tracking-wide"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="
                  relative flex-1 flex items-center justify-center gap-2.5
                  bg-gradient-mars hover:opacity-95 active:opacity-90
                  text-primary-foreground font-bold text-sm tracking-widest uppercase
                  px-6 py-2.5 rounded-2xl
                  transition-colors duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed
                  shadow-glow-mars
                "
              >
                {loading ? (
                  <>
                    {/* Spinner */}
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-30"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                      <path
                        className="opacity-80"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    {/* Icon: rocket / satellite dish */}
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 2L13 8H7L10 2Z" />
                      <path d="M10 8V16" />
                      <path d="M7 14L4 18M13 14L16 18" />
                      <circle cx="10" cy="11" r="2" />
                    </svg>
                    <span>{submitLabel ?? defaultLabel}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 sm:px-7 py-2.5 bg-muted/30 border-t border-border flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
          rover-cfg v1
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {isEdit ? "EDIT MODE" : "CREATE MODE"}
        </span>
      </div>
    </div>
  );
}