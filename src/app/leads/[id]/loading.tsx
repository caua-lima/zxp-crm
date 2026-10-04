export default function CarregandoLead() {
  const bloco = "animate-pulse rounded-xl bg-marfim/10";

  return (
    <main id="conteudo" aria-busy="true" className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <p role="status" className="sr-only">
        Carregando lead…
      </p>

      <div className={`${bloco} h-5 w-32`} />
      <div className={`${bloco} mt-4 h-8 w-64`} />
      <div className={`${bloco} mt-6 h-14 sm:w-72`} />
      <div className={`${bloco} mt-6 h-28 rounded-2xl`} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={`${bloco} h-64 rounded-2xl`} />
        <div className={`${bloco} h-40 rounded-2xl`} />
      </div>
    </main>
  );
}
