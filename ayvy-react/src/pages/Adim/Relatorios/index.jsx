/**
 * Admin › Relatórios: números calculados dos usuários e pedidos da API (vendas, status, lojas).
 */
import { useEffect, useMemo, useState } from "react";
import { listLojistas, listUsuarios } from "../../../services/adminApi";
import { listTodosPedidos, getPedidoItens } from "../../../services/pedidosApi";
import "../admin-crud.css";
import "../style.css";
import "./relatorios.css";

const MESES = [
  { id: 0, label: "Janeiro", short: "Jan" },
  { id: 1, label: "Fevereiro", short: "Fev" },
  { id: 2, label: "Março", short: "Mar" },
  { id: 3, label: "Abril", short: "Abr" },
  { id: 4, label: "Maio", short: "Mai" },
  { id: 5, label: "Junho", short: "Jun" },
  { id: 6, label: "Julho", short: "Jul" },
  { id: 7, label: "Agosto", short: "Ago" },
  { id: 8, label: "Setembro", short: "Set" },
  { id: 9, label: "Outubro", short: "Out" },
  { id: 10, label: "Novembro", short: "Nov" },
  { id: 11, label: "Dezembro", short: "Dez" },
];

function formatBRL(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function destaqueFromReceita(receita, max) {
  // Sem venda ainda (loja nova ou mês sem pedido) ≠ "vendeu pouco".
  if (receita <= 0) return "nenhuma";
  if (max <= 0) return "nenhuma";
  const ratio = receita / max;
  if (ratio >= 0.66) return "alta";
  if (ratio >= 0.33) return "media";
  return "baixa";
}

/** Pedidos cancelados/reembolsados não entram na receita (a peça voltou). */
function contaComoReceita(status) {
  const s = String(status || "").toLowerCase();
  return s !== "cancelado" && s !== "reembolsado";
}

/** Loja de demonstração do seed — não entra no ranking do admin. */
function isLojaTeste(lojista) {
  const slug = String(lojista?.slug || "").toLowerCase().replace(/-/g, "_");
  const nome = String(lojista?.nomeLoja || "").toLowerCase();
  return slug === "loja_teste_ayvy" || nome === "loja teste ayvy";
}

export default function AdminRelatorios() {
  const now = new Date();
  const [mesId, setMesId] = useState(now.getMonth());
  const [ano] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vendasPorMes, setVendasPorMes] = useState({});
  const [lojasAyvy, setLojasAyvy] = useState([]);
  const [receitaAnual, setReceitaAnual] = useState(
    MESES.map((m) => ({ mes: m.short, label: m.label, receita: 0, pedidos: 0 })),
  );
  const [novosUsuarios, setNovosUsuarios] = useState(
    MESES.map((m) => ({ mes: m.short, valor: 0 })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Tudo da API: pedidos, usuários e lojistas (nada mockado).
        const [pedidos, usuarios, lojistas] = await Promise.all([
          listTodosPedidos(),
          listUsuarios(),
          listLojistas(),
        ]);

        const lojasValidas = (lojistas || []).filter((l) => !isLojaTeste(l));
        const map = {};
        const receitaMes = MESES.map((m) => ({
          mes: m.short,
          label: m.label,
          receita: 0,
          pedidos: 0,
        }));

        for (const p of pedidos || []) {
          const d = p.criadoEm ? new Date(p.criadoEm) : null;
          if (!d || Number.isNaN(d.getTime()) || d.getFullYear() !== ano) continue;
          if (!contaComoReceita(p.status)) continue;
          const m = d.getMonth();
          if (!map[m]) map[m] = {};

          let itens = [];
          try {
            itens = await getPedidoItens(p.id);
          } catch {
            itens = [];
          }

          const byLoja = {};
          let receitaPedido = 0;
          let temItemValido = false;
          for (const item of itens || []) {
            const lojista = item.lojista || item.produto?.lojista;
            if (isLojaTeste(lojista)) continue;
            const id = lojista?.id ?? `nome:${lojista?.nomeLoja || "Loja"}`;
            const nome = lojista?.nomeLoja || "Loja";
            const unit = Number(item.precoUnitario ?? item.produto?.preco ?? 0);
            const line = unit * (item.quantidade || 1);
            if (!byLoja[id]) byLoja[id] = { id, loja: nome, pedidos: new Set(), receita: 0 };
            byLoja[id].pedidos.add(p.id);
            byLoja[id].receita += line;
            receitaPedido += line;
            temItemValido = true;
          }

          if (!temItemValido) continue;

          receitaMes[m].receita += receitaPedido;
          receitaMes[m].pedidos += 1;

          for (const data of Object.values(byLoja)) {
            if (!map[m][data.id]) {
              map[m][data.id] = { id: data.id, loja: data.loja, pedidos: 0, receita: 0 };
            }
            map[m][data.id].pedidos += data.pedidos.size;
            map[m][data.id].receita += data.receita;
          }
        }

        const novos = MESES.map((m) => ({ mes: m.short, valor: 0 }));
        for (const u of usuarios || []) {
          const d = u.criadoEm ? new Date(u.criadoEm) : null;
          if (!d || Number.isNaN(d.getTime()) || d.getFullYear() !== ano) continue;
          novos[d.getMonth()].valor += 1;
        }

        if (!cancelled) {
          setVendasPorMes(map);
          setLojasAyvy(lojasValidas);
          setReceitaAnual(receitaMes);
          setNovosUsuarios(novos);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Erro ao carregar relatórios");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  // Todas as lojas cadastradas (exceto a de teste), com 0 se não vendeu no mês.
  const vendas = useMemo(() => {
    const doMes = vendasPorMes[mesId] || {};
    const maxR = Math.max(...Object.values(doMes).map((r) => r.receita), 1);
    return lojasAyvy
      .map((l) => {
        const row = doMes[l.id] || { id: l.id, loja: l.nomeLoja, pedidos: 0, receita: 0 };
        return {
          ...row,
          loja: l.nomeLoja || row.loja,
          destaque: destaqueFromReceita(row.receita, maxR),
        };
      })
      .sort((a, b) => b.receita - a.receita || a.loja.localeCompare(b.loja, "pt-BR"));
  }, [vendasPorMes, mesId, lojasAyvy]);
  const mesLabel = MESES.find((m) => m.id === mesId)?.label ?? String(mesId);

  const maxReceita = useMemo(
    () => Math.max(...vendas.map((v) => v.receita), 1),
    [vendas],
  );

  const maxUsuarios = useMemo(
    () => Math.max(...novosUsuarios.map((u) => u.valor), 1),
    [novosUsuarios],
  );

  const maxReceitaAnual = useMemo(
    () => Math.max(...receitaAnual.map((m) => m.receita), 1),
    [receitaAnual],
  );

  const totalReceitaAno = receitaAnual.reduce((acc, m) => acc + m.receita, 0);
  const totalPedidosAno = receitaAnual.reduce((acc, m) => acc + m.pedidos, 0);
  const picoReceita = [...receitaAnual].sort((a, b) => b.receita - a.receita)[0] || {
    mes: "—",
    receita: 0,
  };
  const totalReceitaMes = vendas.reduce((acc, v) => acc + v.receita, 0);
  const totalPedidosMes = vendas.reduce((acc, v) => acc + v.pedidos, 0);
  const totalNovos = novosUsuarios.reduce((acc, u) => acc + u.valor, 0);
  const picoUsuarios = [...novosUsuarios].sort((a, b) => b.valor - a.valor)[0] || {
    mes: "—",
    valor: 0,
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Relatórios</h1>
          <p>
            Receita anual, vendas por loja e novos usuários — tudo da API ({ano}).
            Cancelados e reembolsados ficam de fora da receita.
            {loading ? " Carregando…" : ""}
          </p>
          {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
        </div>
      </header>

      <section className="admin-metrics-row">
        <article className="admin-stat-card">
          <span className="admin-stat-label">Receita anual ({ano})</span>
          <strong className="admin-stat-value">{formatBRL(totalReceitaAno)}</strong>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-label">Receita em {mesLabel}</span>
          <strong className="admin-stat-value">{formatBRL(totalReceitaMes)}</strong>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-label">Pedidos em {mesLabel}</span>
          <strong className="admin-stat-value">{totalPedidosMes}</strong>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-label">Novos usuários ({ano})</span>
          <strong className="admin-stat-value">{totalNovos}</strong>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-label">Pico de cadastros</span>
          <strong className="admin-stat-value">
            {picoUsuarios.valor}
            <span className="admin-rel-stat-suffix"> em {picoUsuarios.mes}</span>
          </strong>
        </article>
      </section>

      <section className="admin-card admin-rel-anual">
        <div className="admin-card-head">
          <h2>Receita anual</h2>
          <span className="admin-rel-anual-resumo">
            {totalPedidosAno} pedidos · pico {formatBRL(picoReceita.receita)} em {picoReceita.mes}
          </span>
        </div>
        <p className="admin-rel-hint">
          Soma mês a mês dos pedidos válidos de {ano} (produtos, sem frete).
        </p>
        {totalReceitaAno === 0 && !loading ? (
          <p className="admin-rel-hint">Sem receita neste ano.</p>
        ) : (
          <div
            className="admin-rel-chart admin-rel-chart--receita"
            role="img"
            aria-label={`Gráfico de receita anual de ${ano}`}
          >
            {receitaAnual.map((item) => (
              <div key={item.mes} className="admin-rel-chart-col">
                <span className="admin-rel-chart-value admin-rel-chart-value--money">
                  {item.receita > 0
                    ? item.receita >= 1000
                      ? `${(item.receita / 1000).toFixed(1)}k`
                      : formatBRL(item.receita)
                    : "—"}
                </span>
                <div className="admin-rel-chart-track">
                  <div
                    className="admin-rel-chart-bar admin-rel-chart-bar--receita"
                    style={{
                      height: `${Math.round((item.receita / maxReceitaAnual) * 100)}%`,
                    }}
                    title={`${item.label}: ${formatBRL(item.receita)} · ${item.pedidos} pedidos`}
                  />
                </div>
                <span className="admin-rel-chart-label">{item.mes}</span>
              </div>
            ))}
          </div>
        )}
        <ul className="admin-rel-anual-lista">
          {receitaAnual.map((item) => (
            <li key={`lista-${item.mes}`}>
              <span>{item.mes}</span>
              <strong>{formatBRL(item.receita)}</strong>
              <em>{item.pedidos} pedido{item.pedidos === 1 ? "" : "s"}</em>
            </li>
          ))}
        </ul>
      </section>

      <div className="admin-two-col admin-rel-cols">
        <section className="admin-card admin-rel-painel">
          <div className="admin-card-head">
            <h2>Vendas por loja</h2>
            <label className="admin-rel-mes">
              <span className="admin-rel-mes-label">Mês</span>
              <select
                value={mesId}
                onChange={(e) => setMesId(Number(e.target.value))}
              >
                {MESES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="admin-rel-hint">
            Em <strong>{mesLabel}</strong>, compare quem vendeu mais.
          </p>

          <div className="admin-rel-painel__corpo">
            {vendas.length === 0 ? (
              <p className="admin-rel-hint">Sem pedidos neste mês.</p>
            ) : (
              <ul className="admin-rel-vendas">
                {vendas.map((row) => (
                  <li key={row.id} className="admin-rel-venda-row">
                    <div className="admin-rel-venda-head">
                      <div>
                        <strong>{row.loja}</strong>
                        <span>
                          {row.pedidos} pedidos · {formatBRL(row.receita)}
                        </span>
                      </div>
                      <span className={`admin-rel-tag admin-rel-tag--${row.destaque}`}>
                        {row.destaque === "alta"
                          ? "Vendeu bem"
                          : row.destaque === "media"
                            ? "Na média"
                            : row.destaque === "nenhuma"
                              ? "Ainda nenhuma venda"
                              : "Vendeu pouco"}
                      </span>
                    </div>
                    <div className="admin-rel-bar-track" aria-hidden>
                      <div
                        className={`admin-rel-bar-fill admin-rel-bar-fill--${row.destaque}`}
                        style={{
                          width: `${Math.round((row.receita / maxReceita) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="admin-card admin-rel-painel">
          <div className="admin-card-head">
            <h2>Novos usuários por mês</h2>
          </div>

          <div
            className="admin-rel-chart"
            role="img"
            aria-label={`Gráfico de novos usuários em ${ano}`}
          >
            {novosUsuarios.map((item) => (
              <div key={item.mes} className="admin-rel-chart-col">
                <span className="admin-rel-chart-value">{item.valor}</span>
                <div className="admin-rel-chart-track">
                  <div
                    className="admin-rel-chart-bar"
                    style={{
                      height: `${Math.round((item.valor / maxUsuarios) * 100)}%`,
                    }}
                  />
                </div>
                <span className="admin-rel-chart-label">{item.mes}</span>
              </div>
            ))}
          </div>

          <div className="admin-rel-painel__corpo">
            <ul className="admin-rel-crescimento">
              {novosUsuarios.map((item, i) => {
                const anterior = i > 0 ? novosUsuarios[i - 1].valor : null;
                const delta = anterior != null ? item.valor - anterior : null;
                return (
                  <li key={item.mes}>
                    <span>{item.mes}</span>
                    <strong>{item.valor} novos</strong>
                    {delta != null ? (
                      <em className={delta >= 0 ? "is-up" : "is-down"}>
                        {delta >= 0 ? "+" : ""}
                        {delta} vs mês anterior
                      </em>
                    ) : (
                      <em>ponto de partida</em>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
