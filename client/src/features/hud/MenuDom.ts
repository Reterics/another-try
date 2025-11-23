export interface MenuDomRefs {
    continueItem: HTMLElement;
    newGameItem: HTMLElement;
    settingsItem: HTMLElement;
    newGameSection: HTMLElement;
    settingsSection: HTMLElement;
    newNameInput: HTMLInputElement;
    startNewBtn: HTMLButtonElement;
    applySettingsBtn: HTMLButtonElement;
    menuPanel: HTMLElement;
    mapsContainer: HTMLElement;
}

export function createMenuDom(): { root: HTMLDivElement; refs: MenuDomRefs } {
    const root = document.createElement('div');
    root.id = 'mainMenu';
    root.classList.add('has-bg');

    const main = document.createElement('div');
    main.classList.add('main-menu');
    root.appendChild(main);

    const panel = document.createElement('div');
    panel.classList.add('menu-panel');
    main.appendChild(panel);

    const header = document.createElement('div');
    header.classList.add('menu-header');
    panel.appendChild(header);

    const headerLeft = document.createElement('div');
    header.appendChild(headerLeft);
    const title = document.createElement('div');
    title.classList.add('menu-title');
    title.textContent = 'Single Player';
    const gameName = document.createElement('div');
    gameName.classList.add('menu-game-name');
    gameName.textContent = 'Another Try';
    const subtitle = document.createElement('div');
    subtitle.classList.add('menu-subtitle');
    subtitle.innerHTML = 'Press <strong>Enter</strong> to continue';
    headerLeft.append(title, gameName, subtitle);

    const version = document.createElement('div');
    version.style.fontSize = '11px';
    version.style.color = 'var(--text-muted)';
    version.style.textTransform = 'uppercase';
    version.style.letterSpacing = '0.12em';
    version.textContent = 'v0.1.0';
    header.appendChild(version);

    const body = document.createElement('div');
    body.classList.add('menu-body');
    panel.appendChild(body);

    const left = document.createElement('div');
    left.classList.add('menu-left');
    body.appendChild(left);

    const menuList = document.createElement('ul');
    menuList.classList.add('menu-items');
    left.appendChild(menuList);

    const makeItem = (label: string, desc: string, key: string, action: string, primary = false) => {
        const li = document.createElement('li');
        li.classList.add('menu-item');
        if (primary) li.classList.add('primary');
        li.dataset.action = action;

        const btn = document.createElement('button');
        btn.classList.add('primary-btn');
        const mainCol = document.createElement('div');
        mainCol.classList.add('menu-item-main');
        const spanLabel = document.createElement('span');
        spanLabel.textContent = label;
        const spanDesc = document.createElement('span');
        spanDesc.classList.add('menu-item-desc');
        spanDesc.textContent = desc;
        mainCol.append(spanLabel, spanDesc);
        btn.appendChild(mainCol);
        li.appendChild(btn);

        const keySpan = document.createElement('span');
        keySpan.classList.add('menu-item-key');
        keySpan.textContent = key;
        li.appendChild(keySpan);
        menuList.appendChild(li);
        return li;
    };

    const continueItem = makeItem('Continue', 'Jump back into your last session', 'Enter', 'continue', true);
    const newGameItem = makeItem('New game', 'Start a fresh run with your name', 'N', 'new-game');
    const settingsItem = makeItem('Settings', 'Tweak visuals and performance', 'F10', 'settings');

    const mapsContainer = document.createElement('div');
    mapsContainer.id = 'maps';
    mapsContainer.classList.add('hidden');
    mapsContainer.setAttribute('aria-hidden', 'true');
    mapsContainer.style.display = 'none';
    left.appendChild(mapsContainer);

    const footer = document.createElement('div');
    footer.classList.add('menu-footer');
    const profileSpan = document.createElement('span');
    profileSpan.innerHTML = 'Profile: <strong>Traveler_01</strong>';
    const autosaveSpan = document.createElement('span');
    autosaveSpan.innerHTML = 'Autosave: <strong>Just now</strong>';
    footer.append(profileSpan, autosaveSpan);
    left.appendChild(footer);

    const right = document.createElement('div');
    right.classList.add('menu-right');
    body.appendChild(right);

    const settingsSection = document.createElement('div');
    settingsSection.classList.add('menu-section');
    settingsSection.id = 'settings-section';
    settingsSection.style.display = 'none';
    settingsSection.innerHTML = `
      <div class="section-title">Graphics Settings</div>
      <div class="field">
        <label for="menu-lod">Level of Detail</label>
        <select id="menu-lod" name="menu-lod">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div class="field">
        <label for="menu-texture-quality">Texture Quality</label>
        <select id="menu-texture-quality" name="menu-texture-quality">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div class="field">
        <label for="menu-postfx">Post FX</label>
        <select id="menu-postfx" name="menu-postfx">
          <option value="off">Off</option>
          <option value="medium">Balanced</option>
          <option value="high">Cinematic</option>
        </select>
      </div>
      <div class="field">
        <label for="menu-max-fps">Max FPS</label>
        <select id="menu-max-fps" name="menu-max-fps">
          <option value="0">Uncapped (Native)</option>
          <option value="30">30 FPS</option>
          <option value="60">60 FPS</option>
          <option value="90">90 FPS</option>
          <option value="120">120 FPS</option>
        </select>
      </div>
    `;
    const applySettingsBtn = document.createElement('button');
    applySettingsBtn.classList.add('cta');
    applySettingsBtn.id = 'menu-apply-settings';
    applySettingsBtn.textContent = 'Apply Settings';
    settingsSection.appendChild(applySettingsBtn);
    right.appendChild(settingsSection);

    const newGameSection = document.createElement('div');
    newGameSection.classList.add('menu-section');
    newGameSection.id = 'new-game-section';
    newGameSection.style.display = 'none';
    newGameSection.innerHTML = `
      <div class="section-title">New Game</div>
      <div class="field">
        <label for="menu-player-name">Player Name</label>
        <input type="text" id="menu-player-name" name="menu-player-name" placeholder="Enter your name" maxlength="24" />
      </div>
    `;
    const startNewBtn = document.createElement('button');
    startNewBtn.classList.add('cta');
    startNewBtn.id = 'menu-start-new';
    startNewBtn.textContent = 'Start New Game';
    newGameSection.appendChild(startNewBtn);
    right.appendChild(newGameSection);

    return {
        root,
        refs: {
            continueItem,
            newGameItem,
            settingsItem,
            newGameSection,
            settingsSection,
            newNameInput: newGameSection.querySelector('#menu-player-name') as HTMLInputElement,
            startNewBtn,
            applySettingsBtn,
            menuPanel: panel,
            mapsContainer,
        },
    };
}
