import { describe, expect, it } from "vitest";

import { linkWhatsapp } from "@/lib/lead";
import { digitosNacionais, formatarTelefone, whatsappInternacional } from "@/lib/telefone";

describe("whatsappInternacional", () => {
  it.each([
    ["(11) 99999-1234", "5511999991234"],
    ["11999991234", "5511999991234"],
    // O bug da auditoria: DDI já presente virava 5555119999912…
    ["+55 11 99999-1234", "5511999991234"],
    ["+55 (11) 99999-1234", "5511999991234"],
    ["5511999991234", "5511999991234"],
    ["0055 11 99999-1234", "5511999991234"],
    // Prefixo de discagem nacional (0 + DDD).
    ["011 99999-1234", "5511999991234"],
    // Fixo (10 dígitos).
    ["(11) 3456-7890", "551134567890"],
    ["+55 11 3456-7890", "551134567890"],
  ])("%s → %s", (entrada, esperado) => {
    expect(whatsappInternacional(entrada)).toBe(esperado);
  });

  it("DDD 55 (Santa Maria/RS) é preservado — não confundir com DDI", () => {
    // 11 dígitos começando por 55: é DDD 55, NÃO um DDI.
    expect(whatsappInternacional("55 99123-4567")).toBe("5555991234567");
    expect(whatsappInternacional("(55) 99123-4567")).toBe("5555991234567");
    // Com DDI na frente: 13 dígitos.
    expect(whatsappInternacional("+55 55 99123-4567")).toBe("5555991234567");
  });

  it.each([
    ["", "vazio"],
    ["abc", "sem dígitos"],
    ["55", "só o DDI"],
    ["123", "curto"],
    ["119999912345", "12 dígitos sem DDI 55"],
    ["00000000000", "zeros"],
    ["11999999999", "dígitos repetidos"],
    ["(00) 99999-1234", "DDD inexistente"],
    ["(20) 99999-1234", "DDD inexistente (20)"],
    ["(11) 89999-1234", "11 dígitos sem o 9 inicial"],
    ["+1 415 555 2671", "número de outro país"],
    ["1".repeat(41), "comprimento absurdo"],
  ])("rejeita %j (%s) — nunca devolve um link inválido", (entrada) => {
    expect(whatsappInternacional(entrada)).toBeNull();
  });

  it("entrada que não é texto não lança", () => {
    expect(whatsappInternacional(undefined)).toBeNull();
    expect(whatsappInternacional(null)).toBeNull();
    expect(whatsappInternacional(11999991234)).toBeNull();
  });
});

describe("digitosNacionais / formatarTelefone", () => {
  it("devolve só DDD + número", () => {
    expect(digitosNacionais("+55 (11) 99999-1234")).toBe("11999991234");
  });

  it("formata celular e fixo; número inválido volta como veio", () => {
    expect(formatarTelefone("+5511999991234")).toBe("(11) 99999-1234");
    expect(formatarTelefone("1134567890")).toBe("(11) 3456-7890");
    expect(formatarTelefone("lixo")).toBe("lixo");
  });
});

describe("linkWhatsapp", () => {
  it("monta o link com a mensagem codificada", () => {
    const link = linkWhatsapp({ nome: "Ana Souza", whatsapp: "(11) 99999-1234" });

    expect(link).toMatch(/^https:\/\/wa\.me\/5511999991234\?text=/);
    expect(decodeURIComponent(link!.split("text=")[1])).toContain("Oi, Ana!");
  });

  it("número inválido NÃO gera link (antes virava wa.me/55)", () => {
    expect(linkWhatsapp({ nome: "Ana", whatsapp: "" })).toBeNull();
    expect(linkWhatsapp({ nome: "Ana", whatsapp: "123" })).toBeNull();
  });

  it("nome com caracteres de URL não quebra a mensagem", () => {
    const link = linkWhatsapp({ nome: "Ana&x=1#frag", whatsapp: "11999991234" });

    expect(link).not.toContain("#");
    expect(new URL(link!).searchParams.get("x")).toBeNull();
  });
});
