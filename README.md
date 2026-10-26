# Prospect

Encontra negócios no Google Maps (via Apify), descobre **quem é o dono** com **WhatsApp** e **e-mail** cruzando com o CNPJ na Receita Federal, analisa o site de cada um e automatiza a primeira abordagem pelo WhatsApp.

Interface no estilo Apple (HIG / Liquid Glass), em React + Vite, com uma API local em Node.

## Como abrir

Requer **Node.js 20+**.

```bash
npm install        # só na primeira vez
npm run dev        # desenvolvimento → http://localhost:5175
npm start          # produção (build + servidor) → http://localhost:5175
```

Depois, em **Ajustes**, cole o token da Apify ([console.apify.com → Settings → API & Integrations](https://console.apify.com/settings/integrations)) e toque em **Conectar**.

> Abra sempre o **mesmo endereço** (`localhost:5175`). Para o navegador, `localhost` e `127.0.0.1` são sites diferentes, cada um com seus próprios dados.

## Funcionalidades

- **Busca de leads** no Google Maps, com resultados ao vivo e modos **Todos / Sem site / Com site**.
- **Dono e contatos**: CNPJ (site, Google ou manual) → Receita Federal (OpenCNPJ, BrasilAPI e Minha Receita de reserva), com pontuação de correspondência.
- **Análise de sites**: CNPJ do rodapé, e-mails, WhatsApp, Instagram e problemas (sem HTTPS, não adaptado ao celular, lento, construtor grátis, fora do ar).
- **Diagnóstico por lead**: veredito *manter / melhorar / refazer*, pontos para não tocar e dores.
- **Nota de oportunidade** de 0 a 100 e mensagem personalizada com `{nome}`, `{empresa}`, `{observacao}` e `{eu}`.
- **Automação de WhatsApp** (Baileys, não oficial) com o seu próprio número: fila, limite diário, intervalo aleatório entre envios, horário comercial, follow-up, detecção de respostas e descadastro automático.
- **Exportação** em CSV e backup em JSON.

## Como o dono é encontrado

| Etapa | O que acontece | Custo |
|---|---|---|
| 1. Google Maps | `compass/crawler-google-places` busca negócios ativos. | ~US$ 0,005 por negócio |
| 2. Sites | O servidor local lê a página inicial (bloqueia rede interna). | Grátis |
| 3. CNPJ no Google | `apify/google-search-scraper` com `nome + cidade + CNPJ`, dígitos verificadores conferidos. | ~US$ 0,0045 por empresa |
| 4. Receita Federal | Só aceita quando cidade, CEP, telefone e nome batem. | Grátis |

Empresas já descobertas em buscas anteriores são reaproveitadas.

## Onde ficam os dados

Não há banco na nuvem: tudo fica **na sua máquina** e **nada disso vai para o Git**.

| Dado | Onde fica |
|---|---|
| Leads, notas, status, ajustes | Armazenamento do navegador (`localStorage`) |
| Token da Apify | Armazenamento do navegador (nunca entra no backup) |
| Fila da automação, respostas, descadastros | `.prospect-data/automacao.json` |
| Diagnósticos dos sites | `.prospect-data/diagnosticos.json` |
| Sessão do WhatsApp | `.prospect-data/whatsapp-auth/` (**equivale à senha do seu WhatsApp**) |
| CSVs das buscas | `resultados/` |

### Levar para outra máquina

1. Na máquina antiga: **Ajustes → Fazer backup (JSON)**.
2. Copie a pasta `.prospect-data/` (pen drive ou nuvem privada; **nunca** por GitHub ou chat).
3. Na máquina nova: clone o repositório, rode `npm install`, cole a pasta `.prospect-data/` na raiz do projeto e rode `npm start`.
4. Abra `http://localhost:5175` → **Ajustes → Restaurar backup** e cole o token da Apify de novo.
5. **Não rode as duas máquinas ao mesmo tempo**: duas instâncias com a mesma sessão do WhatsApp se derrubam. Se preferir, apague `.prospect-data/whatsapp-auth/` na máquina nova e escaneie o QR de novo.

## Estrutura

```
src/lib/          pipeline, Apify, CNPJ, telefones, sites, nota, CSV, armazenamento, automação
src/views/        Buscar, Leads (tabela/cartões + detalhes), Automação, Ajustes
src/components/   Ícones, diagnóstico, UI
server/           API local: análise de sites, diagnósticos, WhatsApp e fila de envios
server.js         servidor de produção (npm start)
```

## Avisos

- A automação usa o WhatsApp **não oficial**. Envie poucas mensagens por dia (padrão: 20) para não ter o número bloqueado.
- Os dados vêm de fontes públicas, para contato comercial B2B. Respeite a LGPD e atenda pedidos de descadastro (o sistema faz isso automaticamente).
