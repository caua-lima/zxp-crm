import { describe, expect, it } from "vitest";

import {
  analisarData,
  dataHoraCompleta,
  diasDeCalendario,
  fimDoDiaSaoPaulo,
  isoParaLocal,
  localParaIso,
  quandoChegou,
  quandoRetorno,
} from "@/lib/tempo";

/** Instante a partir do relógio de parede de São Paulo (UTC-3, sem horário de verão). */
const sp = (iso: string) => new Date(`${iso}-03:00`).getTime();

describe("quandoChegou", () => {
  const agora = sp("2026-10-04T00:30:00");

  it("às 00:30 de 4/10, um cadastro de 23:30 de 2/10 NÃO é 'ontem' (são 25h, mas 2 dias de calendário)", () => {
    expect(quandoChegou(new Date(sp("2026-10-02T23:30:00")).toISOString(), agora)).toBe("há 2 dias");
  });

  it("23:30 do dia 3 às 00:30 do dia 4 é 'ontem' de verdade", () => {
    expect(quandoChegou(new Date(sp("2026-10-03T23:30:00")).toISOString(), agora)).toBe(
      "ontem, 23:30",
    );
  });

  it("minutos, horas e agora", () => {
    const base = sp("2026-10-04T15:00:00");

    expect(quandoChegou(new Date(base - 20_000).toISOString(), base)).toBe("agora");
    expect(quandoChegou(new Date(base - 12 * 60_000).toISOString(), base)).toBe("há 12 min");
    expect(quandoChegou(new Date(base - 3 * 3_600_000).toISOString(), base)).toBe("há 3h");
  });

  it("virada de mês e de ano", () => {
    const ano = sp("2027-01-01T09:00:00");

    expect(quandoChegou(new Date(sp("2026-12-31T22:00:00")).toISOString(), ano)).toBe("ontem, 22:00");
    // Mais de uma semana e de outro ano: mostra o ano, senão "30/12" é ambíguo.
    expect(quandoChegou(new Date(sp("2026-12-20T10:00:00")).toISOString(), ano)).toBe("20/12/2026");
  });

  it("registro antigo do mesmo ano mostra dia/mês", () => {
    expect(quandoChegou(new Date(sp("2026-08-30T21:28:00")).toISOString(), agora)).toBe("30/08");
  });

  it("21h em São Paulo continua sendo 21h (e não 00h do dia seguinte em UTC)", () => {
    expect(dataHoraCompleta("2026-08-31T00:28:00+00:00")).toBe("30/08/2026 às 21:28");
  });

  it("data inválida, nula ou absurda NÃO lança — vira texto", () => {
    expect(quandoChegou("lixo", agora)).toBe("data indisponível");
    expect(quandoChegou(null, agora)).toBe("data indisponível");
    expect(quandoChegou(undefined, agora)).toBe("data indisponível");
    expect(quandoChegou("0000-00-00T00:00:00Z", agora)).toBe("data indisponível");
    expect(dataHoraCompleta("lixo")).toBe("data indisponível");
  });

  it("data no futuro é dita como futura, não como 'agora'", () => {
    expect(quandoChegou(new Date(agora + 3 * 86_400_000).toISOString(), agora)).toMatch(/^data futura/);
  });

  it("relógio adiantado em poucos segundos ainda é 'agora'", () => {
    expect(quandoChegou(new Date(agora + 30_000).toISOString(), agora)).toBe("agora");
  });
});

describe("diasDeCalendario", () => {
  it("conta dias de calendário em SP, não blocos de 24h", () => {
    expect(diasDeCalendario(sp("2026-10-02T23:59:00"), sp("2026-10-03T00:01:00"))).toBe(1);
    expect(diasDeCalendario(sp("2026-10-03T00:01:00"), sp("2026-10-03T23:59:00"))).toBe(0);
  });
});

describe("quandoRetorno", () => {
  const agora = sp("2026-10-04T10:00:00");

  it("hoje, amanhã, ontem e atraso", () => {
    const r = (iso: string) => quandoRetorno(new Date(sp(iso)).toISOString(), agora);

    expect(r("2026-10-04T15:00:00")).toEqual({ texto: "hoje, 15:00", atrasado: false });
    expect(r("2026-10-04T08:00:00")).toEqual({ texto: "hoje, 08:00", atrasado: true });
    expect(r("2026-10-05T09:00:00")).toEqual({ texto: "amanhã, 09:00", atrasado: false });
    expect(r("2026-10-03T17:00:00")).toEqual({ texto: "ontem, 17:00", atrasado: true });
    expect(r("2026-09-20T17:00:00")).toEqual({ texto: "20/09, 17:00", atrasado: true });
  });

  it("data inválida não lança nem aparece como atrasada", () => {
    expect(quandoRetorno("lixo", agora)).toEqual({ texto: "data indisponível", atrasado: false });
  });
});

describe("fimDoDiaSaoPaulo", () => {
  it("é 23:59:59 de SP — em UTC, 02:59:59 do dia seguinte", () => {
    expect(fimDoDiaSaoPaulo(sp("2026-10-04T10:00:00"))).toBe("2026-10-05T02:59:59.000Z");
  });

  it("às 22h de SP o dia ainda é o mesmo (em UTC já seria o seguinte)", () => {
    expect(fimDoDiaSaoPaulo(sp("2026-10-04T22:00:00"))).toBe("2026-10-05T02:59:59.000Z");
  });

  it("virada de ano", () => {
    expect(fimDoDiaSaoPaulo(sp("2026-12-31T12:00:00"))).toBe("2027-01-01T02:59:59.000Z");
  });
});

describe("datetime-local ⇄ ISO (horário de São Paulo, não do servidor)", () => {
  it("15:00 digitado vira 18:00 UTC", () => {
    expect(localParaIso("2026-10-10T15:00")).toBe("2026-10-10T18:00:00.000Z");
  });

  it("é ida e volta", () => {
    expect(isoParaLocal(localParaIso("2026-10-10T15:00"))).toBe("2026-10-10T15:00");
    expect(isoParaLocal("2026-10-10T18:00:00+00:00")).toBe("2026-10-10T15:00");
  });

  it.each(["", "lixo", "2026-02-31T10:00", "2026-13-01T10:00", "2026-10-10T25:00", "2026-10-10 15:00"])(
    "rejeita %j",
    (entrada) => {
      expect(localParaIso(entrada)).toBeNull();
    },
  );

  it("não aceita o que não é texto", () => {
    expect(localParaIso(null)).toBeNull();
    expect(localParaIso(123)).toBeNull();
  });
});

describe("analisarData", () => {
  it("aceita ISO do Postgres com microssegundos", () => {
    expect(analisarData("2026-08-31T00:17:16.886342+00:00")).not.toBeNull();
  });

  it("rejeita lixo e datas fora de faixa", () => {
    expect(analisarData("lixo")).toBeNull();
    expect(analisarData("1970-01-01T00:00:00Z")).toBeNull();
    expect(analisarData(12345)).toBeNull();
  });
});
