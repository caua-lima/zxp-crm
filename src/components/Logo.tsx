import { ZMark } from "./ZMark";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <ZMark className="h-8 w-8 shrink-0 text-dourado" />

      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-[0.18em] text-marfim">
          ZXP CRM
        </span>

        {!compact && (
          <span className="mt-1 text-[10px] tracking-[0.14em] text-marfim/40 uppercase">
            Leads da RUMO
          </span>
        )}
      </span>
    </span>
  );
}
