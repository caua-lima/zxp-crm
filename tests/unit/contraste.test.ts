import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Medição automática de contraste (WCAG 2.2 AA: 4,5:1 para texto pequeno).
 *
 * Lê os tokens REAIS de globals.css — se alguém clarear ou escurecer um deles,
 * este teste quebra. E varre o código atrás de texto feito com marfim
 * semitransparente, que foi justamente o que a auditoria encontrou: /25 dava
 * 2,1:1 e a opacidade do pai se multiplica com a do filho.
 */

const raiz = (caminho: string) => fileURLToPath(new URL(`../../${caminho}`, import.meta.url));

const css = readFileSync(raiz("src/app/globals.css"), "utf8");

function token(nome: string): [number, number, number] {
  const m = new RegExp(`--${nome}:\\s*#([0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${nome} não encontrado em globals.css`);

  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

const luminancia = ([r, g, b]: number[]) => {
  const f = (c: number) => {
    const x = c / 255;

    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contraste = (a: number[], b: number[]) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);

  return (claro + 0.05) / (escuro + 0.05);
};

const misturar = (frente: number[], fundo: number[], alfa: number) =>
  frente.map((c, i) => Math.round(c * alfa + fundo[i] * (1 - alfa)));

const onyx = token("brand-onyx");
const raised = token("brand-onyx-raised");
const marfim = token("brand-marfim");
const dourado = token("brand-dourado");

// Todos os fundos sobre os quais o texto aparece no app.
const fundos: Record<string, number[]> = {
  "página (onyx)": onyx,
  "card (onyx-raised)": raised,
  "selo dourado/15": misturar(dourado, onyx, 0.15),
  "selo dourado/15 sobre card": misturar(dourado, raised, 0.15),
  "selo marfim/10": misturar(marfim, onyx, 0.1),
  "aviso dourado/10 sobre card": misturar(dourado, raised, 0.1),
};

describe("contraste dos tokens de texto", () => {
  for (const nome of ["brand-texto", "brand-texto-2", "brand-texto-3"]) {
    for (const [fundo, cor] of Object.entries(fundos)) {
      it(`${nome} sobre ${fundo} ≥ 4,5:1`, () => {
        expect(contraste(token(nome), cor)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("borda de controles ≥ 3:1 em todos os fundos (WCAG 1.4.11) — a antiga onyx-line tinha 1,18:1", () => {
    // Superfícies onde há campo/botão com borda: página, card e painel de aviso.
    // (Selos não têm controle com borda, então ficam de fora.)
    for (const nome of ["página (onyx)", "card (onyx-raised)", "aviso dourado/10 sobre card"]) {
      expect(contraste(token("brand-borda"), fundos[nome]), nome).toBeGreaterThanOrEqual(3);
    }

    expect(contraste(token("brand-onyx-line"), onyx)).toBeLessThan(3);
  });

  it("dourado (ação/destaque) sobre onyx e sobre card", () => {
    expect(contraste(dourado, onyx)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(dourado, raised)).toBeGreaterThanOrEqual(4.5);
  });

  it("onyx sobre dourado (texto dos botões primários)", () => {
    expect(contraste(onyx, dourado)).toBeGreaterThanOrEqual(4.5);
  });

  it("onyx a 80% sobre dourado (contador do filtro ativo)", () => {
    expect(contraste(misturar(onyx, dourado, 0.8), dourado)).toBeGreaterThanOrEqual(4.5);
  });

  it("os tokens mantêm a hierarquia: texto > texto-2 > texto-3", () => {
    expect(contraste(token("brand-texto"), onyx)).toBeGreaterThan(contraste(token("brand-texto-2"), onyx));
    expect(contraste(token("brand-texto-2"), onyx)).toBeGreaterThan(contraste(token("brand-texto-3"), onyx));
  });

  it("a paleta é a da marca (onyx, dourado, marfim) — sem azul/navy", () => {
    const [r, , b] = onyx;

    expect(b).toBeLessThanOrEqual(r + 4);
    expect(css.toLowerCase()).not.toMatch(/#(0[0-9a-f]){1}[0-9a-f]{2}[a-f0-9]{2}ff/);
  });
});

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);

    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

describe("regressão: texto com marfim semitransparente", () => {
  const fontes = arquivos(raiz("src")).filter((f) => /\.(tsx|ts|css)$/.test(f));

  // text-marfim/NN e placeholder:text-marfim/NN. Fundos e bordas (bg-/border-)
  // podem ser translúcidos; TEXTO não.
  const proibido = /(?:^|[\s"'`:])(?:placeholder:)?text-marfim\/\d+/g;

  it("nenhum componente usa text-marfim/NN", () => {
    const achados: string[] = [];

    for (const arquivo of fontes) {
      const texto = readFileSync(arquivo, "utf8");

      for (const m of texto.matchAll(proibido)) achados.push(`${arquivo.replace(raiz(""), "")}: ${m[0].trim()}`);
    }

    expect(achados).toEqual([]);
  });

  it("nenhum componente usa a classe opacity-* em texto (a opacidade do pai multiplica com a do filho)", () => {
    const achados: string[] = [];

    for (const arquivo of fontes) {
      const texto = readFileSync(arquivo, "utf8");

      for (const m of texto.matchAll(/\bopacity-\d+\b/g)) {
        // disabled:opacity-50 é estado desabilitado — exceção legítima do WCAG.
        const contexto = texto.slice(Math.max(0, m.index! - 10), m.index!);
        if (!contexto.includes("disabled:")) achados.push(`${arquivo.replace(raiz(""), "")}: ${m[0]}`);
      }
    }

    expect(achados).toEqual([]);
  });
});
