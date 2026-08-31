import { corStatus, rotuloStatus, type StatusLead } from "@/lib/lead";

export function EtiquetaStatus({ status }: { status: StatusLead }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${corStatus[status]}`}
    >
      {rotuloStatus[status]}
    </span>
  );
}
