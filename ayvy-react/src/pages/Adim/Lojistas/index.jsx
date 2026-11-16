/**
 * Admin › Lojistas: lista (GET /lojistas), editar, bloquear e excluir. Formulário em ./Form.jsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { deleteLojista, listLojistas, updateUsuario } from "../../../services/adminApi";
import { notifyAdminMetricsChanged } from "../../../utils/adminMetrics";
import { resolveImageUrl } from "../../../utils/imageUrl";
import { normalizeSlugParam } from "../../../utils/lojistaData";
import "../admin-crud.css";

const STATUS_FILTERS = ["ativo", "inativo", "bloqueado"];

function isLojaTeste(row) {
  const slug = String(row?.slug || "").toLowerCase().replace(/-/g, "_");
  const nome = String(row?.nomeLoja || "").toLowerCase();
  return slug === "loja_teste_ayvy" || nome === "loja teste ayvy";
}

export default function AdminLojistasList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [bloqueio, setBloqueio] = useState(null);
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);
  const filterRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // GET /lojistas — lista lojas (cada item inclui usuario responsavel)
      const data = await listLojistas();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Falha ao carregar lojistas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  async function handleDelete(row) {
    if (!window.confirm(`Excluir loja "${row.nomeLoja}"?`)) return;
    try {
      // DELETE /lojistas/:id — exclui a loja
      await deleteLojista(row.id);
      notifyAdminMetricsChanged();
      await load();
    } catch (err) {
      setError(err.message || "Erro ao excluir");
    }
  }

  function pedirBloqueio(row) {
    const usuarioId = row.usuario?.id;
    if (!usuarioId) {
      setError("Loja sem usuário responsável.");
      return;
    }
    const bloqueado = String(row.usuario?.status || "").toLowerCase() === "bloqueado";
    setBloqueio({
      usuarioId,
      nome: row.nomeLoja || row.usuario?.nome || `loja #${row.id}`,
      bloqueado,
      proximo: bloqueado ? "ativo" : "bloqueado",
    });
  }

  async function confirmarBloqueio() {
    if (!bloqueio) return;
    setSalvandoBloqueio(true);
    setError("");
    try {
      await updateUsuario(bloqueio.usuarioId, { status: bloqueio.proximo });
      notifyAdminMetricsChanged();
      setBloqueio(null);
      await load();
    } catch (err) {
      setError(err.message || (bloqueio.bloqueado ? "Erro ao desbloquear" : "Erro ao bloquear"));
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  function handleFilterSelect(status) {
    setStatusFilter(status);
    setFilterOpen(false);
  }

  const filteredItems = useMemo(() => {
    const semTeste = items.filter((row) => !isLojaTeste(row));
    if (!statusFilter) return semTeste;
    return semTeste.filter((row) => row.usuario?.status === statusFilter);
  }, [items, statusFilter]);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Lojistas</h1>
          <p>Lojas vinculadas a usuários com papel lojista.</p>
        </div>
        <div className="admin-page-actions">
          <Link to="/admin/lojistas/novo" className="admin-btn admin-btn--primary">
            + Nova loja
          </Link>
        </div>
      </header>

      {error ? <div className="admin-crud-alert admin-crud-alert--error">{error}</div> : null}

      <section className="admin-card">
        {loading ? (
          <p className="admin-crud-loading">Carregando…</p>
        ) : (
          <div className={`admin-crud-table-wrap${filterOpen ? " admin-crud-table-wrap--menu-open" : ""}`}>
            <table className="admin-crud-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Loja</th>
                  <th>Slug</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th>Ações</th>
                  <th scope="col" className="admin-crud-buscar-cell">
                    <div className="admin-crud-buscar" ref={filterRef}>
                      <button
                        type="button"
                        className="admin-crud-buscar__trigger"
                        onClick={() => setFilterOpen((open) => !open)}
                        aria-expanded={filterOpen}
                        aria-haspopup="listbox"
                      >
                        Buscar
                        <span className="admin-crud-buscar__arrow" aria-hidden="true">
                          ▼
                        </span>
                      </button>
                      {filterOpen ? (
                        <ul className="admin-crud-buscar__menu" role="listbox">
                          <li role="option" aria-selected={statusFilter === ""}>
                            <button type="button" onClick={() => handleFilterSelect("")}>
                              Todos
                            </button>
                          </li>
                          {STATUS_FILTERS.map((status) => (
                            <li key={status} role="option" aria-selected={statusFilter === status}>
                              <button type="button" onClick={() => handleFilterSelect(status)}>
                                {status}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const slugVitrine = normalizeSlugParam(row.slug);
                  return (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>
                        {row.logoUrl ? (
                          <img
                            src={resolveImageUrl(row.logoUrl)}
                            alt=""
                            width={28}
                            height={28}
                            style={{ borderRadius: 6, marginRight: 8, verticalAlign: "middle" }}
                          />
                        ) : null}
                        {row.nomeLoja}
                      </td>
                      <td>{row.slug}</td>
                      <td>{row.usuario?.nome ?? "—"}</td>
                      <td>
                        <span className={`admin-badge--status ${row.usuario?.status ?? ""}`}>
                          {row.usuario?.status ?? "—"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-crud-actions">
                          <Link to={`/admin/lojistas/${row.id}/editar`} className="admin-crud-btn-sm">
                            Editar
                          </Link>
                          <Link to={`/loja/${slugVitrine}`} className="admin-crud-btn-sm">
                            Ver loja
                          </Link>
                          <button
                            type="button"
                            className="admin-crud-btn-sm"
                            onClick={() => pedirBloqueio(row)}
                            disabled={!row.usuario?.id || salvandoBloqueio}
                          >
                            {String(row.usuario?.status || "").toLowerCase() === "bloqueado"
                              ? "Desbloquear"
                              : "Bloquear"}
                          </button>
                          <button
                            type="button"
                            className="admin-crud-btn-sm admin-crud-btn-sm--danger"
                            onClick={() => handleDelete(row)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                      <td aria-hidden="true" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!bloqueio}
        title={bloqueio?.bloqueado ? `Desbloquear ${bloqueio.nome}?` : `Bloquear ${bloqueio?.nome}?`}
        message={
          bloqueio?.bloqueado
            ? "O responsável volta a entrar na conta e a loja pode ser gerenciada normalmente."
            : "O responsável não conseguirá entrar no site até ser desbloqueado."
        }
        confirmLabel={bloqueio?.bloqueado ? "Sim, desbloquear" : "Sim, bloquear"}
        cancelLabel="Cancelar"
        danger={!bloqueio?.bloqueado}
        busy={salvandoBloqueio}
        onCancel={() => !salvandoBloqueio && setBloqueio(null)}
        onConfirm={confirmarBloqueio}
      />
    </div>
  );
}
