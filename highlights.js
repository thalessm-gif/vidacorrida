// Cole aqui o link da sua planilha do Google Sheets ou o link de exportacao CSV.
const HIGHLIGHTS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1totTCrCymqU5gpsuYMrRgYoHOCSfrVIP3B8xNy2JKlw/edit?usp=sharing";

const athletesCountElement = document.getElementById("athletes-count");
const weeksCountElement = document.getElementById("weeks-count");
const perfectCountElement = document.getElementById("perfect-count");
const sheetStatusElement = document.getElementById("sheet-status");
const perfectListElement = document.getElementById("perfect-list");
const tableBodyElement = document.getElementById("highlights-table-body");
const searchInputElement = document.getElementById("highlights-search");

let highlightEntries = [];

initializeHighlightsPage();

function initializeHighlightsPage() {
  searchInputElement.addEventListener("input", () => {
    renderHighlightsTable(filterEntries(searchInputElement.value));
  });

  loadHighlightsFromSheet();
}

async function loadHighlightsFromSheet() {
  if (!HIGHLIGHTS_SHEET_URL) {
    setSheetStatus("Cole o link da planilha");
    renderSummary({ athleteCount: 0, weekCount: 0, perfectCount: 0 });
    renderPerfectMessage(
      "Assim que voce conectar a planilha, esta area vai mostrar quem esteve em destaque em todas as semanas."
    );
    renderErrorState("Conecte a planilha em highlights.js para visualizar os dados.");
    return;
  }

  try {
    setSheetStatus("Carregando informações...");
    const csvUrl = buildCsvUrl(HIGHLIGHTS_SHEET_URL);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    const parsedSheet = parseHighlightsCsv(csvContent);

    highlightEntries = parsedSheet.entries;
    renderSummary({
      athleteCount: parsedSheet.entries.length,
      weekCount: parsedSheet.weekColumns.length,
      perfectCount: parsedSheet.entries.filter((entry) => entry.isPerfect).length
    });
    renderPerfectList(parsedSheet.entries.filter((entry) => entry.isPerfect));
    renderHighlightsTable(filterEntries(searchInputElement.value));
    setSheetStatus("Informações Atualizadas");
  } catch (error) {
    console.error("Erro ao carregar destaques semanais:", error);
    highlightEntries = [];
    setSheetStatus("Erro ao carregar");
    renderSummary({ athleteCount: 0, weekCount: 0, perfectCount: 0 });
    renderPerfectMessage(
      "Nao foi possivel confirmar os atletas 100% ativos porque a leitura da planilha falhou."
    );
    renderErrorState(
      "Nao foi possivel carregar a planilha. Verifique o link em highlights.js e confirme se a planilha esta acessivel."
    );
  }
}

function buildCsvUrl(sheetUrl) {
  const safeUrl = String(sheetUrl || "").trim();

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
  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseHighlightsCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (rows.length < 2) {
    return { entries: [], weekColumns: [] };
  }

  const headers = rows[0].map((header, index) => ({
    index,
    label: String(header || "").trim(),
    normalized: normalizeHeader(header)
  }));

  const nameColumn = headers.find((header) =>
    ["nome", "atleta", "atletas"].includes(header.normalized)
  );
  const totalColumn = headers.find((header) => header.normalized === "total");
  const explicitWeekColumns = headers.filter((header) => /^semana/.test(header.normalized));
  const fallbackWeekColumns = headers.filter(
    (header) => header !== nameColumn && header !== totalColumn
  );
  const weekColumns = explicitWeekColumns.length ? explicitWeekColumns : fallbackWeekColumns;

  if (!nameColumn) {
    throw new Error("Coluna de nome nao encontrada.");
  }

  const entries = rows
    .slice(1)
    .map((row) => createHighlightEntry(row, nameColumn, totalColumn, weekColumns))
    .filter((entry) => entry.name)
    .sort(sortHighlightEntries);

  return { entries, weekColumns };
}

function createHighlightEntry(row, nameColumn, totalColumn, weekColumns) {
  const name = getCellValue(row, nameColumn.index);
  const activeWeeks = weekColumns
    .filter((column) => isActiveValue(getCellValue(row, column.index)))
    .map((column) => column.label);
  const activeWeekShortLabels = activeWeeks.map(getWeekShortLabel);
  const computedTotal = activeWeeks.length;
  const totalFromSheet = parsePositiveNumber(getCellValue(row, totalColumn ? totalColumn.index : -1));
  const total = totalFromSheet || computedTotal;
  const isPerfect = weekColumns.length > 0 && activeWeeks.length === weekColumns.length;

  return {
    name,
    activeWeeks,
    activeWeekShortLabels,
    total,
    isPerfect
  };
}

function renderSummary({ athleteCount, weekCount, perfectCount }) {
  athletesCountElement.textContent = String(athleteCount);
  weeksCountElement.textContent = String(weekCount);
  perfectCountElement.textContent = String(perfectCount);
}

function renderPerfectList(entries) {
  if (!entries.length) {
    renderPerfectMessage(
      "Nenhum atleta 100% ativo encontrado ainda. Quando alguem completar todas as semanas, ele aparece aqui."
    );
    return;
  }

  perfectListElement.innerHTML = entries
    .map(
      (entry) => `<span class="perfect-name-pill">${escapeHtml(entry.name)}</span>`
    )
    .join("");
}

function renderPerfectMessage(message) {
  perfectListElement.innerHTML = `
    <p class="empty-state">
      ${escapeHtml(message)}
    </p>
  `;
}

function renderHighlightsTable(entries) {
  if (!entries.length) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="4">Nenhum atleta encontrado para o filtro atual.</td>
      </tr>
    `;
    return;
  }

  tableBodyElement.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.name)}</td>
          <td>
            ${entry.activeWeekShortLabels.length
              ? `
                <div class="week-chip-list week-chip-list-compact">
                  ${entry.activeWeekShortLabels
                    .map((week) => `<span class="week-chip">${escapeHtml(week)}</span>`)
                    .join("")}
                </div>
              `
              : "-"}
          </td>
          <td>${entry.total}</td>
          <td>
            <span class="table-status ${entry.isPerfect ? "table-status-perfect" : ""}">
              ${entry.isPerfect ? "100% ativo" : "Parcial"}
            </span>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderErrorState(message) {
  tableBodyElement.innerHTML = `
    <tr>
      <td colspan="4">${escapeHtml(message)}</td>
    </tr>
  `;
}

function filterEntries(searchTerm) {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  if (!normalizedSearch) {
    return highlightEntries;
  }

  return highlightEntries.filter((entry) =>
    entry.name.toLowerCase().includes(normalizedSearch)
  );
}

function sortHighlightEntries(first, second) {
  if (second.isPerfect !== first.isPerfect) {
    return Number(second.isPerfect) - Number(first.isPerfect);
  }

  if (second.total !== first.total) {
    return second.total - first.total;
  }

  return first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" });
}

function setSheetStatus(text) {
  sheetStatusElement.textContent = text;
}

function getCellValue(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function parsePositiveNumber(value) {
  const numericValue = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function isActiveValue(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "x" || normalizedValue === "sim";
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getWeekShortLabel(value) {
  const label = String(value || "").trim();
  const numberMatch = label.match(/\d+/);
  return numberMatch ? numberMatch[0] : label;
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
