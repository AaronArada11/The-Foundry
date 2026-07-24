import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export function Field({
  label,
  htmlFor,
  error,
  helper,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className={error ? "field field--error" : "field"}>
      {htmlFor ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {children}
      {helper ? <span className="field-helper">{helper}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="text-input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select-input" {...props} />;
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="inline-message inline-message--error" role="alert">
      <span className="message-marker">!</span>
      <span>{children}</span>
    </div>
  );
}

export function InlineNote({ children }: { children: ReactNode }) {
  return (
    <div className="inline-message inline-message--note">
      <span className="message-marker">i</span>
      <span>{children}</span>
    </div>
  );
}
