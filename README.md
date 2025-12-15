# OpenWebUI Auto Archive (Tampermonkey)

## RU

Tampermonkey-скрипт для **массовой архивации чатов** в OpenWebUI через UI: открывает меню (три точки) у каждого чата и нажимает **«Архив»**.

Цель: быстро очистить левую колонку истории, отправив в архив **чаты из “Предыдущие 30 дней” и секций по месяцам ниже**.

### Авторы

- Ivan Olyanskiy
- Assisted by ChatGPT 5.2

### Название проекта

**openwebui-auto-archive** — коротко и по делу.

### Что делает

- На странице OpenWebUI добавляет плавающую кнопку **«📦 Archive: old (30d + months)»**.
- При запуске:
  - находит секцию **«Предыдущие 30 дней»** в левом сайдбаре (если она есть),
  - если секции “Предыдущие 30 дней” уже нет — работает по секциям-месяцам (Октябрь/Ноябрь/…),
  - для каждого чата: открывает меню → жмёт **«Архив»**,
  - пересчитывает список после каждого действия (чтобы не пропускать элементы).

### Установка

1. Установи расширение Tampermonkey:
   - https://www.tampermonkey.net/

2. Создай новый userscript:
   - Tampermonkey → **Create a new script**

3. Скопируй содержимое файла [`index.js`](index.js) в редактор Tampermonkey.

4. В самом верху userscript (в шапке) замени строку:
   - `// @match        https://YOUR-OPENWEBUI-DOMAIN/*`
   на свой домен OpenWebUI, например:
   - `// @match        https://openwebui.example.com/*`

5. Сохрани скрипт (Ctrl+S).

6. Открой свой OpenWebUI (тот домен, где он у тебя установлен).

### Использование

1. Открой левый сайдбар со списком чатов.
2. Прокрути так, чтобы прогрузились секции по месяцам (и “Предыдущие 30 дней”, если она есть).
3. Нажми кнопку **«📦 Archive: old (30d + months)»**.
4. Чтобы остановить — нажми **«⛔ Stop»**.

### Настройки

Вверху файла [`index.js`](index.js) есть объект `CFG`:

- `delayBetweenChatsMs` — пауза между чатами
- `delayAfterMenuOpenMs` — пауза после открытия меню
- `delayAfterArchiveClickMs` — пауза после клика «Архив»
- `maxChatsSafetyLimit` — предохранитель по количеству
- `debug` — логирование в консоль

### Ограничения / важные замечания

- Скрипт кликает по UI, поэтому зависит от верстки OpenWebUI.
- Если OpenWebUI обновится и поменяет классы/структуру — потребуется правка селекторов.
- Скрипт не использует API, только имитирует действия пользователя.

### Лицензия

MIT — см. [`LICENSE`](LICENSE).

---

## EN

A Tampermonkey userscript for **bulk archiving chats** in OpenWebUI via the UI: it opens the chat menu (three dots) and clicks **“Archive”**.

Goal: quickly clean up the left chat history sidebar by archiving **“Previous 30 days” and all month sections below**.

### Authors

- Ivan Olyanskiy
- Assisted by ChatGPT 5.2

### Project name

**openwebui-auto-archive** — short and to the point.

### What it does

- Adds a floating button **“📦 Archive: old (30d + months)”** on the OpenWebUI page.
- When started:
  - targets chats in **“Previous 30 days”** (if present) and **month sections below** (e.g. November, October, …),
  - if “Previous 30 days” is missing, it automatically switches to **months-only** mode,
  - for each chat: opens the menu → clicks **“Archive”**,
  - re-reads the list after each action to avoid skipping items.

### Installation

1. Install Tampermonkey:
   - https://www.tampermonkey.net/

2. Create a new userscript:
   - Tampermonkey → **Create a new script**

3. Copy the contents of [`index.js`](index.js) into the Tampermonkey editor.

4. At the very top of the userscript (header), replace:
   - `// @match        https://YOUR-OPENWEBUI-DOMAIN/*`
   with your OpenWebUI domain, for example:
   - `// @match        https://openwebui.example.com/*`

5. Save the script (Ctrl+S).

6. Open your OpenWebUI instance (the domain where you installed it).

### Usage

1. Open the left sidebar with the chat list.
2. Scroll so the month sections are loaded (and “Previous 30 days” if it exists).
3. Click **“📦 Archive: old (30d + months)”**.
4. To stop, click **“⛔ Stop”**.

### Configuration

At the top of [`index.js`](index.js) there is a `CFG` object:

- `delayBetweenChatsMs` — delay between chats
- `delayAfterMenuOpenMs` — delay after opening the menu
- `delayAfterArchiveClickMs` — delay after clicking “Archive”
- `maxChatsSafetyLimit` — safety limit
- `debug` — console logging

### Notes / limitations

- This script clicks the UI, so it depends on OpenWebUI DOM structure.
- If OpenWebUI updates and changes selectors/structure, the script may need adjustments.
- No API calls are used — it only simulates user actions.

### License

MIT — see [`LICENSE`](LICENSE).