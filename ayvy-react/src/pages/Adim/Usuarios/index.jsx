/**
 * Admin › Usuários: lista (GET /usuarios), editar, bloquear e excluir. Formulário em ./Form.jsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { deleteUsuario, listUsuarios, updateUsuario } from "../../../services/adminApi";
import { resolveImageUrl } from "../../../utils/imageUrl";
import "../admin-crud.css";

const STATUS_FILTERS = ["ativo", "inativo", "bloqueado"];

/** Contas de demonstração do seed — não aparecem na lista do admin. */
function isUsuarioDemo(row) {
  const email = String(row?.email || "").toLowerCase();
  const nome = String(row?.nome || "").toLowerCase();
  return (
    email === "lojista.teste@ayvy.local" ||
    email === "cliente.checkout@ayvy.local" ||
    nome === "loja teste ayvy" ||
    nome === "cliente checkout"
  );
}

export default function AdminUsuariosList() {
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
      const data = await listUsuarios();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Falha ao carregar usuários. Verifique se a API está em http://localhost:8082");
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
    if (!window.confirm(`Excluir usuário "${row.nome}"?`)) return;
    try {
      await deleteUsuario(row.id);
      await load();
    } catch (err) {
      setError(err.message || "Erro ao excluir");
    }
  }

  function pedirBloqueio(row) {
    const bloqueado = String(row.status || "").toLowerCase() === "bloqueado";
    setBloqueio({
      usuarioId: row.id,
      nome: row.nome || row.email || `usuário #${row.id}`,
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
    const semDemo = items.filter((row) => !isUsuarioDemo(row));
    if (!statusFilter) return semDemo;
    return semDemo.filter((row) => row.status === statusFilter);
  }, [items, statusFilter]);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Usuários</h1>
          <p>Identidade da plataforma (login, papel e status).</p>
        </div>
        <div className="admin-page-actions">
          <Link to="/admin/usuarios/novo" className="admin-btn admin-btn--primary">
            + Novo usuário
          </Link>
        </div>
      </header>

      {error ? <div className="admin-crud-alert admin-crud-alert--error">{error}</div> : null}

      <section className="admin-card">
        <div className="admin-crud-toolbar">
          <span>{filteredItems.length} registro(s)</span>
          <button type="button" className="admin-crud-btn-sm" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="admin-crud-loading">Carregando…</p>
        ) : (
          <div className={`admin-crud-table-wrap${filterOpen ? " admin-crud-table-wrap--menu-open" : ""}`}>
            <table className="admin-crud-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
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
                {filteredItems.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      {row.avatarUrl ? (
                        <img
                          src={resolveImageUrl(row.avatarUrl)}
                          alt=""
                          width={28}
                          height={28}
                          style={{ borderRadius: "50%", verticalAlign: "middle", marginRight: 8 }}
                        />
                      ) : null}
                      {row.nome}
                    </td>
                    <td>{row.email}</td>
                    <td>{row.papel}</td>
                    <td>
                      <span className={`admin-badge--status ${row.status}`}>{row.status}</span>
                    </td>
                    <td>
                      <div className="admin-crud-actions">
                        <Link to={`/admin/usuarios/${row.id}/editar`} className="admin-crud-btn-sm">
                          Editar
                        </Link>
                        <button
                          type="button"
                          className="admin-crud-btn-sm"
                          onClick={() => pedirBloqueio(row)}
                          disabled={salvandoBloqueio}
                        >
                          {String(row.status || "").toLowerCase() === "bloqueado"
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
