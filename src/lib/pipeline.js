// Orquestra uma busca: Google Maps → sites → CNPJ no Google → Receita → nota.
import { MAPS_ACTOR, SEARCH_ACTOR, runActor } from "./apify";
import { lookupCnpj } from "./cnpj";
import { leadsToCsv } from "./csv";
import {
  ACCEPT_SCORE, HIGH_CONFIDENCE_SCORE, MAX_CANDIDATES,
  applyCompany, candidatesFromSerp, cnpjQuery, dedupeCandidates, finalize, matchScore, placeToLead,
} from "./enrich";
import { plural, uid } from "./format";
import { inspectSite, saveResultsCsv, siteApiAvailable } from "./site";

// Preços da Apify (plano Free, set/2026) — só para a estimativa
const PRICE = { place: 0.004, filter: 0.001, searchPage: 0.0045 };

export function estimate({ terms, limit, mode, enrich }) {
  const places = terms.length * limit;
  // Os filtros "sem site" e "com site" são um add-on pago do actor
  const perPlace = PRICE.place + PRICE.filter * (mode === "semSite" || mode === "comSite" ? 2 : 1);
  return { places, cost: places * perPlace + (enrich ? places * PRICE.searchPage : 0) };
}

export function mapsInput(p) {
  return {
    searchStringsArray: p.terms,
    locationQuery: p.city,
    maxCrawledPlacesPerSearch: p.limit,
    language: "pt-BR",
    skipClosedPlaces: true,
    website: p.mode === "semSite" ? "withoutWebsite" : p.mode === "comSite" ? "withWebsite" : "allPlaces",
    maxImages: 0,
    maxReviews: 0,
    maxQuestions: 0,
  };
}

async function mapLimit(items, limit, signal, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  signal.throwIfAborted();
}

export const STAGES = ["maps", "sites", "google", "receita"];

export async function runPipeline({ params, token, dispatch, getLeads, signal, resume }) {
  const search = resume?.search || { id: uid(), label: `${params.terms.join(", ")} · ${params.city}`, enrich: params.enrich };
  const notices = [...(resume?.notices || [])];
  const leads = new Map(); // id → lead (a verdade durante a execução)

  const setRun = (patch) => dispatch({ type: "run", run: patch });
  const notice = (msg) => { notices.push(msg); setRun({ notices: [...notices] }); };
  const push = (lead) => { leads.set(lead.id, lead); dispatch({ type: "enrichLead", lead }); };
  let progress = { done: 0, total: 0 };
  const stage = (phase, message, total) => { progress = { done: 0, total }; setRun({ phase, message, progress }); };
  const step = (message) => { progress = { ...progress, done: progress.done + 1 }; setRun({ message, progress }); };

  const finish = async () => {
    const list = [...leads.values()];
    const owners = list.filter((l) => l.owner).length;
    const zap = list.filter((l) => l.whatsapp).length;
    const parts = [plural(list.length, "lead", "leads")];
    if (params.enrich) parts.push(`${owners} com dono identificado`);
    parts.push(`${zap} com WhatsApp`);
    const csvFile = list.length ? await saveResultsCsv(search.label, leadsToCsv(list)) : null;
    setRun({ phase: "done", finishedAt: Date.now(), message: list.length ? `${parts.join(" · ")}.` : "Nenhum negócio encontrado.", csvFile });
  };

  setRun({ search, params, phase: "maps", message: "Procurando negócios no Google Maps…", progress: { done: 0, total: params.terms.length * params.limit }, notices, error: null, resultIds: [] });

  try {
    // 1. Google Maps — os leads aparecem na lista conforme chegam
    const existing = new Map(getLeads().map((l) => [l.id, l]));
    const mapsTotal = params.terms.length * params.limit;
    await runActor(token, MAPS_ACTOR, mapsInput(params), {
      signal,
      runId: resume?.mapsRunId,
      onStart: (run) => setRun({ mapsRunId: run.id }),
      onItems: (places) => {
        const fresh = [];
        for (const place of places) {
          if (!place?.title || place.permanentlyClosed || place.temporarilyClosed) continue;
          let lead = placeToLead(place, search);
          if (leads.has(lead.id)) continue;
          // "Com site": Instagram, link na bio ou iFood não contam como site próprio
          if (params.mode === "comSite" && lead.site.type !== "site") continue;
          // Já descoberto numa busca anterior: reaproveita e economiza créditos
          const prev = existing.get(lead.id);
          if (prev?.enrich === "done" && prev.raw?.company) {
            lead = { ...lead, raw: prev.raw, cnpj: prev.cnpj, site: prev.site?.checked ? prev.site : lead.site, enrich: "done" };
          }
          lead = finalize(lead);
          leads.set(lead.id, lead);
          fresh.push(lead);
        }
        if (fresh.length) dispatch({ type: "upsertLeads", leads: fresh });
        progress = { done: Math.min(leads.size, mapsTotal), total: mapsTotal };
        setRun({ found: leads.size, progress, message: `${plural(leads.size, "negócio encontrado", "negócios encontrados")} no Google Maps…`, resultIds: [...leads.keys()] });
      },
    });

    if (!leads.size) {
      notice("Nenhum negócio encontrado. Tente um termo mais amplo ou outra cidade.");
      return finish();
    }
    if (!params.enrich) return finish();

    const todo = [...leads.values()].filter((l) => l.enrich !== "done");
    const candidates = new Map(todo.map((l) => [l.id, []]));

    // 2. Sites: CNPJ no rodapé, contatos e problemas (via servidor local)
    const withSite = todo.filter((l) => l.site.type === "site");
    if (withSite.length) {
      if (await siteApiAvailable()) {
        stage("sites", `Analisando ${plural(withSite.length, "site", "sites")}…`, withSite.length);
        let done = 0;
        await mapLimit(withSite, 6, signal, async (l) => {
          push({ ...leads.get(l.id), enrich: "working" });
          try {
            const info = await inspectSite(l.site.url, signal);
            const cur = leads.get(l.id);
            candidates.get(l.id).push(...info.cnpjs.slice(0, MAX_CANDIDATES).map((cnpj) => ({ cnpj, origin: "site" })));
            push(finalize({ ...cur, raw: { ...cur.raw, site: info }, site: { ...cur.site, problems: info.problems, online: info.online, checked: true } }));
          } catch (err) {
            if (signal.aborted) throw err;
          }
          step(`Analisando sites… ${++done} de ${withSite.length}`);
        });
      } else {
        notice("Os sites não foram analisados: abra o Prospect com “npm run dev” ou “npm start” para ler CNPJ do rodapé, e-mails e problemas dos sites.");
      }
    }

    // 3. Google: "nome cidade CNPJ" para quem ainda não tem candidato
    const needSearch = todo.filter((l) => !candidates.get(l.id).length);
    if (needSearch.length) {
      const byQuery = new Map();
      for (const l of needSearch) {
        const q = cnpjQuery(l, params.city);
        if (!byQuery.has(q)) byQuery.set(q, []);
        byQuery.get(q).push(l);
        push({ ...leads.get(l.id), enrich: "working" });
      }
      stage("google", `Procurando o CNPJ de ${plural(needSearch.length, "empresa", "empresas")} no Google…`, byQuery.size);
      try {
        let done = 0;
        await runActor(token, SEARCH_ACTOR, {
          queries: [...byQuery.keys()].join("\n"),
          maxPagesPerQuery: 1,
          countryCode: "br",
          searchLanguage: "pt",
          languageCode: "pt-BR",
          mobileResults: false,
          includeUnfilteredResults: false,
          saveHtml: false,
          saveHtmlToKeyValueStore: false,
        }, {
          signal,
          runId: resume?.googleRunId,
          onStart: (run) => setRun({ googleRunId: run.id }),
          onItems: (pages) => {
            for (const page of pages) {
              for (const l of byQuery.get(page?.searchQuery?.term) || []) {
                candidates.get(l.id).push(...candidatesFromSerp(l, page.organicResults || []));
              }
              step(`Procurando CNPJs no Google… ${++done} de ${byQuery.size}`);
            }
          },
        });
      } catch (err) {
        if (signal.aborted) throw err;
        notice(`A busca de CNPJ no Google falhou (${err.message}). Os leads foram mantidos sem os dados da Receita.`);
      }
    }

    // 4. Receita Federal: valida os candidatos e só aceita quando bate (cidade, CEP, telefone, nome)
    const withCandidates = todo.filter((l) => candidates.get(l.id).length);
    todo.filter((l) => !candidates.get(l.id).length).forEach((l) => push(finalize({ ...leads.get(l.id), enrich: "nocnpj" })));
    stage("receita", `Consultando ${plural(withCandidates.length, "CNPJ", "CNPJs")} na Receita Federal…`, withCandidates.length);
    let done = 0;
    await mapLimit(withCandidates, 4, signal, async (l) => {
      let best = null;
      for (const cand of dedupeCandidates(candidates.get(l.id))) {
        let co;
        try { co = await lookupCnpj(cand.cnpj); } catch { continue; }
        if (!co) continue;
        const match = matchScore(leads.get(l.id), co, cand.origin);
        if (!best || match.score > best.match.score) best = { co, match };
        if (match.score >= HIGH_CONFIDENCE_SCORE + 20) break;
      }
      const cur = leads.get(l.id);
      push(finalize(best && best.match.score >= ACCEPT_SCORE ? applyCompany(cur, best.co, best.match) : { ...cur, enrich: "nocnpj" }));
      step(`Consultando a Receita Federal… ${++done} de ${withCandidates.length}`);
    });

    return finish();
  } catch (err) {
    const aborted = signal.aborted || err?.name === "AbortError";
    for (const l of leads.values()) {
      if (l.enrich === "pending" || l.enrich === "working") push(finalize({ ...l, enrich: aborted ? "unverified" : "nocnpj" }));
    }
    if (aborted) {
      setRun({ phase: "cancelled", finishedAt: Date.now(), message: leads.size ? `Busca interrompida. ${plural(leads.size, "lead mantido", "leads mantidos")}.` : "Busca cancelada." });
    } else {
      setRun({ phase: "error", finishedAt: Date.now(), error: err.message || "Erro inesperado.", message: err.message });
    }
  }
}
