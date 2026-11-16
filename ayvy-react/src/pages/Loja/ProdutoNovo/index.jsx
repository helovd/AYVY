/**
 * Cadastro e edição de produto do lojista (/loja/:slug/produto/novo e /:productId/editar).
 * Fotos, nome, descrição, categoria (CategoriaPicker), preço, desconto, cores, tamanhos e o
 * estoque de cada variação (cor × tamanho), salvo em /produtos/{id}/variacoes.
 * Salva via services/lojistaApi.js (POST/PUT /produtos, /upload, /produtos/{id}/imagens).
 */
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import CategoriaPicker, { categoriaCompleta } from "./CategoriaPicker";
import SucessoModal from "./SucessoModal";
import { isShopOwner } from "../../../utils/mockAuthUsers";
import { normalizeSlugParam } from "../../../utils/lojistaData";
import { formatBRL } from "../../../utils/cartHelpers";
import {
  COR_UNICA,
  TAMANHO_UNICO,
  chaveVariacao,
  combinacoesDoForm,
  atualizarProdutoLojista,
  carregarProdutoParaEdicao,
  listCategorias,
  salvarProdutoLojista,
} from "../../../services/lojistaApi";
import "./style.css";

const TAMANHOS_ROUPA = ["PP", "P", "M", "G", "GG", "XG", "XXG", "XGG", "EG", "EXG", "G1", "G2", "G3"];
const numeracao = (de, ate) => Array.from({ length: ate - de + 1 }, (_, i) => String(de + i));
const TAMANHOS_CALCADO_INFANTIL = numeracao(13, 32);
const TAMANHOS_CALCADO_ADULTO = numeracao(33, 46);
const TAMANHOS_PADRAO = [...TAMANHOS_ROUPA, ...TAMANHOS_CALCADO_INFANTIL, ...TAMANHOS_CALCADO_ADULTO];
const PALAVRAS_CALCADO = ["calcado", "tenis", "bota", "sandalia", "sapat", "chinelo", "rasteira"];
const PALAVRAS_INFANTIL = ["infantil", "bebe", "menina", "menino", "sapatinho"];
const PRECO_MAX_DIGITOS = 9;

/** Como o produto varia de tamanho — opcional; dá para publicar só com foto. */
const MODOS_TAMANHO = [
  {
    id: "unico",
    label: "Sem tamanho",
    hint: "Pode publicar assim. Uma peça só (conforme a imagem). Cores também são opcionais.",
  },
  {
    id: "roupa",
    label: "Tamanhos de roupa",
    hint: "PP ao G3 (XG, XXG, XGG, EG, EXG…).",
  },
  {
    id: "calcado",
    label: "Numeração de calçado",
    hint: "Do 13 ao 46. Para tênis, botas e sandálias.",
  },
];

function ehNumeroCalcado(tam) {
  return /^\d{2}$/.test(String(tam || "").trim()) || /^\d{2}-\d{2}$/.test(String(tam || "").trim());
}

function inferirModoTamanho(sizes) {
  const lista = (sizes || []).filter((s) => s && s !== TAMANHO_UNICO);
  if (!lista.length) return "unico";
  if (lista.every(ehNumeroCalcado)) return "calcado";
  if (lista.every((s) => TAMANHOS_ROUPA.includes(s))) return "roupa";
  if (lista.some(ehNumeroCalcado)) return "calcado";
  return "roupa";
}

/** Máscara de dinheiro: os dígitos digitados viram centavos ("55000" → "550,00", "123456" → "1.234,56"). */
function mascaraPreco(valor) {
  const digitos = String(valor || "").replace(/\D/g, "").replace(/^0+/, "").slice(0, PRECO_MAX_DIGITOS);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const EMPTY_FORM = {
  title: "",
  description: "",
  categoryId: "",
  price: "",
  discountPercent: "",
  variacoes: {},
  extraCategoryIds: [],
  colors: [],
  sizes: [],
};

export default function LojaProdutoNovo() {
  const { slug: raw, productId } = useParams();
  const slug = normalizeSlugParam(raw || "");
  const isEdit = Boolean(productId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const lojaPath = `/loja/${slug}`;

  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [originalImages, setOriginalImages] = useState([]);
  const [colorInput, setColorInput] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [extraAberta, setExtraAberta] = useState(false);
  const [preencherTodas, setPreencherTodas] = useState("");
  const [sucesso, setSucesso] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [loadError, setLoadError] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [modoTamanho, setModoTamanho] = useState("unico");
  const [modoManual, setModoManual] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCategorias()
      .then((list) => {
        if (!cancelled) setCategorias(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCategorias([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      setLoadError("");
      try {
        const data = await carregarProdutoParaEdicao(productId);
        if (cancelled) return;
        const donoId = data.produto?.lojista?.id;
        if (user?.lojistaId && donoId != null && Number(donoId) !== Number(user.lojistaId)) {
          setLoadError("Este produto não pertence à sua loja.");
          return;
        }
        setForm(data.form);
        setImages(data.images);
        setOriginalImages(data.images);
        setEditStatus(String(data.produto?.status || "").toLowerCase());
        setModoTamanho(inferirModoTamanho(data.form?.sizes));
        setModoManual(true);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Não foi possível carregar o produto.");
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, productId, user?.lojistaId]);

  // Sugere numeração de calçado quando a categoria/nome indica tênis/bota/etc.
  useEffect(() => {
    if (modoManual || isEdit) return;
    const cat = categorias.find((c) => String(c.id) === String(form.categoryId));
    const texto = [cat?.slug, cat?.categoriaPai?.slug, form.title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (PALAVRAS_CALCADO.some((p) => texto.includes(p))) {
      setModoTamanho((m) => (m === "unico" ? "calcado" : m));
    }
  }, [form.categoryId, form.title, categorias, modoManual, isEdit]);

  if (!isShopOwner(user, slug)) {
    return <Navigate to={lojaPath} replace />;
  }

  function atualizarEstoqueVariacao(chave, valor) {
    const limpo = String(valor).replace(/\D/g, "").slice(0, 6);
    setForm((prev) => ({ ...prev, variacoes: { ...prev.variacoes, [chave]: limpo } }));
  }

  function aplicarEmTodas() {
    const limpo = String(preencherTodas).replace(/\D/g, "").slice(0, 6);
    if (!limpo) return;
    setForm((prev) => ({
      ...prev,
      variacoes: Object.fromEntries(
        combinacoesDoForm(prev).map((c) => [chaveVariacao(c.cor, c.tamanho), limpo]),
      ),
    }));
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePriceChange(raw) {
    updateField("price", mascaraPreco(raw));
  }

  function handleDiscountChange(raw) {
    const digitos = String(raw || "").replace(/\D/g, "").slice(0, 2);
    updateField("discountPercent", digitos ? String(Math.min(90, Number(digitos))) : "");
  }

  async function persist(status) {
    if (!user?.lojistaId) {
      alert("Sessão de lojista incompleta. Faça login novamente.");
      return;
    }
    setSaving(true);
    try {
      const criado = await salvarProdutoLojista({
        lojistaId: user.lojistaId,
        form,
        images,
        status,
        categoriaId: form.categoryId || null,
      });
      setSucesso({ tipo: status === "ativo" ? "publicado" : "rascunho", produtoId: criado?.id });
    } catch (err) {
      alert(err.message || "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDraftSave() {
    if (!form.title.trim() && images.length === 0) {
      alert("Preencha ao menos o nome ou uma foto para salvar o rascunho.");
      return;
    }
    const formDraft = {
      ...form,
      price: form.price.trim() || "0,00",
      title: form.title.trim() || "Rascunho sem nome",
    };
    if (!user?.lojistaId) {
      alert("Sessão de lojista incompleta. Faça login novamente.");
      return;
    }
    setSaving(true);
    try {
      const criado = await salvarProdutoLojista({
        lojistaId: user.lojistaId,
        form: formDraft,
        images,
        status: "rascunho",
        categoriaId: form.categoryId || null,
      });
      setSucesso({ tipo: "rascunho", produtoId: criado?.id });
    } catch (err) {
      alert(err.message || "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSize(value) {
    setModoManual(true);
    setForm((prev) => {
      const next = prev.sizes.includes(value)
        ? prev.sizes.filter((v) => v !== value)
        : [...prev.sizes, value];
      return { ...prev, sizes: next };
    });
  }

  function addSize() {
    const name = sizeInput.trim();
    if (!name) return;
    const exists = form.sizes.some((s) => s.toLowerCase() === name.toLowerCase());
    if (!exists) {
      setModoManual(true);
      if (modoTamanho === "unico") setModoTamanho(ehNumeroCalcado(name) ? "calcado" : "roupa");
      setForm((prev) => ({ ...prev, sizes: [...prev.sizes, name] }));
    }
    setSizeInput("");
  }

  function escolherModoTamanho(modo) {
    setModoManual(true);
    setModoTamanho(modo);
    if (modo === "unico") {
      setForm((prev) => ({ ...prev, sizes: [] }));
      return;
    }
    // Ao trocar o tipo, remove tamanhos do outro sistema (P/M/G ↔ numeração).
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.filter((s) =>
        modo === "calcado" ? ehNumeroCalcado(s) : !ehNumeroCalcado(s) && s !== TAMANHO_UNICO,
      ),
    }));
  }

  function addColor() {
    const name = colorInput.trim();
    if (!name) return;
    const exists = form.colors.some((c) => c.toLowerCase() === name.toLowerCase());
    if (!exists) {
      setForm((prev) => ({ ...prev, colors: [...prev.colors, name] }));
    }
    setColorInput("");
  }

  function removeColor(cor) {
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.filter((c) => c !== cor),
    }));
  }

  function onEnter(fn) {
    return (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        fn();
      }
    };
  }

  function handleImagesChange(e) {
    const files = Array.from(e.target.files || []);
    const next = files.slice(0, 6).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...next].slice(0, 6));
    e.target.value = "";
  }

  function removeImage(id) {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.file) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      alert("Informe o nome do produto.");
      return;
    }
    if (!form.price.trim()) {
      alert("Informe o preço.");
      return;
    }
    if (images.length === 0) {
      alert("Adicione pelo menos uma foto.");
      return;
    }
    if (!categoriaCompleta(categorias, form.categoryId)) {
      alert("Escolha a categoria principal e a subcategoria do produto.");
      return;
    }
    if (!isEdit) {
      await persist("ativo");
      return;
    }
    setSaving(true);
    try {
      await atualizarProdutoLojista({
        produtoId: productId,
        form,
        images,
        originalImages,
        categoriaId: form.categoryId || null,
      });
      const publico = !editStatus || editStatus === "ativo";
      navigate(publico ? `${lojaPath}/p/${productId}` : lojaPath, { replace: true });
    } catch (err) {
      alert(err.message || "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  const combinacoes = combinacoesDoForm(form);
  const estoqueTotal = combinacoes.reduce((soma, c) => soma + c.estoque, 0);
  const categoriaAtual = categorias.find((c) => String(c.id) === String(form.categoryId));
  const textoCategoria = [
    categoriaAtual?.slug,
    categoriaAtual?.categoriaPai?.slug,
    form.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const ehCalcado = PALAVRAS_CALCADO.some((p) => textoCategoria.includes(p));
  const ehInfantil = PALAVRAS_INFANTIL.some((p) => textoCategoria.includes(p));
  const modoEfetivo = modoTamanho;

  const precoNumero = Number(String(form.price || "").replace(/\./g, "").replace(",", "."));
  const descontoNumero = Math.min(90, Math.max(0, Math.round(Number(form.discountPercent) || 0)));
  const precoComDesconto =
    Number.isFinite(precoNumero) && precoNumero > 0 && descontoNumero > 0
      ? (precoNumero * (100 - descontoNumero)) / 100
      : null;

  const tamanhosExtras = form.sizes.filter((s) => {
    if (TAMANHOS_PADRAO.includes(s) || s === TAMANHO_UNICO) return false;
    if (modoEfetivo === "calcado") return ehNumeroCalcado(s);
    if (modoEfetivo === "roupa") return !ehNumeroCalcado(s);
    return true;
  });
  const gruposTamanho =
    modoEfetivo === "calcado"
      ? [
          ...(ehInfantil
            ? [
                { titulo: "Calçado infantil (13 ao 32)", opcoes: TAMANHOS_CALCADO_INFANTIL },
                { titulo: "Calçado adulto (33 ao 46)", opcoes: TAMANHOS_CALCADO_ADULTO },
              ]
            : [
                { titulo: "Calçado adulto (33 ao 46)", opcoes: TAMANHOS_CALCADO_ADULTO },
                { titulo: "Calçado infantil (13 ao 32)", opcoes: TAMANHOS_CALCADO_INFANTIL },
              ]),
          ...(tamanhosExtras.length ? [{ titulo: "Outros números", opcoes: tamanhosExtras }] : []),
        ]
      : modoEfetivo === "roupa"
        ? [
            { titulo: "Tamanhos de roupa", opcoes: TAMANHOS_ROUPA },
            ...(tamanhosExtras.length ? [{ titulo: "Outros tamanhos", opcoes: tamanhosExtras }] : []),
          ]
        : [];

  if (isEdit && (loadingEdit || loadError)) {
    return (
      <div className="produto-novo-page">
        <div className="produto-novo-wrap">
          <Link to={lojaPath} className="produto-novo-back">
            <i className="fas fa-arrow-left" aria-hidden /> Minha loja
          </Link>
          <p className="produto-novo-sub" style={{ marginTop: "1rem" }}>
            {loadError || "Carregando produto…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="produto-novo-page">
      <div className="produto-novo-wrap">
        <header className="produto-novo-header">
          <div>
            <Link to={lojaPath} className="produto-novo-back">
              <i className="fas fa-arrow-left" aria-hidden /> Minha loja
            </Link>
            <h1>{isEdit ? "Editar produto" : "Cadastrar produto"}</h1>
            <p className="produto-novo-sub">
              {isEdit
                ? "Altere fotos, preço, cores e tamanhos. As mudanças são salvas na API."
                : "Os dados são salvos na API (rascunho ou publicação)."}
            </p>
          </div>
        </header>

        <form id="form-produto-novo" className="produto-novo-form" onSubmit={handleSubmit}>
          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-images" aria-hidden /> Fotos do produto
            </h2>
            <p className="produto-novo-hint">Até 6 imagens. A primeira será a capa na vitrine.</p>

            <div className="produto-novo-gallery">
              {images.map((img, index) => (
                <div
                  key={img.id}
                  className={`produto-novo-thumb${index === 0 ? " is-cover" : ""}`}
                >
                  <img src={img.preview} alt="" />
                  {index === 0 ? <span className="produto-novo-cover-tag">Capa</span> : null}
                  <button
                    type="button"
                    className="produto-novo-thumb-remove"
                    aria-label="Remover foto"
                    onClick={() => removeImage(img.id)}
                  >
                    <i className="fas fa-times" aria-hidden />
                  </button>
                </div>
              ))}

              {images.length < 6 ? (
                <label className="produto-novo-upload">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesChange}
                  />
                  <i className="fas fa-plus" aria-hidden />
                  <span>Adicionar foto</span>
                </label>
              ) : null}
            </div>
          </section>

          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-tag" aria-hidden /> Informações básicas
            </h2>

            <label className="produto-novo-field">
              <span>Nome do produto *</span>
              <input
                type="text"
                placeholder="Ex.: Vestido linho verão"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                maxLength={120}
              />
            </label>

            <label className="produto-novo-field">
              <span>Descrição</span>
              <textarea
                rows={4}
                placeholder="Detalhes, material, cuidados, medidas…"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                maxLength={2000}
              />
            </label>

          </section>

          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-th-large" aria-hidden /> Categoria
            </h2>
            <p className="produto-novo-hint">
              Escolha onde o produto aparece em Categorias. Ex.: Jaqueta de couro feminina → Moda
              Feminina › Casacos e jaquetas femininas.
            </p>
            <CategoriaPicker
              categorias={categorias}
              value={form.categoryId}
              onChange={(id) => updateField("categoryId", id)}
            />

            <div className="produto-novo-cat-extra">
              {extraAberta || form.extraCategoryIds.length > 0 ? (
                <>
                  <div className="produto-novo-cat-extra__head">
                    <strong>Categoria adicional (opcional)</strong>
                    <button
                      type="button"
                      className="produto-novo-cat-extra__remove"
                      onClick={() => {
                        updateField("extraCategoryIds", []);
                        setExtraAberta(false);
                      }}
                    >
                      <i className="fas fa-times" aria-hidden /> Remover
                    </button>
                  </div>
                  <p className="produto-novo-hint">
                    O produto também aparece nesta categoria. Ex.: tênis em Calçados › Tênis e em
                    Streetwear › Tênis streetwear.
                  </p>
                  <CategoriaPicker
                    categorias={categorias}
                    value={form.extraCategoryIds[0] || ""}
                    onChange={(id) => updateField("extraCategoryIds", id ? [id] : [])}
                    obrigatorio={false}
                    ocultarIds={form.categoryId ? [Number(form.categoryId)] : []}
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="produto-novo-chip produto-novo-cat-extra__add"
                  onClick={() => setExtraAberta(true)}
                >
                  <i className="fas fa-plus" aria-hidden /> Adicionar outra categoria (ex.: Streetwear)
                </button>
              )}
            </div>
          </section>

          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-dollar-sign" aria-hidden /> Preço e estoque
            </h2>

            <div className="produto-novo-row">
              <label className="produto-novo-field">
                <span>Preço *</span>
                <span className="produto-novo-adorno">
                  <span className="produto-novo-adorno__txt">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={form.price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                  />
                </span>
              </label>
              <label className="produto-novo-field">
                <span>Desconto</span>
                <span className="produto-novo-adorno produto-novo-adorno--fim">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.discountPercent}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                  />
                  <span className="produto-novo-adorno__txt">%</span>
                </span>
              </label>
            </div>
            {precoComDesconto != null ? (
              <p className="produto-novo-desconto">
                <i className="fas fa-tag" aria-hidden /> Com {descontoNumero}% de desconto o cliente
                paga <strong>{formatBRL(precoComDesconto)}</strong>{" "}
                <s>{formatBRL(precoNumero)}</s> — vale na vitrine e no checkout.
              </p>
            ) : null}

            <p className="produto-novo-estoque-total">
              <i className="fas fa-boxes-stacked" aria-hidden /> Estoque total:{" "}
              <strong>{estoqueTotal} peça(s)</strong> — soma da tabela de estoque abaixo.
            </p>
          </section>

          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-palette" aria-hidden /> Variações{" "}
              <span className="produto-novo-opcional">(opcional)</span>
            </h2>
            <p className="produto-novo-hint">
              Pode publicar só com foto, nome, categoria e preço — sem cor e sem tamanho. Se quiser,
              adicione cores e/ou tamanhos abaixo.
            </p>

            <div className="produto-novo-chips-group">
              <span className="produto-novo-chips-label">Cores (opcional)</span>
              {form.colors.length > 0 ? (
                <div className="produto-novo-chips produto-novo-chips--tags">
                  {form.colors.map((cor) => (
                    <span key={cor} className="produto-novo-chip produto-novo-chip--tag is-on">
                      {cor}
                      <button
                        type="button"
                        className="produto-novo-chip-remove"
                        aria-label={`Remover cor ${cor}`}
                        onClick={() => removeColor(cor)}
                      >
                        <i className="fas fa-times" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="produto-novo-color-add">
                <input
                  type="text"
                  className="produto-novo-color-input"
                  placeholder="Nova cor (Enter para adicionar)"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={onEnter(addColor)}
                  maxLength={40}
                />
                <button type="button" className="produto-novo-chip" onClick={addColor}>
                  Adicionar
                </button>
              </div>
            </div>

            <div className="produto-novo-chips-group">
              <span className="produto-novo-chips-label">Tamanhos (opcional)</span>
              <div className="produto-novo-modos" role="radiogroup" aria-label="Tipo de tamanho">
                {MODOS_TAMANHO.map((modo) => (
                  <label
                    key={modo.id}
                    className={`produto-novo-modo${modoEfetivo === modo.id ? " is-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name="modo-tamanho"
                      value={modo.id}
                      checked={modoEfetivo === modo.id}
                      onChange={() => escolherModoTamanho(modo.id)}
                    />
                    <span>
                      <strong>{modo.label}</strong>
                      <small>{modo.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {modoEfetivo !== "unico" ? (
              <div className="produto-novo-chips-group">
                {gruposTamanho.map((grupo) => (
                  <div key={grupo.titulo} className="produto-novo-tamanhos">
                    <span className="produto-novo-chips-label">{grupo.titulo}</span>
                    <div className="produto-novo-chips">
                      {grupo.opcoes.map((tam) => (
                        <button
                          key={tam}
                          type="button"
                          className={`produto-novo-chip${form.sizes.includes(tam) ? " is-on" : ""}`}
                          onClick={() => toggleSize(tam)}
                        >
                          {tam}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="produto-novo-color-add" style={{ marginTop: "0.65rem" }}>
                  <input
                    type="text"
                    className="produto-novo-color-input"
                    placeholder={
                      modoEfetivo === "calcado"
                        ? "Outro número (ex.: 47)"
                        : "Outro tamanho (ex.: 38, 40, 2 anos)"
                    }
                    value={sizeInput}
                    onChange={(e) => setSizeInput(e.target.value)}
                    onKeyDown={onEnter(addSize)}
                    maxLength={20}
                  />
                  <button type="button" className="produto-novo-chip" onClick={addSize}>
                    Adicionar
                  </button>
                </div>
              </div>
            ) : (
              <p className="produto-novo-hint produto-novo-hint--ok">
                <i className="fas fa-check-circle" aria-hidden /> Sem tamanho selecionado — pode
                publicar assim. O sistema guarda o estoque automaticamente
                {form.colors.length ? " por cor" : ""}.
              </p>
            )}
          </section>

          <section className="produto-novo-card">
            <h2>
              <i className="fas fa-boxes-stacked" aria-hidden /> Estoque
              {modoEfetivo === "unico"
                ? form.colors.length
                  ? " por cor"
                  : ""
                : " por tamanho e cor"}
            </h2>
            <p className="produto-novo-hint">
              {modoEfetivo === "unico"
                ? form.colors.length
                  ? "Informe quantas peças tem de cada cor."
                  : "Informe quantas peças tem deste produto (pode deixar 0 e repor depois no Meu estoque)."
                : modoEfetivo === "calcado"
                  ? "Cada número (ex.: Preto 38 e Preto 39) tem o seu estoque. Marque os números que você vende."
                  : "Cada combinação cor × tamanho tem o seu estoque."}
            </p>
            {combinacoes.length > 1 ? (
              <div className="produto-novo-var-preencher">
                <span>Preencher todas com</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Ex.: 10"
                  value={preencherTodas}
                  onChange={(e) => setPreencherTodas(e.target.value)}
                />
                <button type="button" className="produto-novo-chip" onClick={aplicarEmTodas}>
                  Aplicar
                </button>
              </div>
            ) : null}
            <div className="produto-novo-var-tabela-wrap">
              <table className="produto-novo-var-tabela">
                <thead>
                  <tr>
                    {modoEfetivo === "unico" && !form.colors.length ? (
                      <th>Quantidade em estoque</th>
                    ) : (
                      <>
                        <th>Cor</th>
                        {modoEfetivo !== "unico" ? <th>Tamanho</th> : null}
                        <th>Quantidade</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {combinacoes.map((c) => {
                    const chave = chaveVariacao(c.cor, c.tamanho);
                    const soQuantidade = modoEfetivo === "unico" && !form.colors.length;
                    return (
                      <tr key={chave}>
                        {soQuantidade ? null : (
                          <td>{c.cor === COR_UNICA ? "—" : c.cor}</td>
                        )}
                        {modoEfetivo !== "unico" ? (
                          <td>{c.tamanho === TAMANHO_UNICO ? "—" : c.tamanho}</td>
                        ) : null}
                        <td>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            aria-label={`Quantidade de ${c.cor} ${c.tamanho}`}
                            value={form.variacoes?.[chave] ?? ""}
                            onChange={(e) => atualizarEstoqueVariacao(chave, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="produto-novo-footer">
            {!isEdit ? (
              <button
                type="button"
                className="produto-novo-btn produto-novo-btn--ghost"
                onClick={handleDraftSave}
                disabled={saving}
              >
                Salvar rascunho
              </button>
            ) : null}
            <Link to={lojaPath} className="produto-novo-btn produto-novo-btn--ghost">
              Cancelar
            </Link>
            <button
              type="submit"
              className="produto-novo-btn produto-novo-btn--primary"
              disabled={saving}
            >
              {isEdit
                ? saving
                  ? "Salvando…"
                  : "Salvar alterações"
                : saving
                  ? "Publicando…"
                  : "Publicar produto"}
            </button>
          </footer>
        </form>
      </div>

      {sucesso ? (
        <SucessoModal
          titulo={
            sucesso.tipo === "publicado" ? "Produto cadastrado com sucesso!" : "Rascunho salvo com sucesso!"
          }
          mensagem={
            sucesso.tipo === "publicado"
              ? `"${form.title.trim()}" já está publicado e aparece na sua loja.`
              : "Você pode terminar e publicar depois, na aba Rascunhos da sua loja."
          }
          imagem={images[0]?.preview}
          acoes={
            sucesso.tipo === "publicado"
              ? [
                  ...(sucesso.produtoId
                    ? [
                        {
                          to: `${lojaPath}/p/${sucesso.produtoId}`,
                          label: "Ver meu produto",
                          icone: "fa-eye",
                          primaria: true,
                        },
                      ]
                    : []),
                  { to: `${lojaPath}?aba=produtos`, label: "Voltar para minha loja", icone: "fa-store" },
                ]
              : [
                  {
                    to: `${lojaPath}?aba=rascunhos`,
                    label: "Ver meus rascunhos",
                    icone: "fa-file-alt",
                    primaria: true,
                  },
                  { to: `${lojaPath}?aba=produtos`, label: "Voltar para minha loja", icone: "fa-store" },
                ]
          }
          onClose={() => navigate(`${lojaPath}?aba=${sucesso.tipo === "publicado" ? "produtos" : "rascunhos"}`, { replace: true })}
        />
      ) : null}
    </div>
  );
}
