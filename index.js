(function () {
    const EXT_NAME = 'Greeting Navigator';
    const FAVORITES_KEY = 'gss_favorites_v1';
    const CUSTOM_NAMES_KEY = 'gss_custom_names_v1';
    const PREVIEW_LIMIT = 250;

    let showingFavoritesOnly = false;
    const expandedGreetings = new Set();

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getContext() {
        return window.SillyTavern?.getContext?.();
    }

    function getCharacter() {
        const context = getContext();
        if (!context) return null;

        const charId = context.characterId;
        if (charId === undefined || charId === null) return null;

        return context.characters?.[charId] || null;
    }

    function getCharacterKey(character) {
        return character.avatar || character.name || character.data?.name || 'unknown_character';
    }

    function safeParseStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch {
            return {};
        }
    }

    function saveStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function loadFavorites() {
        return safeParseStorage(FAVORITES_KEY);
    }

    function saveFavorites(favorites) {
        saveStorage(FAVORITES_KEY, favorites);
    }

    function loadCustomNames() {
        return safeParseStorage(CUSTOM_NAMES_KEY);
    }

    function saveCustomNames(names) {
        saveStorage(CUSTOM_NAMES_KEY, names);
    }

    function getCustomName(character, index) {
        const names = loadCustomNames();
        const key = getCharacterKey(character);
        return names[key]?.[index] || '';
    }

    function setCustomName(character, index, name) {
        const names = loadCustomNames();
        const key = getCharacterKey(character);

        if (!names[key]) {
            names[key] = {};
        }

        const cleanName = String(name || '').trim();

        if (cleanName) {
            names[key][index] = cleanName;
        } else {
            delete names[key][index];
        }

        saveCustomNames(names);
    }

    function getDisplayTitle(character, greeting, index) {
        return getCustomName(character, index) || greeting.title;
    }

    function isFavorite(character, index) {
        const favorites = loadFavorites();
        const key = getCharacterKey(character);
        return Array.isArray(favorites[key]) && favorites[key].includes(index);
    }

    function toggleFavorite(character, index) {
        const favorites = loadFavorites();
        const key = getCharacterKey(character);

        if (!Array.isArray(favorites[key])) {
            favorites[key] = [];
        }

        if (favorites[key].includes(index)) {
            favorites[key] = favorites[key].filter(i => i !== index);
        } else {
            favorites[key].push(index);
        }

        saveFavorites(favorites);
    }

    function getGreetings(character) {
        const greetings = [];

        const mainGreeting =
            character.first_mes ||
            character.data?.first_mes;

        if (mainGreeting) {
            greetings.push({
                title: 'Main Greeting',
                text: mainGreeting
            });
        }

        const altGreetings =
            character.alternate_greetings ||
            character.data?.alternate_greetings ||
            character.data?.extensions?.alternate_greetings ||
            character.data?.extensions?.chub?.alternate_greetings ||
            [];

        if (Array.isArray(altGreetings)) {
            altGreetings.forEach((text, index) => {
                if (typeof text === 'string' && text.trim()) {
                    greetings.push({
                        title: `Alternative Greeting ${index + 1}`,
                        text
                    });
                }
            });
        }

        console.log(`${EXT_NAME}: greetings found`, greetings);
        return greetings;
    }

    function closeModal() {
        const modal = document.getElementById('gss_modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function renderFirstMessage(context, character, firstMessage, text, targetIndex, greetings) {
        const firstMesElement =
            document.querySelector('.mes[mesid="0"] .mes_text') ||
            document.querySelector('.mes[mesid="0"] .mes_block .mes_text') ||
            document.querySelector('.mes .mes_text');

        if (firstMesElement) {
            try {
                if (typeof context.messageFormatting === 'function') {
                    firstMesElement.innerHTML = context.messageFormatting(
                        text,
                        firstMessage.name || character.name,
                        false,
                        false,
                        0
                    );
                } else {
                    firstMesElement.innerText = text;
                }
            } catch (error) {
                console.error(`${EXT_NAME}: error rendering markdown`, error);
                firstMesElement.innerText = text;
            }
        }

        const firstMessageElement = document.querySelector('.mes[mesid="0"]');

        if (firstMessageElement) {
            firstMessageElement.setAttribute('swipeid', String(targetIndex));
        }

        const swipeCounter = document.querySelector('.mes[mesid="0"] .swipes-counter');

        if (swipeCounter) {
            swipeCounter.innerHTML = `&nbsp;${targetIndex + 1}&nbsp;/&nbsp;${greetings.length}`;
        }
    }

    async function setFirstMessage(targetIndex = 0, keepModalOpen = false) {
        const context = getContext();

        if (!context || !Array.isArray(context.chat) || context.chat.length === 0) {
            alert('Open a chat with the character first.');
            return false;
        }

        const character = getCharacter();
        const greetings = getGreetings(character);

        if (!greetings[targetIndex]) {
            alert('Greeting not found.');
            return false;
        }

        const firstMessage = context.chat[0];
        const targetText = greetings[targetIndex].text;

        firstMessage.swipes = greetings.map(g => g.text);
        firstMessage.swipe_id = targetIndex;
        firstMessage.mes = targetText;

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }

        renderFirstMessage(context, character, firstMessage, targetText, targetIndex, greetings);

        if (!keepModalOpen) {
            closeModal();
        }

        return true;
    }

    async function executeNewChatCommand() {
        const context = getContext();

        if (context && typeof context.executeSlashCommands === 'function') {
            await context.executeSlashCommands('/newchat');
            return true;
        }

        const newChatButtonSelectors = [
            '#option_start_new_chat',
            '#option_new_chat',
            '#new_chat',
            '#new_chat_button',
            '[data-i18n="Start new chat"]',
            '[title="Start new chat"]',
            '[title="New chat"]'
        ];

        for (const selector of newChatButtonSelectors) {
            const button = document.querySelector(selector);
            if (button instanceof HTMLElement) {
                button.click();
                return true;
            }
        }

        return false;
    }

    async function waitForNewChat(previousFirstMessage, timeout = 5000) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeout) {
            const context = getContext();
            const currentFirstMessage = context?.chat?.[0];

            if (currentFirstMessage && currentFirstMessage !== previousFirstMessage) {
                return true;
            }

            await wait(150);
        }

        return false;
    }

    async function startNewChatWithGreeting(targetIndex = 0) {
        const context = getContext();

        if (!context) {
            alert('SillyTavern context not available.');
            return;
        }

        const character = getCharacter();
        const greetings = getGreetings(character);

        if (!greetings[targetIndex]) {
            alert('Greeting not found.');
            return;
        }

        const previousFirstMessage = context.chat?.[0] || null;
        const started = await executeNewChatCommand();

        if (!started) {
            alert('Could not start a new chat automatically. Try updating SillyTavern or use the normal New Chat button first.');
            return;
        }

        await waitForNewChat(previousFirstMessage);
        await wait(250);
        await setFirstMessage(targetIndex, false);
    }

    function createModalIfNeeded() {
        let modal = document.getElementById('gss_modal');

        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'gss_modal';

        const box = document.createElement('div');
        box.id = 'gss_box';

        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });

        return modal;
    }

    function createActionButton(label, title, className, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className || 'gss_action_button';
        button.textContent = label;
        button.title = title || label;

        button.addEventListener('click', async function (event) {
            event.stopPropagation();
            await onClick(event);
        });

        return button;
    }

    function renameGreeting(character, greeting, index, box, greetings) {
        const currentName = getCustomName(character, index) || greeting.title;
        const newName = prompt('Greeting name:', currentName);

        if (newName === null) {
            return;
        }

        setCustomName(character, index, newName);
        renderGreetingList(box, character, greetings);
    }

    function renderGreetingList(box, character, greetings) {
        const oldItems = box.querySelectorAll('.gss_item');
        oldItems.forEach(item => item.remove());

        greetings.forEach((greeting, index) => {
            if (showingFavoritesOnly && !isFavorite(character, index)) {
                return;
            }

            const item = document.createElement('div');
            item.className = 'gss_item';

            const favoriteButton = document.createElement('button');
            favoriteButton.type = 'button';
            favoriteButton.className = 'gss_fav_button';
            favoriteButton.innerHTML = isFavorite(character, index) ? '★' : '☆';
            favoriteButton.title = 'Favorite greeting';

            favoriteButton.addEventListener('click', function (event) {
                event.stopPropagation();
                toggleFavorite(character, index);
                renderGreetingList(box, character, greetings);
            });

            const content = document.createElement('div');
            content.className = 'gss_item_content';

            const title = document.createElement('div');
            title.className = 'gss_item_title';
            title.textContent = `${index + 1} • ${getDisplayTitle(character, greeting, index)}`;

            const preview = document.createElement('div');
            preview.className = 'gss_item_preview';

            const isExpanded = expandedGreetings.has(index);
            preview.textContent =
                isExpanded || greeting.text.length <= PREVIEW_LIMIT
                    ? greeting.text
                    : greeting.text.slice(0, PREVIEW_LIMIT) + '...';

            const actions = document.createElement('div');
            actions.className = 'gss_item_actions';

            const useButton = createActionButton('Use in current chat', 'Use this greeting in the current chat', 'gss_action_button', async () => {
                await setFirstMessage(index);
            });

            const newChatButton = createActionButton('New chat', 'Start a new chat with this greeting', 'gss_action_button gss_new_chat_button', async () => {
                await startNewChatWithGreeting(index);
            });

            const renameButton = createActionButton('Rename', 'Give this greeting a custom name', 'gss_action_button', async () => {
                renameGreeting(character, greeting, index, box, greetings);
            });

            const expandButton = createActionButton(
                isExpanded ? 'Collapse' : 'Expand',
                isExpanded ? 'Hide full greeting text' : 'Show full greeting text',
                'gss_action_button',
                async () => {
                    if (expandedGreetings.has(index)) {
                        expandedGreetings.delete(index);
                    } else {
                        expandedGreetings.add(index);
                    }
                    renderGreetingList(box, character, greetings);
                }
            );

            actions.appendChild(useButton);
            actions.appendChild(newChatButton);
            actions.appendChild(renameButton);

            if (greeting.text.length > PREVIEW_LIMIT) {
                actions.appendChild(expandButton);
            }

            content.appendChild(title);
            content.appendChild(preview);
            content.appendChild(actions);

            const searchTitle = getDisplayTitle(character, greeting, index);
            item.dataset.search = `${searchTitle} ${greeting.title} ${greeting.text}`;

            item.appendChild(favoriteButton);
            item.appendChild(content);
            box.appendChild(item);
        });

        applySearchFilter(box);
    }

    function applySearchFilter(box) {
        const searchInput = document.getElementById('gss_search');
        if (!searchInput) return;

        const term = searchInput.value.toLowerCase().trim();
        const items = box.querySelectorAll('.gss_item');

        items.forEach(item => {
            const text = item.dataset.search.toLowerCase();

            if (!term || text.includes(term)) {
                item.classList.remove('gss_hidden');
            } else {
                item.classList.add('gss_hidden');
            }
        });
    }

    function openModal() {
        const character = getCharacter();

        if (!character) {
            alert('No character selected.');
            return;
        }

        const greetings = getGreetings(character);

        if (!greetings.length) {
            alert('This character has no greetings found.');
            return;
        }

        showingFavoritesOnly = false;

        const modal = createModalIfNeeded();
        const box = document.getElementById('gss_box');

        box.innerHTML = `
            <h2>Greeting Selector</h2>
            <p>Choose a greeting, rename it, preview it, or start a new chat directly with it.</p>

            <div id="gss_tabs">
                <button id="gss_tab_all" class="gss_tab gss_tab_active" type="button">All</button>
                <button id="gss_tab_favorites" class="gss_tab" type="button">⭐ Favorites</button>
                <button id="gss_random" class="gss_tab" type="button">🎲 Random</button>
            </div>

            <input id="gss_search" type="text" placeholder="🔍 Search greeting...">
        `;

        const tabAll = document.getElementById('gss_tab_all');
        const tabFavorites = document.getElementById('gss_tab_favorites');
        const randomButton = document.getElementById('gss_random');
        const searchInput = document.getElementById('gss_search');

        tabAll.addEventListener('click', function () {
            showingFavoritesOnly = false;
            tabAll.classList.add('gss_tab_active');
            tabFavorites.classList.remove('gss_tab_active');
            renderGreetingList(box, character, greetings);
        });

        tabFavorites.addEventListener('click', function () {
            showingFavoritesOnly = true;
            tabFavorites.classList.add('gss_tab_active');
            tabAll.classList.remove('gss_tab_active');
            renderGreetingList(box, character, greetings);
        });

        randomButton.addEventListener('click', async function () {
            let availableIndexes = greetings.map((_, index) => index);

            if (showingFavoritesOnly) {
                availableIndexes = availableIndexes.filter(index => isFavorite(character, index));
            }

            const searchTerm = searchInput.value.toLowerCase().trim();

            if (searchTerm) {
                availableIndexes = availableIndexes.filter(index => {
                    const greeting = greetings[index];
                    const title = getDisplayTitle(character, greeting, index);
                    const text = `${title} ${greeting.title} ${greeting.text}`.toLowerCase();
                    return text.includes(searchTerm);
                });
            }

            if (!availableIndexes.length) {
                alert('No greetings available to draw.');
                return;
            }

            const randomIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
            await setFirstMessage(randomIndex);
        });

        searchInput.addEventListener('input', function () {
            applySearchFilter(box);
        });

        renderGreetingList(box, character, greetings);

        function escHandler(event) {
            if (event.key === 'Escape') {
                modal.style.display = 'none';
                document.removeEventListener('keydown', escHandler);
            }
        }

        document.addEventListener('keydown', escHandler);

        setTimeout(() => searchInput.focus(), 100);
        modal.style.display = 'flex';
    }

    function addButton() {
        if (document.getElementById('gss_button')) return;

        const button = document.createElement('button');
        button.id = 'gss_button';
        button.innerHTML = '<i class="fa-solid fa-scroll"></i>';
        button.title = 'Greeting Selector';

        button.addEventListener('click', openModal);

        const extensionsButton =
            document.querySelector('#extensionsMenuButton') ||
            document.querySelector('#extensions_menu_button') ||
            document.querySelector('[title*="Extensions"]') ||
            document.querySelector('[title*="Extensões"]');

        if (extensionsButton && extensionsButton.parentElement) {
            extensionsButton.parentElement.insertBefore(button, extensionsButton.nextSibling);
        } else {
            const target =
                document.querySelector('#send_form') ||
                document.querySelector('#form_sheld') ||
                document.querySelector('#chat') ||
                document.body;

            target.prepend(button);
        }

        console.log(`${EXT_NAME}: button created.`);
    }

    function init() {
        setTimeout(addButton, 3000);
    }

    init();
})();
