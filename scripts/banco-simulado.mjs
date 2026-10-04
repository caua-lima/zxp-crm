/**
 * Sobe um banco SIMULADO (dados fictícios, em memória) para ver e testar o
 * painel sem tocar no banco real — que guarda dados de pessoas de verdade.
 *
 *   node scripts/banco-simulado.mjs
 *
 * Em outro terminal, aponte o painel para ele (valores de TESTE, não segredos):
 *
 *   SUPABASE_URL=http://127.0.0.1:54321
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_chave-so-de-teste-0123456789
 *   ADMIN_PASSWORD=senha-de-teste-bem-longa
 *   AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789ABCD
 *
 * Isto é uma SIMULAÇÃO do subconjunto de PostgREST que o painel usa. Não prova
 * que o Supabase real se comporta igual (ver docs/OPERACAO.md, "O que os testes
 * provam e o que não provam").
 */
import { FakeSupabase } from "../tests/helpers/fake-supabase.ts";

const CHAVE = "sb_secret_chave-so-de-teste-0123456789";
const PORTA = Number(process.env.PORTA ?? 54321);

const banco = new FakeSupabase(CHAVE);
await banco.iniciar(PORTA);

const agora = Date.now();
const h = (horas) => new Date(agora - horas * 3_600_000).toISOString();
const emH = (horas) => new Date(agora + horas * 3_600_000).toISOString();

const nomes = [
  "Ana Beatriz Souza", "João Pedro Lima", "Maria Eduarda Costa", "Lucas Ferreira", "Beatriz Alves",
  "Gabriel Rocha", "Larissa Mendes", "Rafael Oliveira", "Camila Duarte", "Felipe Martins",
  "Isabela Nunes", "Thiago Barbosa", "Júlia Carvalho", "Mateus Ribeiro", "Letícia Araújo",
  "Pedro Henrique Gomes", "Amanda Teixeira", "Bruno Cardoso", "Fernanda Pires", "Vinícius Moreira",
];
const pesos = [
  "Não sei qual curso ou carreira escolher",
  "Escolhi, mas não me identifico mais",
  "Preciso decidir entre trabalhar, empreender ou estudar",
  "A pressão da minha família por uma decisão",
  "Sei o que quero, mas não sei como começar",
];
const status = ["novo", "novo", "contatado", "call_marcada", "call_feita", "fechado", "perdido"];
const idades = ["16 a 17", "18 a 21", "22 a 25", "26 ou mais", "18 a 21", "22 a 25"];

nomes.forEach((nome, i) => {
  banco.semear({
    nome,
    criado_em: h(i * 7 + 0.3),
    whatsapp: `(11) 9${String(1000 + i * 37).padStart(4, "0")}-${String(2000 + i * 91).padStart(4, "0")}`,
    email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@exemplo.com`,
    idade: idades[i % idades.length],
    peso: pesos[i % pesos.length],
    status: status[i % status.length],
    contexto: i % 3 === 0 ? "Estou no segundo semestre e não sei se continuo. Meus pais querem que eu termine." : null,
    confirmacao_responsavel: idades[i % idades.length] === "16 a 17",
    utm_source: i % 4 === 0 ? "instagram" : null,
    utm_campaign: i % 4 === 0 ? "direciona-outubro" : null,
    referrer_host: i % 4 === 0 ? "l.instagram.com" : null,
  });
});

// Casos de borda, para a tela mostrar como se comporta.
banco.semear({ nome: "Cadastro Antigo 16 a 18", idade: "16 a 18", criado_em: h(24 * 40), confirmacao_responsavel: false });
banco.semear({ nome: "Telefone Inválido", whatsapp: "12345", criado_em: h(30) });
banco.semear({
  nome: "Maria Aparecida de Nazaré Conceição dos Santos Albuquerque Montenegro Vasconcelos Figueiredo Bittencourt",
  criado_em: h(1),
  peso: "A pressão da minha família por uma decisão",
  contexto: "ComPalavraLongaSemEspacoNenhumaQueTentaEstourarOLayoutDoCartaoNoCelularParaVerSeOverflowAcontece".repeat(2),
});
banco.semear({ nome: "Pediu Para Não Ser Contatado", nao_contatar_em: h(5), criado_em: h(60), status: "contatado" });
banco.semear({ nome: "Retorno Atrasado", status: "call_marcada", proxima_acao_em: h(26), proxima_acao: "Ligar para confirmar a call", criado_em: h(80) });
banco.semear({ nome: "Retorno de Hoje", status: "contatado", proxima_acao_em: emH(2), proxima_acao: "Enviar o horário da call", criado_em: h(50) });
banco.semear({ nome: "Status Desconhecido", status: "arquivado", criado_em: h(100) });
banco.semear({ nome: "Dado Mínimo", email: "", contexto: null, peso: "", idade: "", criado_em: h(120) });

console.log(`Banco simulado em http://127.0.0.1:${PORTA} com ${banco.leads.length} leads fictícios.`);
console.log("Ctrl+C para encerrar.");

process.on("SIGINT", async () => {
  await banco.parar();
  process.exit(0);
});
