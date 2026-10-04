// `server-only` lança erro fora de um bundle de servidor do Next. Nos testes
// não há bundler, então o pacote é trocado por um módulo vazio (ver
// vitest.config.ts). A proteção continua valendo no build real.
export {};
