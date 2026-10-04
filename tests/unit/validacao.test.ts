import { describe, expect, it } from "vitest";

import { codificarCursor, decodificarCursor } from "@/lib/cursor";
import { camposEditaveis, lerDetalhe, lerEvento, lerResumo } from "@/lib/lead";
import {
  OBSERVACOES_MAX,
  digitosDeBusca,
  ehTimestampIso,
  ehUuid,
  ehVersao,
  sanitizarBusca,
  validarObservacoes,
  validarProximaAcao,
} from "@/lib/validacao";

const ID = "0a9c9026-d9b6-4397-a1e2-c81c9ad737ec";

describe("validações básicas", () => {
  it("uuid", () => {
    expect(ehUuid(ID)).toBe(true);
    expect(ehUuid("nao-e-uuid")).toBe(false);
    expect(ehUuid("")).toBe(false);
    expect(ehUuid(`${ID}'; drop table leads;--`)).toBe(false);
    expect(ehUuid(123)).toBe(false);
  });

  it("versão é inteiro positivo", () => {
    expect(ehVersao(1)).toBe(true);
    expect(ehVersao(0)).toBe(false);
    expect(ehVersao(1.5)).toBe(false);
    expect(ehVersao("1")).toBe(false);
    expect(ehVersao(2 ** 40)).toBe(false);
  });

  it("timestamp ISO", () => {
    expect(ehTimestampIso("2026-08-31T00:17:16.886342+00:00")).toBe(true);
    expect(ehTimestampIso("2026-08-31T00:17:16Z")).toBe(true);
    expect(ehTimestampIso("2026-08-31")).toBe(false);
    expect(ehTimestampIso("2026-13-45T00:00:00Z")).toBe(false);
    expect(ehTimestampIso("x".repeat(100))).toBe(false);
  });

  it("anotações: aceita exatamente o limite, rejeita acima", () => {
    expect(validarObservacoes("x".repeat(OBSERVACOES_MAX))).toBeNull();
    expect(validarObservacoes("x".repeat(OBSERVACOES_MAX + 1))).toMatch(/5\.000 caracteres/);
    expect(validarObservacoes(50_000 as unknown as string)).not.toBeNull();
  });

  it("próxima ação: limite de 120", () => {
    expect(validarProximaAcao("x".repeat(120))).toBeNull();
    expect(validarProximaAcao("x".repeat(121))).not.toBeNull();
  });
});

describe("sanitizarBusca — o termo vira parte de uma expressão PostgREST", () => {
  it("mantém nome, e-mail e telefone", () => {
    expect(sanitizarBusca("Ana Souza")).toBe("Ana Souza");
    expect(sanitizarBusca("ana.souza+crm@exemplo.com")).toBe("ana.souza+crm@exemplo.com");
    expect(sanitizarBusca("João da Conceição")).toBe("João da Conceição");
  });

  it.each([
    ['ana"),status.eq.fechado,nome.ilike.("', "anastatus.eq.fechadonome.ilike."],
    ["a,b", "ab"],
    ["(ana)", "ana"],
    ["100%", "100"],
    ["a*b", "ab"],
    ["a\\b", "ab"],
    ["a  \t  b", "a b"],
  ])("neutraliza caracteres de estrutura: %j", (entrada, esperado) => {
    const saida = sanitizarBusca(entrada);

    expect(saida).toBe(esperado);
    expect(saida).not.toMatch(/[,()"*%\\]/);
  });

  it("limita o tamanho e aceita lixo sem lançar", () => {
    expect(sanitizarBusca("a".repeat(500))).toHaveLength(60);
    expect(sanitizarBusca(undefined)).toBe("");
    expect(sanitizarBusca(42)).toBe("");
  });

  it("dígitos de busca: tira máscara e DDI, exige 4+", () => {
    expect(digitosDeBusca("(11) 91234-5678")).toBe("11912345678");
    expect(digitosDeBusca("+55 11 91234-5678")).toBe("11912345678");
    expect(digitosDeBusca("91234")).toBe("91234");
    expect(digitosDeBusca("123")).toBeNull();
    expect(digitosDeBusca("ana")).toBeNull();
    expect(digitosDeBusca("ana 12345")).toBeNull();
  });
});

describe("cursor de paginação", () => {
  const cursor = { c: "2026-08-31T00:17:16.886342+00:00", i: ID };

  it("ida e volta", () => {
    expect(decodificarCursor(codificarCursor(cursor))).toEqual(cursor);
  });

  it.each([
    "",
    "lixo!!",
    "a".repeat(500),
    Buffer.from("não é json").toString("base64url"),
    Buffer.from(JSON.stringify({ c: "x", i: ID })).toString("base64url"),
    Buffer.from(JSON.stringify({ c: cursor.c, i: "1; drop table" })).toString("base64url"),
    Buffer.from(JSON.stringify([1, 2])).toString("base64url"),
  ])("cursor adulterado vira null, não chega ao banco: %j", (entrada) => {
    expect(decodificarCursor(entrada)).toBeNull();
  });

  it("não aceita o que não é texto", () => {
    expect(decodificarCursor(undefined)).toBeNull();
    expect(decodificarCursor(["a"])).toBeNull();
  });
});

describe("leitura defensiva de linhas do banco (dado legado)", () => {
  const base = { id: ID, nome: "Ana", status: "novo", versao: 3, criado_em: "2026-08-31T00:00:00Z" };

  it("linha completa", () => {
    const r = lerResumo({ ...base, idade: "16 a 17", peso: "Outro" });

    expect(r).toMatchObject({ id: ID, nome: "Ana", status: "novo", versao: 3, idade: "16 a 17" });
  });

  it("campos ausentes viram neutros — não derrubam", () => {
    const d = lerDetalhe({ id: ID });

    expect(d).toMatchObject({
      nome: "(sem nome)",
      status: "desconhecido",
      versao: 1,
      whatsapp: "",
      email: "",
      contexto: null,
      observacoes: null,
      confirmacao_responsavel: false,
      proxima_acao_em: null,
    });
  });

  it("status desconhecido aparece como 'desconhecido', não em branco", () => {
    expect(lerResumo({ ...base, status: "arquivado" })?.status).toBe("desconhecido");
    expect(lerResumo({ ...base, status: null })?.status).toBe("desconhecido");
  });

  it("tipos errados não lançam", () => {
    const d = lerDetalhe({ id: ID, nome: 123, whatsapp: {}, email: [], contexto: 5, versao: "x" });

    expect(d).toMatchObject({ nome: "(sem nome)", whatsapp: "", email: "", contexto: null, versao: 1 });
  });

  it("linha sem id válido é descartada (null)", () => {
    expect(lerResumo({ nome: "Ana" })).toBeNull();
    expect(lerResumo({ id: "x" })).toBeNull();
    expect(lerResumo(null)).toBeNull();
    expect(lerResumo("texto")).toBeNull();
    expect(lerDetalhe(undefined)).toBeNull();
  });

  it("camposEditaveis extrai só o que o formulário controla", () => {
    const d = lerDetalhe({ ...base, observacoes: "x", whatsapp: "11999991234" })!;

    expect(Object.keys(camposEditaveis(d)).sort()).toEqual(
      [
        "atualizado_em",
        "nao_contatar_em",
        "observacoes",
        "proxima_acao",
        "proxima_acao_em",
        "status",
        "versao",
      ].sort(),
    );
  });

  it("evento: tipo desconhecido é ignorado", () => {
    expect(lerEvento({ id: 1, tipo: "status", de: "novo", para: "contatado", criado_em: "2026-08-31T00:00:00Z" })).not.toBeNull();
    expect(lerEvento({ id: 1, tipo: "outro", criado_em: "x" })).toBeNull();
    expect(lerEvento(null)).toBeNull();
  });
});
