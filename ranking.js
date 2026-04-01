// Cole aqui o link da planilha do ranking ou o link de exportacao CSV.
const RANKING_SHEET_URL = "https://docs.google.com/spreadsheets/d/10t1-ovZJxhwIPCW64IsOSpN1PPtDe9UZouuERrxUNEY/edit?usp=sharing";
const RANKING_SHEET_NAME = "";

const sheetStatusElement = document.getElementById("ranking-sheet-status");
const searchInputElement = document.getElementById("ranking-search");
const tableBodyElement = document.getElementById("ranking-table-body");
const cardListElement = document.getElementById("ranking-card-list");
const tableHeadingElement = document.getElementById("ranking-table-heading");
const categoryButtonsContainer = document.getElementById("ranking-category-buttons");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const genderButtons = [...document.querySelectorAll("[data-gender]")];

let selectedView = "general";
let selectedGender = "all";
let selectedCategory = "all";
let rankingData = createEmptyRankingData();

initializeRankingPage();

function initializeRankingPage() {
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedView = button.dataset.view || "general";
      updateToggleButtons(viewButtons, selectedView, "data-view");
      renderRanking();
    });
  });

  genderButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedGender = button.dataset.gender || "all";
      updateToggleButtons(genderButtons, selectedGender, "data-gender");
      renderRanking();
    });
  });

  categoryButtonsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) {
      return;
    }

    selectedCategory = button.dataset.category || "all";
    updateCategoryButtons();
    renderRanking();
  });

  searchInputElement.addEventListener("input", () => {
    renderRanking();
  });

  updateToggleButtons(viewButtons, selectedView, "data-view");
  updateToggleButtons(genderButtons, selectedGender, "data-gender");
  updateCategoryButtons();
  loadRankingFromSheet();
}

async function loadRankingFromSheet() {
  if (!RANKING_SHEET_URL) {
    setSheetStatus("Cole o link da planilha");
    renderEmptyState("Conecte a planilha em ranking.js para visualizar o ranking do circuito.");
    return;
  }

  try {
    setSheetStatus("Carregando planilha...");
    const csvUrl = buildCsvUrl(RANKING_SHEET_URL);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    rankingData = parseRankingCsv(csvContent);
    renderCategoryButtons(rankingData.categories);
    renderRanking();
    setSheetStatus("Planilha conectada");
  } catch (error) {
    console.error("Erro ao carregar ranking do circuito:", error);
    rankingData = createEmptyRankingData();
    renderCategoryButtons([]);
    renderEmptyState(
      "Nao foi possivel carregar a planilha. Verifique o link em ranking.js e confirme se a base esta acessivel."
    );
    setSheetStatus("Erro ao carregar");
  }
}

function parseRankingCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (rows.length < 2) {
    return createEmptyRankingData();
  }

  const headers = rows[0].map((header, index) => ({
    index,
    normalized: normalizeHeader(header)
  }));

  const athleteColumn = findHeader(headers, ["atleta", "nome", "corredor", "competidor"]);
  const categoryColumn = findHeader(headers, ["faixa etaria", "faixa_etaria", "categoria", "faixa"]);
  const sexColumn = findHeader(headers, ["sexo", "genero"]);
  const stageColumn = findHeader(headers, ["etapa", "prova"]);
  const dateColumn = findHeader(headers, ["data"]);
  const generalPointsColumn = findHeader(headers, ["pontos geral", "pontuacao geral", "pontos_geral"]);
  const categoryPointsColumn = findHeader(headers, ["pontos categoria", "pontuacao categoria", "pontos_categoria"]);
  const validTypeColumn = findHeader(headers, ["pontuacao valida", "pontuacao_valida", "tipo pontuacao", "ranking valido"]);
  const validPointsColumn = findHeader(headers, ["pontos validos", "pontos_validos", "total valido"]);

  if (!athleteColumn) {
    throw new Error("Coluna de atleta nao encontrada na planilha.");
  }

  const rawRows = rows
    .slice(1)
    .map((row) => createRankingRow({
      row,
      athleteColumn,
      categoryColumn,
      sexColumn,
      stageColumn,
      dateColumn,
      generalPointsColumn,
      categoryPointsColumn,
      validTypeColumn,
      validPointsColumn
    }))
    .filter((entry) => entry.athlete);

  const categories = [...new Set(rawRows.map((entry) => entry.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );

  return {
    generalEntries: buildRanking(rawRows, "general"),
    categoryEntries: buildRanking(rawRows, "category"),
    categories
  };
}

function createRankingRow({
  row,
  athleteColumn,
  categoryColumn,
  sexColumn,
  stageColumn,
  dateColumn,
  generalPointsColumn,
  categoryPointsColumn,
  validTypeColumn,
  validPointsColumn
}) {
  const athlete = getCellValue(row, athleteColumn.index);
  const category = getCellValue(row, categoryColumn ? categoryColumn.index : -1);
  const sex = getCellValue(row, sexColumn ? sexColumn.index : -1);
  const stageName = getCellValue(row, stageColumn ? stageColumn.index : -1);
  const date = getCellValue(row, dateColumn ? dateColumn.index : -1);
  const stageKey = [stageName, date].filter(Boolean).join(" - ") || stageName || date;
  const stageLabel = `Etapa ${getCellValue(row, stageColumn ? stageColumn.index : -1) || "?"}`;
  const generalPoints = parsePositiveNumber(getCellValue(row, generalPointsColumn ? generalPointsColumn.index : -1));
  const categoryPoints = parsePositiveNumber(getCellValue(row, categoryPointsColumn ? categoryPointsColumn.index : -1));
  const validPoints = parsePositiveNumber(getCellValue(row, validPointsColumn ? validPointsColumn.index : -1));
  const validType = normalizeRankType(getCellValue(row, validTypeColumn ? validTypeColumn.index : -1));

  return {
    athlete,
    category,
    sex,
    stageKey,
    stageLabel,
    ...resolvePointContributions({
      generalPoints,
      categoryPoints,
      validPoints,
      validType
    })
  };
}

function resolvePointContributions({ generalPoints, categoryPoints, validPoints, validType }) {
  if (validType === "general") {
    return {
      generalPoints: validPoints || generalPoints,
      categoryPoints: 0
    };
  }

  if (validType === "category") {
    return {
      generalPoints: 0,
      categoryPoints: validPoints || categoryPoints
    };
  }

  return {
    generalPoints,
    categoryPoints: generalPoints > 0 ? 0 : (validPoints || categoryPoints)
  };
}

function buildRanking(rows, mode) {
  const rankingMap = new Map();

  rows.forEach((entry) => {
    if (mode === "category" && !entry.category) {
      return;
    }

    const key = mode === "category"
      ? `${entry.athlete.toLowerCase()}|${entry.category.toLowerCase()}`
      : entry.athlete.toLowerCase();

    if (!rankingMap.has(key)) {
      rankingMap.set(key, {
        athlete: entry.athlete,
        category: entry.category,
        sex: entry.sex,
        totalPoints: 0,
        stagePoints: new Map()
      });
    }

    const athleteEntry = rankingMap.get(key);
    const points = mode === "general" ? entry.generalPoints : entry.categoryPoints;

    athleteEntry.category = athleteEntry.category || entry.category;
    athleteEntry.sex = athleteEntry.sex || entry.sex;
    athleteEntry.totalPoints += points;

    if (points > 0 && entry.stageLabel) {
      athleteEntry.stagePoints.set(entry.stageLabel, points);
    }
  });

  return [...rankingMap.values()]
    .map((entry) => ({
      athlete: entry.athlete,
      category: entry.category,
      sex: entry.sex,
      stage1: entry.stagePoints.get("Etapa 1") || 0,
      stage2: entry.stagePoints.get("Etapa 2") || 0,
      totalPoints: entry.totalPoints
    }))
    .filter((entry) => entry.totalPoints > 0)
    .sort(sortRankingEntries);
}

function renderRanking() {
  const currentEntries = filterEntries(
    selectedView === "general" ? rankingData.generalEntries : rankingData.categoryEntries
  );

  renderTable(currentEntries);
  renderCards(currentEntries);
  renderTableHeading();
}

function renderTable(entries) {
  if (!entries.length) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="7">Nenhum atleta encontrado para o filtro atual.</td>
      </tr>
    `;
    return;
  }

  tableBodyElement.innerHTML = entries
    .map((entry, index) => `
      <tr>
        <td><span class="ranking-position">${index + 1}</span></td>
        <td>${escapeHtml(entry.athlete)}</td>
        <td>${escapeHtml(formatGenderLabel(entry.sex))}</td>
        <td>${escapeHtml(entry.category || "-")}</td>
        <td>${entry.stage1 || "-"}</td>
        <td>${entry.stage2 || "-"}</td>
        <td class="ranking-points">${formatPoints(entry.totalPoints)}</td>
      </tr>
    `)
    .join("");
}

function renderCards(entries) {
  if (!entries.length) {
    cardListElement.innerHTML = `
      <article class="ranking-athlete-card">
        <p class="ranking-card-empty">Nenhum atleta encontrado para o filtro atual.</p>
      </article>
    `;
    return;
  }

  cardListElement.innerHTML = entries
    .map((entry, index) => `
      <article class="ranking-athlete-card">
        <div class="ranking-athlete-card-top">
          <span class="ranking-position">${index + 1}</span>
          <div class="ranking-athlete-main">
            <p class="ranking-athlete-name">${escapeHtml(entry.athlete)}</p>
            <p class="ranking-athlete-meta">${escapeHtml(formatGenderLabel(entry.sex))} - ${escapeHtml(entry.category || "Sem categoria")}</p>
          </div>
          <div class="ranking-athlete-total">
            <span class="ranking-athlete-total-label">Total</span>
            <strong>${formatPoints(entry.totalPoints)}</strong>
          </div>
        </div>
        <div class="ranking-athlete-card-bottom">
          <span class="ranking-chip">Etapa 1: ${entry.stage1 || "-"}</span>
          <span class="ranking-chip">Etapa 2: ${entry.stage2 || "-"}</span>
        </div>
      </article>
    `)
    .join("");
}

function renderEmptyState(message) {
  tableBodyElement.innerHTML = `
    <tr>
      <td colspan="7">${escapeHtml(message)}</td>
    </tr>
  `;

  cardListElement.innerHTML = `
    <article class="ranking-athlete-card">
      <p class="ranking-card-empty">${escapeHtml(message)}</p>
    </article>
  `;
}

function renderCategoryButtons(categories) {
  const availableCategories = ["all", ...categories];

  if (!availableCategories.includes(selectedCategory)) {
    selectedCategory = "all";
  }

  categoryButtonsContainer.innerHTML = availableCategories
    .map((category) => {
      const label = category === "all" ? "Todas as categorias" : category;
      const activeClass = selectedCategory === category ? " toggle-button-active" : "";

      return `<button type="button" class="toggle-button ranking-category-button${activeClass}" data-category="${escapeHtmlAttribute(category)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function renderTableHeading() {
  tableHeadingElement.textContent = selectedView === "general" ? "Ranking Geral" : "Ranking por Categoria";
}

function updateToggleButtons(buttons, selectedValue, attributeName) {
  buttons.forEach((button) => {
    const isActive = button.getAttribute(attributeName) === selectedValue;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateCategoryButtons() {
  [...categoryButtonsContainer.querySelectorAll("[data-category]")].forEach((button) => {
    const isActive = button.dataset.category === selectedCategory;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function filterEntries(entries) {
  const normalizedSearch = String(searchInputElement.value || "").trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesSearch = !normalizedSearch || entry.athlete.toLowerCase().includes(normalizedSearch);
    const matchesGender = selectedGender === "all" || normalizeHeader(entry.sex) === normalizeHeader(selectedGender);
    const matchesCategory = selectedCategory === "all" || entry.category === selectedCategory;
    return matchesSearch && matchesGender && matchesCategory;
  });
}

function formatGenderLabel(value) {
  const normalizedValue = normalizeHeader(value);

  if (normalizedValue === "fem") {
    return "Feminino";
  }

  if (normalizedValue === "mas") {
    return "Masculino";
  }

  return value || "Sem genero";
}

function setSheetStatus(text) {
  sheetStatusElement.textContent = text;
}

function sortRankingEntries(first, second) {
  if (second.totalPoints !== first.totalPoints) {
    return second.totalPoints - first.totalPoints;
  }

  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function findHeader(headers, aliases) {
  return headers.find((header) =>
    aliases.some((alias) => header.normalized === alias || header.normalized.includes(alias))
  );
}

function normalizeRankType(value) {
  const normalizedValue = normalizeHeader(value);

  if (["geral", "ranking geral", "classificacao geral"].includes(normalizedValue)) {
    return "general";
  }

  if (["categoria", "faixa etaria", "faixa", "ranking categoria"].includes(normalizedValue)) {
    return "category";
  }

  return "";
}

function getCellValue(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function parsePositiveNumber(value) {
  const numericValue = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function buildCsvUrl(sheetUrl) {
  const safeUrl = String(sheetUrl || "").trim();
  const safeSheetName = String(RANKING_SHEET_NAME || "").trim();

  if (!safeUrl) {
    return "";
  }

  if (/export\?format=csv/i.test(safeUrl) || /tqx=out:csv/i.test(safeUrl)) {
    return safeUrl;
  }

  const match = safeUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (!match) {
    return safeUrl;
  }

  const sheetId = match[1];

  if (safeSheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(safeSheetName)}`;
  }

  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function createEmptyRankingData() {
  return {
    generalEntries: [],
    categoryEntries: [],
    categories: []
  };
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
