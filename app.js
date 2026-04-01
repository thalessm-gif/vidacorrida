const DISTANCE_ORDER = ["3km", "5km", "10km", "21km"];
const SHIRT_SIZE_ORDER = ["PP", "P", "M", "G", "GG"];
const STORAGE_KEY = "kit-withdrawal-entries";
const LEGACY_STORAGE_KEYS = ["kit-withdrawal-entries", "kitWithdrawalEntries"];
const DB_NAME = "kit-withdrawal-db";
const STORE_NAME = "entries";
const GOOGLE_SHEETS_ONLY_MODE = true;

// Para persistencia real entre acessos e aparelhos, publique o Apps Script e cole a URL abaixo.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxpnGjHiV8bDvK9Hia6Fk67evAgJLUdektoQpUIaJzFyjP1jZZIxszEntAdY3VbzfL6/exec";

const form = document.getElementById("kit-form");
const fullNameInput = document.getElementById("fullName");
const distanceInput = document.getElementById("distance");
const shirtSizeInput = document.getElementById("shirtSize");
const messageElement = document.getElementById("form-message");
const groupsContainer = document.getElementById("distance-groups");
const shirtSummaryContainer = document.getElementById("shirt-summary");
const tableBody = document.getElementById("entries-table-body");
const totalCountElement = document.getElementById("total-count");
const exportButton = document.getElementById("export-button");
const submitButton = form.querySelector('button[type="submit"]');
const statusBox = document.getElementById("status-box");
const statusBoxTitle = document.getElementById("status-box-title");
const statusBoxText = document.getElementById("status-box-text");
const statusSpinner = document.getElementById("status-spinner");

let entries = [];
let statusHideTimeoutId = null;

render();
initializeApp();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isFormDisabled()) {
    return;
  }

  const fullName = fullNameInput.value.trim().replace(/\s+/g, " ");
  const distance = distanceInput.value;
  const shirtSize = shirtSizeInput.value;

  if (!fullName || !distance || !shirtSize) {
    showMessage("Preencha todos os campos antes de enviar.", true);
    return;
  }

  const newEntry = {
    id: createEntryId(),
    fullName,
    distance,
    shirtSize,
    createdAt: new Date().toISOString()
  };

  setFormDisabled(true);
  showStatus({
    title: "Enviando dados...",
    text: "Aguarde enquanto atualizamos a planilha e recarregamos a lista.",
    busy: true
  });

  try {
    if (shouldUseGoogleSheetsAsSingleSource()) {
      const syncStatus = await syncWithGoogleSheets(newEntry);

      if (syncStatus === "synced" || syncStatus === "queued") {
        const refreshedEntries = await refreshEntriesFromGoogleSheets(newEntry);

        if (refreshedEntries) {
          entries = refreshedEntries;
          await clearBrowserEntries();
          render();
          resetFormAfterSubmit();
          showMessage("Dados enviados com sucesso.");
          showStatus({
            title: "Dados enviados com sucesso",
            text: "A lista foi atualizada com as informações mais recentes.",
            tone: "success",
            hideAfterMs: 4000
          });
          return;
        }
      }

      showMessage("Não foi possivel confirmar a atualização da planilha.", true);
      showStatus({
        title: "Falha ao atualizar",
        text: "Os dados nao puderam ser confirmados na planilha agora. Verifique o Apps Script e tente novamente.",
        tone: "error"
      });
      return;
    }

    entries = sortEntries([...entries, newEntry]);
    await persistEntries(entries);
    render();

    const syncStatus = await syncWithGoogleSheets(newEntry);

    if (syncStatus === "synced" || syncStatus === "queued") {
      const refreshedEntries = await refreshEntriesFromGoogleSheets(newEntry);

      if (refreshedEntries) {
        entries = sortEntries(mergeEntries(entries, refreshedEntries));
        await persistEntries(entries);
        render();
      }
    }

    if (syncStatus === "synced" || syncStatus === "queued" || syncStatus === "disabled" || syncStatus === "local_only") {
      resetFormAfterSubmit();
      showMessage(getSubmitMessage(syncStatus));
      showStatus({
        title: "Dados enviados com sucesso",
        text: "O cadastro foi processado e a lista ja foi atualizada na tela.",
        tone: "success",
        hideAfterMs: 4000
      });
      return;
    }

    showMessage(getSubmitMessage(syncStatus), true);
    showStatus({
      title: "Falha ao enviar dados",
      text: getSubmitMessage(syncStatus),
      tone: "error"
    });
  } catch (error) {
    console.error("Erro ao enviar cadastro:", error);
    showMessage("Nao foi possivel concluir o envio agora.", true);
    showStatus({
      title: "Falha ao enviar dados",
      text: "Tivemos um problema ao processar o cadastro. Tente novamente em alguns instantes.",
      tone: "error"
    });
  } finally {
    setFormDisabled(false);
  }
});

exportButton.addEventListener("click", () => {
  if (!entries.length) {
    showMessage("Ainda nao ha cadastros para exportar.", true);
    return;
  }

  const csvLines = [
    ["Nome completo", "Distancia", "Tamanho da camisa"],
    ...sortEntries([...entries]).map((entry) => [entry.fullName, entry.distance, entry.shirtSize])
  ];

  const csvContent = csvLines
    .map((line) => line.map(escapeCsvValue).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);

  link.href = downloadUrl;
  link.download = `retirada-kits-${today}.csv`;
  link.click();

  URL.revokeObjectURL(downloadUrl);
  showMessage("Arquivo CSV exportado com sucesso.");
});

async function initializeApp() {
  showMessage("Carregando cadastros...");
  setFormDisabled(true);
  showStatus({
    title: "Carregando informações...",
    text: "Aguarde enquanto buscamos os dados mais recentes.",
    busy: true
  });

  try {
    if (shouldUseGoogleSheetsAsSingleSource()) {
      entries = sortEntries(await loadEntriesFromGoogleSheets({ throwOnError: true }));
      await clearBrowserEntries();
      render();
      showMessage(
        entries.length
          ? "Cadastros carregados do Google Sheets."
          : "Sistema pronto. Os dados exibidos virao somente do Google Sheets."
      );
      hideStatus();
      fullNameInput.focus();
      return;
    }

    const localEntries = loadEntriesFromLocalStorage();
    const indexedDbEntries = await loadEntriesFromIndexedDB();
    let mergedEntries = mergeEntries(localEntries, indexedDbEntries);

    if (isGoogleScriptConfigured()) {
      const remoteEntries = await loadEntriesFromGoogleSheets();
      mergedEntries = mergeEntries(mergedEntries, remoteEntries);
    }

    entries = sortEntries(mergedEntries);
    await persistEntries(entries);
    render();

    showMessage(
      entries.length
        ? (
          isGoogleScriptConfigured()
            ? "Cadastros carregados com sucesso."
            : getLocalStorageHint()
        )
        : (
          isGoogleScriptConfigured()
            ? "Sistema pronto para receber cadastros."
            : getLocalStorageHint()
        )
    );
    hideStatus();
    fullNameInput.focus();
  } catch (error) {
    console.error("Erro ao inicializar a pagina:", error);
    entries = [];
    render();
    showMessage("Nao foi possivel carregar os dados da planilha.", true);
    showStatus({
      title: "Nao foi possivel carregar as informacoes",
      text: "Verifique a conexao e a configuracao do Google Apps Script para tentar novamente.",
      tone: "error"
    });
  } finally {
    setFormDisabled(false);
  }
}

function getSubmitMessage(syncStatus) {
  if (syncStatus === "synced") {
    return "Cadastro salvo e enviado para o Google Sheets.";
  }

  if (syncStatus === "queued") {
    return "Cadastro enviado. Estamos aguardando a planilha refletir a atualizacao.";
  }

  if (syncStatus === "local_only") {
    return "Cadastro salvo localmente, mas nao foi possivel atualizar a planilha agora.";
  }

  if (looksLikeSpreadsheetUrl(GOOGLE_SCRIPT_URL)) {
    return "A URL informada e da planilha, nao do Apps Script publicado. Use o link do tipo script.google.com/macros/s/.../exec.";
  }

  if (isGoogleScriptConfigured()) {
    return "Cadastro salvo no navegador. Confira a URL do Google Sheets para manter tudo sincronizado.";
  }

  return getLocalStorageHint("Cadastro salvo no navegador.");
}

function getLocalStorageHint(prefix) {
  const baseMessage = window.location.protocol === "file:"
    ? "Para nao perder os dados ao reabrir em outros acessos, conecte o Google Sheets."
    : "Os cadastros estao guardados neste navegador.";

  return prefix ? `${prefix} ${baseMessage}` : baseMessage;
}

function loadEntriesFromLocalStorage() {
  try {
    const rawEntries = localStorage.getItem(STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeEntry) : [];
  } catch (error) {
    console.error("Erro ao carregar dados do localStorage:", error);
    return [];
  }
}

function saveEntriesToLocalStorage(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

async function loadEntriesFromIndexedDB() {
  if (!window.indexedDB) {
    return [];
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return [];
    }

    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result || []).map(normalizeEntry));
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Erro ao carregar dados do IndexedDB:", error);
    return [];
  }
}

async function saveEntriesToIndexedDB(nextEntries) {
  if (!window.indexedDB) {
    return;
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      store.clear();
      nextEntries.forEach((entry) => {
        store.put(normalizeEntry(entry));
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("Erro ao salvar dados no IndexedDB:", error);
  }
}

async function persistEntries(nextEntries) {
  const normalizedEntries = sortEntries(nextEntries.map(normalizeEntry));
  saveEntriesToLocalStorage(normalizedEntries);
  await saveEntriesToIndexedDB(normalizedEntries);
}

async function clearBrowserEntries() {
  clearWebStorage();
  await deleteIndexedDBDatabase();
  await clearIndexedDBEntries();
}

async function openDatabase() {
  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearIndexedDBEntries() {
  if (!window.indexedDB) {
    return;
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Erro ao limpar IndexedDB:", error);
  }
}

function clearWebStorage() {
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Erro ao limpar localStorage (${key}):`, error);
    }

    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Erro ao limpar sessionStorage (${key}):`, error);
    }
  });
}

async function deleteIndexedDBDatabase() {
  if (!window.indexedDB) {
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  } catch (error) {
    console.error("Erro ao excluir o banco IndexedDB:", error);
  }
}

async function loadEntriesFromGoogleSheets(options = {}) {
  const { throwOnError = false } = options;

  if (!isGoogleScriptConfigured()) {
    return [];
  }

  try {
    const separator = GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${GOOGLE_SCRIPT_URL}${separator}action=list&ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.entries) ? data.entries.map(normalizeEntry) : [];
  } catch (error) {
    console.error("Erro ao carregar dados do Google Sheets:", error);
    if (throwOnError) {
      throw error;
    }
    return [];
  }
}

async function syncWithGoogleSheets(entry) {
  if (!isGoogleScriptConfigured()) {
    return "disabled";
  }

  const payload = JSON.stringify(normalizeEntry(entry));

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    if (response.ok) {
      return "synced";
    }
  } catch (error) {
    console.error("Erro ao enviar para o Google Sheets:", error);
  }

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    return "queued";
  } catch (error) {
    console.error("Erro no envio simples para o Google Sheets:", error);
    return "local_only";
  }
}

function mergeEntries(...lists) {
  const mergedMap = new Map();

  lists
    .flat()
    .filter(Boolean)
    .map(normalizeEntry)
    .forEach((entry) => {
      const key = entry.id || createEntryFingerprint(entry);
      mergedMap.set(key, entry);
    });

  return [...mergedMap.values()];
}

function normalizeEntry(entry) {
  const normalizedEntry = {
    id: entry && entry.id ? String(entry.id) : "",
    fullName: entry && entry.fullName ? String(entry.fullName).trim().replace(/\s+/g, " ") : "",
    distance: entry && entry.distance ? String(entry.distance).trim() : "",
    shirtSize: entry && entry.shirtSize ? String(entry.shirtSize).trim() : "",
    createdAt: entry && entry.createdAt ? String(entry.createdAt) : new Date().toISOString()
  };

  if (!normalizedEntry.id) {
    normalizedEntry.id = createEntryFingerprint(normalizedEntry);
  }

  return normalizedEntry;
}

function createEntryFingerprint(entry) {
  return [
    entry.fullName || "",
    entry.distance || "",
    entry.shirtSize || "",
    entry.createdAt || ""
  ].join("|");
}

function sortEntries(list) {
  return [...list].sort((first, second) => {
    const distanceDiff = DISTANCE_ORDER.indexOf(first.distance) - DISTANCE_ORDER.indexOf(second.distance);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }

    return first.fullName.localeCompare(second.fullName, "pt-BR", { sensitivity: "base" });
  });
}

function groupEntriesByDistance(list) {
  return DISTANCE_ORDER.map((distance) => ({
    distance,
    items: list
      .filter((entry) => entry.distance === distance)
      .sort((first, second) =>
        first.fullName.localeCompare(second.fullName, "pt-BR", { sensitivity: "base" })
      )
  }));
}

function getShirtSizeSummary(list) {
  const counts = new Map(SHIRT_SIZE_ORDER.map((size) => [size, 0]));

  list.forEach((entry) => {
    const shirtSize = String(entry.shirtSize || "").trim().toUpperCase();
    if (counts.has(shirtSize)) {
      counts.set(shirtSize, counts.get(shirtSize) + 1);
    }
  });

  return SHIRT_SIZE_ORDER.map((size) => ({
    size,
    count: counts.get(size) || 0
  }));
}

function render() {
  const sortedEntries = sortEntries(entries);
  const groupedEntries = groupEntriesByDistance(sortedEntries);
  const shirtSummary = getShirtSizeSummary(sortedEntries);

  totalCountElement.textContent = `${sortedEntries.length} inscrito${sortedEntries.length === 1 ? "" : "s"}`;

  groupsContainer.innerHTML = groupedEntries
    .map((group) => {
      if (!group.items.length) {
        return `
          <article class="distance-card">
            <h3>${group.distance}</h3>
            <p class="distance-count">0 atletas</p>
            <p class="empty-state">Nenhum nome cadastrado nessa distancia ainda.</p>
          </article>
        `;
      }

      const namesHtml = group.items
        .map(
          (entry) => `
            <li>
              <span class="athlete-line">${escapeHtml(entry.fullName)} - ${escapeHtml(entry.shirtSize)}</span>
            </li>
          `
        )
        .join("");

      return `
        <article class="distance-card">
          <h3>${group.distance}</h3>
          <p class="distance-count">${group.items.length} atleta${group.items.length === 1 ? "" : "s"}</p>
          <ul class="names-list">${namesHtml}</ul>
        </article>
      `;
    })
    .join("");

  shirtSummaryContainer.innerHTML = `
    <p class="shirt-summary-title">Resumo de camisas cadastradas</p>
    <div class="shirt-summary-list">
      ${shirtSummary
        .map(
          ({ size, count }) => `
            <span class="shirt-summary-pill">${escapeHtml(size)}: ${count}</span>
          `
        )
        .join("")}
    </div>
  `;

  tableBody.innerHTML = sortedEntries.length
    ? sortedEntries
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.fullName)}</td>
              <td>${escapeHtml(entry.distance)}</td>
              <td>${escapeHtml(entry.shirtSize)}</td>
            </tr>
          `
        )
        .join("")
    : `
        <tr>
          <td colspan="3">Nenhum cadastro enviado ainda.</td>
        </tr>
      `;
}

function showMessage(text, isError = false) {
  messageElement.textContent = text;
  messageElement.style.color = isError ? "#ffd0d0" : "#d8ffef";
}

function escapeCsvValue(value) {
  const safeValue = String(value ?? "");
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isGoogleScriptConfigured() {
  return Boolean(GOOGLE_SCRIPT_URL) && !looksLikeSpreadsheetUrl(GOOGLE_SCRIPT_URL);
}

function looksLikeSpreadsheetUrl(url) {
  return /docs\.google\.com\/spreadsheets/i.test(String(url || ""));
}

function shouldUseGoogleSheetsAsSingleSource() {
  return GOOGLE_SHEETS_ONLY_MODE && isGoogleScriptConfigured();
}

async function refreshEntriesFromGoogleSheets(expectedEntry, options = {}) {
  const {
    attempts = 8,
    delayMs = 700
  } = options;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remoteEntries = sortEntries(
      await loadEntriesFromGoogleSheets({ throwOnError: attempt === attempts - 1 })
    );

    if (!expectedEntry || containsEntry(remoteEntries, expectedEntry)) {
      return remoteEntries;
    }

    if (attempt < attempts - 1) {
      await wait(delayMs);
    }
  }

  return null;
}

function containsEntry(list, expectedEntry) {
  const expectedFingerprint = createEntryFingerprint(expectedEntry);

  return list.some((entry) =>
    entry.id === expectedEntry.id || createEntryFingerprint(entry) === expectedFingerprint
  );
}

function resetFormAfterSubmit() {
  form.reset();
  fullNameInput.focus();
}

function setFormDisabled(disabled) {
  [fullNameInput, distanceInput, shirtSizeInput, submitButton, exportButton].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function isFormDisabled() {
  return Boolean(submitButton && submitButton.disabled);
}

function showStatus(options = {}) {
  const {
    title = "",
    text = "",
    tone = "info",
    busy = false,
    hideAfterMs = 0
  } = options;

  clearStatusHideTimeout();
  statusBox.className = `status-box status-box-${tone}`;
  statusBoxTitle.textContent = title;
  statusBoxText.textContent = text;
  statusBoxText.hidden = !text;
  statusSpinner.classList.toggle("status-spinner-hidden", !busy);

  if (hideAfterMs > 0) {
    statusHideTimeoutId = window.setTimeout(() => {
      hideStatus();
    }, hideAfterMs);
  }
}

function hideStatus() {
  clearStatusHideTimeout();
  statusBox.className = "status-box status-box-hidden";
  statusSpinner.classList.remove("status-spinner-hidden");
  statusBoxText.hidden = false;
}

function clearStatusHideTimeout() {
  if (statusHideTimeoutId) {
    window.clearTimeout(statusHideTimeoutId);
    statusHideTimeoutId = null;
  }
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
