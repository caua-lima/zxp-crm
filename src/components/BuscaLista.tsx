import { definirBusca, limparBusca } from "@/lib/acoes";
import type { FiltroUrl } from "@/lib/navegacao";
import { BUSCA_MAX } from "@/lib/validacao";

/**
 * Busca por nome, telefone ou e-mail.
 *
 * O termo NÃO vai para a URL (ver definirBusca em acoes.ts): quem busca digita
 * nome e telefone de uma pessoa, e isso não deve parar no histórico do
 * navegador nem no log de acesso. Funciona sem JavaScript (form + Server Action).
 */
export function BuscaLista({ termo, filtro }: { termo: string; filtro: FiltroUrl }) {
  return (
    <div className="flex flex-col gap-2">
      <form action={definirBusca} role="search" className="flex gap-2">
        <input type="hidden" name="status" value={filtro ?? ""} />

        <label htmlFor="busca" className="sr-only">
          Buscar por nome, telefone ou e-mail
        </label>

        <input
          id="busca"
          name="busca"
          type="search"
          defaultValue={termo}
          maxLength={BUSCA_MAX}
          autoComplete="off"
          placeholder="Nome, telefone ou e-mail"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-borda bg-onyx-raised px-4 text-texto transition placeholder:text-texto-3 focus:border-dourado/60"
        />

        <button
          type="submit"
          className="min-h-12 rounded-xl border border-borda px-5 text-sm font-semibold text-texto transition hover:border-dourado/50"
        >
          Buscar
        </button>
      </form>

      {termo && (
        <form action={limparBusca} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input type="hidden" name="status" value={filtro ?? ""} />

          <p className="text-sm text-texto-2">
            Buscando por <strong className="font-semibold text-texto [overflow-wrap:anywhere]">“{termo}”</strong>
          </p>

          <button
            type="submit"
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-dourado underline-offset-4 hover:underline"
          >
            Limpar busca
          </button>
        </form>
      )}
    </div>
  );
}
