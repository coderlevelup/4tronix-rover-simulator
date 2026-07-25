import React, { useEffect, useState } from 'react';

export type Validator = (value: string) => string | null;

interface Props {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  validator?: Validator;
}

export function isYouTubeUrl(value: string) {
  if (!value) return false;
  return /youtube\.com\/watch\?v=|youtu\.be\//.test(value);
}

export function ValidatedInput({ id, label, value, onChange, placeholder, required = false, validator }: Props) {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!touched) return;
    validate(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, touched]);

  function validate(v: string) {
    if (required && !v.trim()) {
      setError('This field is required.');
      return false;
    }
    if (validator) {
      const msg = validator(v);
      setError(msg);
      return !msg;
    }
    setError(null);
    return true;
  }

  return (
    <div className="flex w-full flex-col">
      <label htmlFor={id} className="mb-1 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${error ? 'border-red-600' : 'border-border'}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ValidatedInput;
