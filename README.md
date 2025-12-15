# OpenWebUI Auto Archive (Tampermonkey)

A Tampermonkey userscript for **bulk archiving chats** in OpenWebUI via the UI: it opens the chat menu (three dots) and clicks **“Archive”**.

Goal: quickly clean up the left chat history sidebar by archiving **“Previous 30 days” and all month sections below**.

## Authors

- Ivan Olyanskiy
- Assisted by ChatGPT 5.2

## Project name

**openwebui-auto-archive** — short and to the point.

## What it does

- Adds a floating button **“📦 Archive: old (30d + months)”** on the OpenWebUI page.
- When started:
  - targets chats in **“Previous 30 days”** and **month sections below** (e.g. November, October, …),
  - for each chat: opens the menu → clicks **“Archive”**,
  - re-reads the list after each action to avoid skipping items.

## Installation

1. Install Tampermonkey:
   - https://www.tampermonkey.net/

2. Create a new userscript:
   - Tampermonkey → **Create a new script**

3. Copy the contents of [`index.js`](index.js) into the Tampermonkey editor and save (Ctrl+S).

4. Open OpenWebUI:
   - `https://llm.ivol.pro/`

## Usage

1. Open the left sidebar with the chat list.
2. Scroll so the month sections are loaded (and “Previous 30 days” if it exists).
3. Click **“📦 Archive: old (30d + months)”**.
4. To stop, click **“⛔ Stop”**.

## Configuration

At the top of [`index.js`](index.js) there is a `CFG` object:

- `delayBetweenChatsMs` — delay between chats
- `delayAfterMenuOpenMs` — delay after opening the menu
- `delayAfterArchiveClickMs` — delay after clicking “Archive”
- `maxChatsSafetyLimit` — safety limit
- `debug` — console logging

## Notes / limitations

- This script clicks the UI, so it depends on OpenWebUI DOM structure.
- If OpenWebUI updates and changes selectors/structure, the script may need adjustments.
- No API calls are used — it only simulates user actions.

## License

MIT — see [`LICENSE`](LICENSE).