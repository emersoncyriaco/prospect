// Sugestões rápidas de nicho
export const NICHES = [
  "Dentista", "Clínica de estética", "Advogado", "Academia", "Restaurante", "Barbearia",
  "Salão de beleza", "Pet shop", "Oficina mecânica", "Ar-condicionado", "Imobiliária", "Contabilidade",
];

// Exemplos do estado vazio (preenchem a busca)
export const EXAMPLES = [
  ["Dentista", "Campinas, SP"],
  ["Pet shop", "Curitiba, PR"],
  ["Salão de beleza", "Recife, PE"],
  ["Oficina mecânica", "Goiânia, GO"],
];

export const MAX_TERMS = 10;
export const LIMITS = [20, 50, 100, 250];

// Etapas de acompanhamento de cada lead
export const STATUSES = [
  { id: "novo", label: "Novo" },
  { id: "contatado", label: "Contatado" },
  { id: "conversando", label: "Conversando" },
  { id: "fechado", label: "Fechado" },
  { id: "descartado", label: "Descartado" },
];
export const statusById = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

// Variáveis: {nome} {empresa} {observacao} {cidade} {eu}
export const DEFAULT_TEMPLATE =
  "Olá, {nome}! Tudo bem? Encontrei o perfil de {empresa} no Google Maps e {observacao}. " +
  "Sou o {eu}, web designer, e ajudo negócios como o de vocês a atrair mais clientes pela internet. " +
  "Posso te mostrar uma ideia rápida, sem compromisso?";
