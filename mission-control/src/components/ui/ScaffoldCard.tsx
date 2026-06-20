import type { ReactNode } from 'react';

type ScaffoldCardProps = {
  eyebrow: string;
  title: string;
  body: string;
  todos?: string[];
  children?: ReactNode;
};

export function ScaffoldCard({
  eyebrow,
  title,
  body,
  todos,
  children,
}: ScaffoldCardProps) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-slate-50">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>

      {todos && todos.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-slate-400">
          {todos.map((todo) => (
            <li key={todo} className="rounded-2xl bg-slate-950/70 px-4 py-3">
              {todo}
            </li>
          ))}
        </ul>
      )}

      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
