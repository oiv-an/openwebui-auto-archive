/*
  Authors:
  - Ivan Olyanskiy
  - Assisted by ChatGPT 5.2
*/

// ==UserScript==
// @name         OpenWebUI Auto Archive (30d + months)
// @namespace    oiv-an.openwebui-auto-archive
// @version      0.2.0
// @description  Bulk-archive OpenWebUI chats from "Previous 30 days" and month sections below (UI automation)
// @match        https://llm.ivol.pro/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CFG = {
    buttonText: '📦 Archive: old (30d + months)',
    stopText: '⛔ Stop',
    delayBetweenChatsMs: 350,
    delayAfterMenuOpenMs: 120,
    delayAfterArchiveClickMs: 250,
    maxChatsSafetyLimit: 800,
    debug: false,
  };

  const state = {
    running: false,
    processed: 0,
    skipped: 0,
    errors: 0,
    lastError: '',
  };

  const log = (...args) => {
    if (CFG.debug) console.log('[OWUI-ARCHIVE]', ...args);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const textNorm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Legacy helper (kept for compatibility / debugging)
  const findHeaderNode = () => {
    const candidates = Array.from(document.querySelectorAll('div'));
    const target = candidates.find((el) => textNorm(el.textContent) === 'предыдущие 30 дней');
    return target || null;
  };

  const getSidebarScrollContainer = () => {
    // Chat list container in the left sidebar
    return document.querySelector('div.flex-1.flex.flex-col.overflow-y-auto.scrollbar-hidden');
  };

  const getSidebarSectionHeaders = (sidebarEl) => {
    if (!sidebarEl) return [];
    // Section headers look like:
    // <div class="w-full pl-2.5 text-xs text-gray-500 ... font-medium ...">Previous 30 days</div>
    return Array.from(sidebarEl.querySelectorAll('div.w-full.pl-2\\.5.text-xs.text-gray-500.font-medium'));
  };

  const findSectionHeaderInSidebar = (sidebarEl, title) => {
    if (!sidebarEl) return null;
    const headers = getSidebarSectionHeaders(sidebarEl);
    return headers.find((el) => textNorm(el.textContent) === textNorm(title)) || null;
  };

  const isMonthHeaderRu = (txt) => {
    // Examples: "Октябрь", "Ноябрь", "Декабрь" (optionally "Октябрь 2025")
    const t = textNorm(txt);
    return /^(январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)(\s+\d{4})?$/.test(t);
  };

  const isRelativeHeader = (txt) => {
    // "Today", "Previous 7 days", "Previous 30 days", "Pinned" (RU UI in your instance)
    const t = textNorm(txt);
    return (
      t === 'сегодня' ||
      t === 'закреплено' ||
      /^предыдущие\s+\d+\s+д(ень|ня|ней)$/.test(t)
    );
  };

  const findChatGroupsBetweenHeaders = (sidebarEl, startHeaderEl, endHeaderEl) => {
    if (!sidebarEl || !startHeaderEl) return [];
    const allGroups = Array.from(sidebarEl.querySelectorAll('div#sidebar-chat-group'));

    return allGroups.filter((g) => {
      const afterStart = startHeaderEl.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (!afterStart) return false;

      if (!endHeaderEl) return true;

      const beforeEnd = g.compareDocumentPosition(endHeaderEl) & Node.DOCUMENT_POSITION_FOLLOWING;
      return !!beforeEnd;
    });
  };

  const findChatGroupsInSection = (sidebarEl, sectionTitle) => {
    const headers = getSidebarSectionHeaders(sidebarEl);
    const startHeader = headers.find((h) => textNorm(h.textContent) === textNorm(sectionTitle));
    if (!startHeader) return [];
    const startIdx = headers.indexOf(startHeader);
    const endHeader = headers[startIdx + 1] || null;
    return findChatGroupsBetweenHeaders(sidebarEl, startHeader, endHeader);
  };

  const findArchiveTargetsFrom30DaysAndOlder = (sidebarEl) => {
    // Logic:
    // 1) Find "Previous 30 days" header
    // 2) Take all sections BELOW it that are:
    //    - month headers (Октябрь/Ноябрь/...) OR any other non-relative headers
    // 3) For each such section, take chat groups between this header and the next header
    const headers = getSidebarSectionHeaders(sidebarEl);
    const start = headers.find((h) => textNorm(h.textContent) === 'предыдущие 30 дней');
    if (!start) return { headers: [], groups: [] };

    const startIdx = headers.indexOf(start);
    const tailHeaders = headers.slice(startIdx); // включая "30 дней"

    const targetHeaders = tailHeaders.filter((h, idx) => {
      if (idx === 0) return true; // сама секция "30 дней" — тоже цель
      const t = h.textContent || '';
      // месяцы — цель
      if (isMonthHeaderRu(t)) return true;
      // любые "не относительные" заголовки ниже 30 дней — тоже цель (на случай другой локали/формата)
      if (!isRelativeHeader(t)) return true;
      return false;
    });

    // Собираем группы по каждой целевой секции
    const groups = [];
    for (let i = 0; i < targetHeaders.length; i++) {
      const h = targetHeaders[i];
      const end = targetHeaders[i + 1] || null;
      const sectionGroups = findChatGroupsBetweenHeaders(sidebarEl, h, end);
      groups.push(...sectionGroups);
    }

    // Убираем дубликаты (на всякий случай)
    const uniq = Array.from(new Set(groups));
    return { headers: targetHeaders, groups: uniq };
  };

  const findMenuButtonInGroup = (groupEl) => {
    // Кнопка меню: button[aria-label="Chat Menu"]
    return groupEl.querySelector('button[aria-label="Chat Menu"]');
  };

  const findOpenMenuRoot = () => {
    // Меню рендерится как div[role="menu"][data-state="open"]
    return document.querySelector('div[role="menu"][data-state="open"]');
  };

  const findArchiveMenuItem = (menuRoot) => {
    if (!menuRoot) return null;
    const items = Array.from(menuRoot.querySelectorAll('div[role="menuitem"]'));
    return items.find((el) => textNorm(el.textContent) === 'архив') || null;
  };

  const closeAnyMenu = () => {
    // Клик в пустоту, чтобы закрыть меню
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  const createFloatingUI = () => {
    const wrap = document.createElement('div');
    wrap.id = 'ivol-owui-archive-ui';
    wrap.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    `;

    const btn = document.createElement('button');
    btn.textContent = CFG.buttonText;
    btn.style.cssText = `
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.15);
      background: #111827;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    `;

    const stop = document.createElement('button');
    stop.textContent = CFG.stopText;
    stop.style.cssText = `
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.15);
      background: #991b1b;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      display: none;
    `;

    const stat = document.createElement('div');
    stat.style.cssText = `
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.10);
      background: rgba(255,255,255,0.92);
      color: #111827;
      font-size: 12px;
      min-width: 220px;
      backdrop-filter: blur(6px);
    `;

    const render = () => {
      stat.innerHTML = `
        <div><b>OpenWebUI Auto Archive</b></div>
        <div>Status: ${state.running ? 'running' : 'idle'}</div>
        <div>Processed: ${state.processed}</div>
        <div>Skipped: ${state.skipped}</div>
        <div>Errors: ${state.errors}</div>
        ${state.lastError ? `<div style="margin-top:6px;color:#991b1b;">${state.lastError}</div>` : ''}
      `;
    };

    render();

    btn.addEventListener('click', async () => {
      if (state.running) return;
      state.running = true;
      state.lastError = '';
      stop.style.display = 'block';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      render();

      try {
        await archivePrevious30Days(render);
      } catch (e) {
        state.errors += 1;
        state.lastError = String(e?.message || e);
      } finally {
        state.running = false;
        stop.style.display = 'none';
        btn.disabled = false;
        btn.style.opacity = '1';
        render();
      }
    });

    stop.addEventListener('click', () => {
      state.running = false;
      state.lastError = 'Stopped by user';
      render();
    });

    wrap.appendChild(btn);
    wrap.appendChild(stop);
    wrap.appendChild(stat);
    document.body.appendChild(wrap);
  };

  const findArchiveTargetsMonthsOnly = (sidebarEl) => {
    const headers = getSidebarSectionHeaders(sidebarEl);
    const monthHeaders = headers.filter((h) => isMonthHeaderRu(h.textContent || ''));
    const groups = [];
    for (let i = 0; i < monthHeaders.length; i++) {
      const h = monthHeaders[i];
      const end = monthHeaders[i + 1] || null;
      groups.push(...findChatGroupsBetweenHeaders(sidebarEl, h, end));
    }
    return { headers: monthHeaders, groups: Array.from(new Set(groups)) };
  };

  const archivePrevious30Days = async (render) => {
    const sidebar = getSidebarScrollContainer();
    if (!sidebar) {
      throw new Error('Sidebar chat list container not found. Make sure the left sidebar is open.');
    }

    // If "Previous 30 days" is missing/empty — run months-only mode.
    const header30 = findSectionHeaderInSidebar(sidebar, 'Предыдущие 30 дней');

    if (header30) {
      header30.scrollIntoView({ block: 'center' });
      await sleep(150);
    }

    let targets = header30 ? findArchiveTargetsFrom30DaysAndOlder(sidebar) : findArchiveTargetsMonthsOnly(sidebar);
    let groups = targets.groups;

    if (!groups.length) {
      throw new Error('No chats found to archive (months / older sections). Either not loaded yet or already archived.');
    }

    if (groups.length > CFG.maxChatsSafetyLimit) groups = groups.slice(0, CFG.maxChatsSafetyLimit);

    log('Found groups (30d + months OR months-only):', groups.length);

    for (let i = 0; i < groups.length; i++) {
      if (!state.running) break;

      const group = groups[i];

      if (!document.contains(group)) {
        state.skipped += 1;
        render();
        continue;
      }

      // Жесткая проверка: этот group всё ещё входит в текущие цели
      const currentTargets = header30
        ? findArchiveTargetsFrom30DaysAndOlder(sidebar)
        : findArchiveTargetsMonthsOnly(sidebar);

      if (!currentTargets.groups.includes(group)) {
        state.skipped += 1;
        render();
        continue;
      }

      group.scrollIntoView({ block: 'center' });
      await sleep(120);

      group.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(60);

      const menuBtn = findMenuButtonInGroup(group);
      if (!menuBtn) {
        state.skipped += 1;
        render();
        continue;
      }

      menuBtn.click();
      await sleep(CFG.delayAfterMenuOpenMs);

      const menuRoot = findOpenMenuRoot();
      const archiveItem = findArchiveMenuItem(menuRoot);

      if (!archiveItem) {
        await sleep(200);
        const menuRoot2 = findOpenMenuRoot();
        const archiveItem2 = findArchiveMenuItem(menuRoot2);

        if (!archiveItem2) {
          state.errors += 1;
          state.lastError = 'Could not find "Archive" menu item. UI/locale/DOM may have changed.';
          render();
          closeAnyMenu();
          await sleep(150);
          continue;
        }

        archiveItem2.click();
      } else {
        archiveItem.click();
      }

      await sleep(CFG.delayAfterArchiveClickMs);
      closeAnyMenu();

      state.processed += 1;
      render();

      await sleep(CFG.delayBetweenChatsMs);

      // После архивации DOM меняется — пересчитываем цели заново
      targets = header30 ? findArchiveTargetsFrom30DaysAndOlder(sidebar) : findArchiveTargetsMonthsOnly(sidebar);
      groups = targets.groups;
      if (groups.length > CFG.maxChatsSafetyLimit) groups = groups.slice(0, CFG.maxChatsSafetyLimit);

      // Чтобы не пропускать элементы при сжатии списка
      i = Math.max(-1, i - 1);
    }
  };

  // Инициализация
  const boot = () => {
    if (document.getElementById('ivol-owui-archive-ui')) return;
    createFloatingUI();
  };

  // Ждем, пока появится сайдбар
  const start = () => {
    boot();
    const obs = new MutationObserver(() => boot());
    obs.observe(document.documentElement, { childList: true, subtree: true });
  };

  start();
})();
