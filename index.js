(function () {
    const EXT_NAME = 'Greeting Navigator';
    const FAVORITES_KEY = 'gss_favorites_v1';

    let showingFavoritesOnly = false;

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

    function loadFavorites() {
        try {
            return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
        } catch {
            return {};
        }
    }

    function saveFavorites(favorites) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
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

    async function setFirstMessage(targetIndex = 0) {
        const context = getContext();

        if (!context || !Array.isArray(context.chat) || context.chat.length === 0) {
            alert('Abra um chat com o personagem primeiro.');
            return;
        }

        const character = getCharacter();
        const greetings = getGreetings(character);

        if (!greetings[targetIndex]) {
            alert('Greeting not found.');
            return;
        }

        const firstMessage = context.chat[0];

        firstMessage.swipes = greetings.map(g => g.text);
        firstMessage.swipe_id = targetIndex;
        firstMessage.mes = greetings[targetIndex].text;

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }

        const firstMesElement =
            document.querySelector('.mes[mesid="0"] .mes_text') ||
            document.querySelector('.mes[mesid="0"] .mes_block .mes_text') ||
            document.querySelector('.mes .mes_text');

      if (firstMesElement) {
    try {
        if (typeof context.messageFormatting === 'function') {
            firstMesElement.innerHTML = context.messageFormatting(
                greetings[targetIndex].text,
                firstMessage.name || character.name,
                false,
                false,
                0
            );
        } else {
            firstMesElement.innerText = greetings[targetIndex].text;
        }
    } catch (error) {
        console.error(`${EXT_NAME}: error rendering markdown`, error);
        firstMesElement.innerText = greetings[targetIndex].text;
    }
}

const firstMessageElement =
    document.querySelector('.mes[mesid="0"]');

if (firstMessageElement) {
    firstMessageElement.setAttribute('swipeid', String(targetIndex));
}

const swipeCounter =
    document.querySelector('.mes[mesid="0"] .swipes-counter');

if (swipeCounter) {
    swipeCounter.innerHTML = `&nbsp;${targetIndex + 1}&nbsp;/&nbsp;${greetings.length}`;
}

        const modal = document.getElementById('gss_modal');
        if (modal) {
            modal.style.display = 'none';
        }
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
            favoriteButton.className = 'gss_fav_button';
            favoriteButton.innerHTML = isFavorite(character, index) ? '★' : '☆';
            favoriteButton.title = 'Favoritar greeting';

            favoriteButton.addEventListener('click', function (event) {
                event.stopPropagation();
                toggleFavorite(character, index);
                renderGreetingList(box, character, greetings);
            });

            const content = document.createElement('div');
            content.className = 'gss_item_content';

            const preview =
                greeting.text.length > 250
                    ? greeting.text.slice(0, 250) + '...'
                    : greeting.text;

            content.textContent =
                `${index + 1} • ${greeting.title}\n\n${preview}`;

            item.dataset.search = `${greeting.title} ${greeting.text}`;

            item.addEventListener('click', async () => {
                await setFirstMessage(index);
            });

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
            <h2>Choose Greeting</h2>
            <p>Click on the greeting you want to use in this chat.</p>

            <div id="gss_tabs">
    <button id="gss_tab_all" class="gss_tab gss_tab_active">All</button>
    <button id="gss_tab_favorites" class="gss_tab">⭐ Favorites</button>
    <button id="gss_random" class="gss_tab">🎲 Random</button>
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
            const text = `${greeting.title} ${greeting.text}`.toLowerCase();
            return text.includes(searchTerm);
        });
    }

    if (!availableIndexes.length) {
        alert('No greetings available to draw.');
        return;
    }

    const randomIndex =
        availableIndexes[Math.floor(Math.random() * availableIndexes.length)];

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
        button.title = 'Escolher greeting do personagem atual';

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

        console.log(`${EXT_NAME}: botão criado.`);
    }

    function init() {
        setTimeout(addButton, 3000);
    }

    init();
})();