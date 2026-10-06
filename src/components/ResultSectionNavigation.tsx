interface ResultSectionNavigationProps {
  label: string;
  items: Array<{ id: string; label: string }>;
}

export function ResultSectionNavigation({ label, items }: ResultSectionNavigationProps) {
  return (
    <nav aria-label={label} className="lg:col-span-12 flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-4">
      <span className="mr-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">Jump to</span>
      {items.map(({ id, label: itemLabel }) => (
        <a
          key={id}
          href={`#${id}`}
          className="rounded border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {itemLabel}
        </a>
      ))}
    </nav>
  );
}
