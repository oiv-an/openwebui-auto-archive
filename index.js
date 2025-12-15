// ==UserScript==
// @name         OpenWebUI - Archive chats (Previous 30 days)
// @namespace    ivol.openwebui.archive
// @version      0.1.0
// @description  Архивирует все чаты из секции "Предыдущие 30 дней" в левом сайдбаре OpenWebUI
// @match        https://llm.ivol.pro/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CFG = {
    buttonText: '📦 Архив: 30 дней',
    stopText: '⛔ Стоп',
    delayBetweenChatsMs: 350,
    delayAfterMenuOpenMs: 120,
    delayAfterArchiveClickMs: 250,
    maxChatsSafetyLimit: 500,
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

  const findHeaderNode = () => {
    // Ищем заголовок секции по тексту "Предыдущие 30 дней"
    const candidates = Array.from(document.querySelectorAll('div'));
    const target = candidates.find((el) => textNorm(el.textContent) === 'предыдущие 30 дней');
    return target || null;
  };

  const getSidebarScrollContainer = () => {
    // В твоем HTML список чатов живет внутри: div.flex-1.flex.flex-col.overflow-y-auto.scrollbar-hidden
    // Берем первый подходящий контейнер (в левом сайдбаре).
    return document.querySelector('div.flex-1.flex.flex-col.overflow-y-auto.scrollbar-hidden');
  };

  const findSectionHeaderInSidebar = (sidebarEl, title) => {
    if (!sidebarEl) return null;
    const nodes = Array.from(sidebarEl.querySelectorAll('div'));
    return nodes.find((el) => textNorm(el.textContent) === textNorm(title)) || null;
  };

  const findChatGroupsInSection = (sidebarEl, sectionTitle) => {
    // Критично: берем ТОЛЬКО элементы между заголовком sectionTitle и следующим заголовком секции.
    // Заголовки секций у тебя выглядят как:
    // <div class="w-full pl-2.5 text-xs text-gray-500 ... font-medium ...">Предыдущие 30 дней</div>
    if (!sidebarEl) return [];

    const headers = Array.from(
      sidebarEl.querySelectorAll('div.w-full.pl-2\\.5.text-xs.text-gray-500.font-medium')
    );

    const startHeader = headers.find((h) => textNorm(h.textContent) === textNorm(sectionTitle));
    if (!startHeader) return [];

    const startIdx = headers.indexOf(startHeader);
    const endHeader = headers[startIdx + 1] || null;

    const allGroups = Array.from(sidebarEl.querySelectorAll('div#sidebar-chat-group'));

    const inRange = allGroups.filter((g) => {
      const afterStart = startHeader.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (!afterStart) return false;

      if (!endHeader) return true;

      const beforeEnd = g.compareDocumentPosition(endHeader) & Node.DOCUMENT_POSITION_FOLLOWING;
      // g должен быть ДО endHeader => endHeader следует после g
      return !!beforeEnd;
    });

    return inRange;
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
        <div><b>OWUI Архиватор</b></div>
        <div>Статус: ${state.running ? 'работает' : 'ожидает'}</div>
        <div>Обработано: ${state.processed}</div>
        <div>Пропущено: ${state.skipped}</div>
        <div>Ошибки: ${state.errors}</div>
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
      state.lastError = 'Остановлено пользователем';
      render();
    });

    wrap.appendChild(btn);
    wrap.appendChild(stop);
    wrap.appendChild(stat);
    document.body.appendChild(wrap);
  };

  const archivePrevious30Days = async (render) => {
    const sidebar = getSidebarScrollContainer();
    if (!sidebar) {
      throw new Error('Не нашел контейнер сайдбара со списком чатов. Открой левую колонку с историей.');
    }

    const header = findSectionHeaderInSidebar(sidebar, 'Предыдущие 30 дней');
    if (!header) {
      throw new Error('Не нашел заголовок "Предыдущие 30 дней" внутри сайдбара. Проверь, что секция видна.');
    }

    header.scrollIntoView({ block: 'center' });
    await sleep(150);

    let groups = findChatGroupsInSection(sidebar, 'Предыдущие 30 дней');
    if (!groups.length) {
      throw new Error('Не нашел чаты ВНУТРИ секции "Предыдущие 30 дней". Возможно, список еще не прогрузился.');
    }

    if (groups.length > CFG.maxChatsSafetyLimit) groups = groups.slice(0, CFG.maxChatsSafetyLimit);

    log('Found groups in section:', groups.length);

    for (let i = 0; i < groups.length; i++) {
      if (!state.running) break;

      const group = groups[i];

      if (!document.contains(group)) {
        state.skipped += 1;
        render();
        continue;
      }

      // Жесткая проверка: этот group реально находится между заголовками секции
      // (на случай, если DOM перерисовался)
      const currentGroups = findChatGroupsInSection(sidebar, 'Предыдущие 30 дней');
      if (!currentGroups.includes(group)) {
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
          state.lastError = 'Не нашел пункт "Архив" в меню. Возможно, локализация/верстка отличается.';
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

      // После архивации DOM меняется — пересчитываем список секции заново
      groups = findChatGroupsInSection(sidebar, 'Предыдущие 30 дней');
      if (groups.length > CFG.maxChatsSafetyLimit) groups = groups.slice(0, CFG.maxChatsSafetyLimit);

      // Важно: после пересчета i указывает на "следующий" индекс, но текущий элемент уже ушел в архив,
      // поэтому делаем шаг назад, чтобы не пропускать элементы при сжатии списка.
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
