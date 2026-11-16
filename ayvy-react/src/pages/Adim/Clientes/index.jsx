/**
 * Admin › Clientes: lista (GET /clientes), editar, bloquear e excluir. Formulário em ./Form.jsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { deleteCliente, listClientes, updateUsuario } from "../../../services/adminApi";
import { notifyAdminMetricsChanged } from "../../../utils/adminMetrics";
import "../admin-crud.css";

const STATUS_FILTERS = ["ativo", "inativo", "bloqueado"];

export default function AdminClientesList() {
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
      // GET /clientes — lista perfis de cliente (cada um traz usuario aninhado)
      const data = await listClientes();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Falha ao carregar clientes");
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
    const nome = row.usuario?.nome || row.id;
    if (!window.confirm(`Excluir perfil de cliente "${nome}"?`)) return;
    try {
      // DELETE /clientes/:id — remove o perfil de cliente
      await deleteCliente(row.id);
      notifyAdminMetricsChanged();
      await load();
    } catch (err) {
      setError(err.message || "Erro ao excluir");
    }
  }

  function pedirBloqueio(row) {
    const usuarioId = row.usuario?.id;
    if (!usuarioId) {
      setError("Cliente sem usuário vinculado.");
      return;
    }
    const bloqueado = String(row.usuario?.status || "").toLowerCase() === "bloqueado";
    setBloqueio({
      usuarioId,
      nome: row.usuario?.nome || `cliente #${row.id}`,
      bloqueado,
      proximo: bloqueado ? "ativo" : "bloqueado",
    });
  }

  async function confirmarBloqueio() {
    if (!bloqueio) return;
    setSalvandoBloqueio(true);
    setError("");
    try {
      // PUT /usuarios/:id — status do login (bloqueado não entra na conta)
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
    if (!statusFilter) return items;
    // Filtra pelo status do USUÁRIO vinculado, não pelo id do perfil cliente
    return items.filter((row) => row.usuario?.status === statusFilter);
  }, [items, statusFilter]);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Clientes</h1>
          <p>Perfis de comprador vinculados a usuários com papel cliente.</p>
        </div>
        <div className="admin-page-actions">
          {/* Form Clientes/Form.jsx — Salvar → POST /clientes */}
          <Link to="/admin/clientes/novo" className="admin-btn admin-btn--primary">
            + Novo cliente
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
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>CPF</th>
                  <th>Nascimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                  <th scope="col" className="admin-crud-buscar-cell">
                    <div className="admin-crud-buscar" ref={filterRef}>
                      <button
                        type="button"
                        className="admin-crud-buscar__trigger"
                        // Abre/fecha menu Buscar (filtro por status do usuario)
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
                            {/* "" = mostrar todos os clientes */}
                            <button type="button" onClick={() => handleFilterSelect("")}>
                              Todos
                            </button>
                          </li>
                          {STATUS_FILTERS.map((status) => (
                            <li key={status} role="option" aria-selected={statusFilter === status}>
                              {/* Filtra por row.usuario.status (ativo, inativo, bloqueado) */}
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
                {filteredItems.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.usuario?.nome ?? "—"}</td>
                    <td>{row.usuario?.email ?? "—"}</td>
                    <td>{row.cpf}</td>
                    <td>{row.dataNascimento || "—"}</td>
                    <td>
                      <span className={`admin-badge--status ${row.usuario?.status ?? ""}`}>
                        {row.usuario?.status ?? "—"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-crud-actions">
                        {/* GET /clientes/:id no form — Salvar → PUT /clientes/:id */}
                        <Link to={`/admin/clientes/${row.id}/editar`} className="admin-crud-btn-sm">
                          Editar
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
                          // DELETE /clientes/:id
                          onClick={() => handleDelete(row)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                    <td aria-hidden="true" />
                  </tr>
                ))}
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
            ? "A conta volta a funcionar e a pessoa poderá entrar no site e no app normalmente."
            : "A conta deixa de funcionar: a pessoa não conseguirá entrar no site nem no app até ser desbloqueada."
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
