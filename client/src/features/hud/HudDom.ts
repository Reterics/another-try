export interface HudDomRefs {
    info: HTMLElement | null;
    stats: HTMLElement | null;
    messageInput: HTMLElement | null;
    messageList: HTMLElement | null;
    footer: HTMLElement | null;
    sideButtons: HTMLDivElement | null;
    playerName: HTMLElement | null;
    playerLevel: HTMLElement | null;
    healthBar: HTMLElement | null;
    healthText: HTMLElement | null;
    healthRate: HTMLElement | null;
    staminaBar: HTMLElement | null;
    staminaText: HTMLElement | null;
    staminaRate: HTMLElement | null;
    energy: HTMLProgressElement | null;
}

export function createHudDom(): { root: HTMLDivElement; refs: HudDomRefs } {
    const root = document.createElement('div');
    root.id = 'inGame';

    const layer = document.createElement('div');
    layer.classList.add('hud-layer');
    root.appendChild(layer);

    // Top row
    const topRow = document.createElement('div');
    topRow.classList.add('hud-top-row');
    layer.appendChild(topRow);

    const leftStack = document.createElement('div');
    leftStack.classList.add('hud-left-stack');
    topRow.appendChild(leftStack);

    const playerPanel = document.createElement('div');
    playerPanel.classList.add('player-panel');
    playerPanel.innerHTML = `
      <div class="player-header">
        <div class="player-name" id="HUD-player-name"></div>
        <div class="player-level" id="HUD-player-level"></div>
      </div>
      <div class="stat-row">
        <div class="stat-label">Health</div>
        <div class="stat-bar">
          <div class="stat-bar-fill health" id="HUD-health-bar" style="transform: scaleX(1);"></div>
        </div>
        <div class="stat-values">
          <span id="HUD-health-text"></span>
          <span id="HUD-health-rate"></span>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-label">Stamina</div>
        <div class="stat-bar">
          <div class="stat-bar-fill stamina" id="HUD-stamina-bar" style="transform: scaleX(1);"></div>
        </div>
        <div class="stat-values">
          <span id="HUD-stamina-text"></span>
          <span id="HUD-stamina-rate"></span>
        </div>
      </div>
      <div id="HUD-information"></div>
      <div style="display:none">
        <progress id="HUD-energy" value="0" max="20">0%</progress>
      </div>`;
    leftStack.appendChild(playerPanel);

    const debugPanel = document.createElement('div');
    debugPanel.id = 'HUD-stats';
    debugPanel.classList.add('debug-panel');
    leftStack.appendChild(debugPanel);

    const rightStack = document.createElement('div');
    rightStack.classList.add('hud-right-stack');
    topRow.appendChild(rightStack);

    // Bottom row
    const bottomRow = document.createElement('div');
    bottomRow.classList.add('hud-bottom-row');
    layer.appendChild(bottomRow);

    const messagePanel = document.createElement('div');
    messagePanel.classList.add('message-panel');
    messagePanel.innerHTML = `
      <div class="message-header">Messages</div>
      <div class="message-list" id="messageList"></div>
      <div id="typedMessage">
        <div id="messageInput"></div>
      </div>`;
    bottomRow.appendChild(messagePanel);

    const skillBar = document.createElement('div');
    skillBar.classList.add('skill-bar', 'side-buttons');
    skillBar.innerHTML = `
      <div class="skill-slot side-button selected" data-active="pointer" title="Pointer">
        <span class="skill-key">1</span>
        <img src="/cursor.svg" alt="Pointer" width="22" height="22" />
        <div class="skill-cooldown"></div>
      </div>
      <div class="skill-slot side-button" data-active="far" title="Far">
        <span class="skill-key">2</span>
        <img src="/binoculars.svg" alt="Far" width="22" height="22" />
        <div class="skill-cooldown" style="opacity:0.55;"></div>
      </div>
      <div class="skill-slot side-button" data-active="size" title="Size">
        <span class="skill-key">3</span>
        <img src="/box.svg" alt="Size" width="22" height="22" />
        <div class="skill-cooldown"></div>
      </div>
      <div class="skill-slot side-button" data-active="precision" title="Precision">
        <span class="skill-key">4</span>
        <img src="/border-style.svg" alt="Precision" width="22" height="22" />
        <div class="skill-cooldown"></div>
      </div>`;
    bottomRow.appendChild(skillBar);

    const footerWrap = document.createElement('div');
    footerWrap.classList.add('hud-footer-wrap');
    const footer = document.createElement('div');
    footer.id = 'HUD-footer';
    footerWrap.appendChild(footer);
    bottomRow.appendChild(footerWrap);

    const refs: HudDomRefs = {
        info: playerPanel.querySelector('#HUD-information'),
        stats: debugPanel,
        messageInput: messagePanel.querySelector('#messageInput'),
        messageList: messagePanel.querySelector('#messageList'),
        footer,
        sideButtons: skillBar,
        playerName: playerPanel.querySelector('#HUD-player-name'),
        playerLevel: playerPanel.querySelector('#HUD-player-level'),
        healthBar: playerPanel.querySelector('#HUD-health-bar'),
        healthText: playerPanel.querySelector('#HUD-health-text'),
        healthRate: playerPanel.querySelector('#HUD-health-rate'),
        staminaBar: playerPanel.querySelector('#HUD-stamina-bar'),
        staminaText: playerPanel.querySelector('#HUD-stamina-text'),
        staminaRate: playerPanel.querySelector('#HUD-stamina-rate'),
        energy: playerPanel.querySelector('#HUD-energy') as HTMLProgressElement | null,
    };

    return { root, refs };
}
