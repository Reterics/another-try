/**
 * Main Menu component - matches MenuDom.ts structure exactly
 */
import { showMainMenu } from '../../store';
import {
    currentMenuSection,
    hasSavedGame,
    savedGameInfo,
    showMenuSection,
} from '../../store';
import { NewGameSection } from './NewGameSection';
import { SettingsSection } from './SettingsSection';

export function Menu() {
    if (!showMainMenu.value) {
        return null;
    }

    const section = currentMenuSection.value;
    const savedGame = savedGameInfo.value;
    const hasBackground = showMainMenu.value; // has-bg class when showing menu

    const handleContinue = () => {
        // Publish event for HUDController to handle
        // This will either resume game or start new one
        document.dispatchEvent(new CustomEvent('menu:continue'));
    };

    const handleNewGame = () => {
        showMenuSection('new-game');
    };

    const handleSettings = () => {
        showMenuSection('settings');
    };

    const panelClasses = ['menu-panel'];
    if (section === 'settings') {
        panelClasses.push('settings-open');
    }
    if (section !== 'main') {
        panelClasses.push('submenu-open');
    }

    return (
        <div id="mainMenu" class={hasBackground ? 'has-bg' : ''}>
            <div class="main-menu">
                <div class={panelClasses.join(' ')}>

                    <div class="menu-header">
                        <div>
                            <div class="menu-title">Single Player</div>
                            <div class="menu-game-name">Another Try</div>
                            <div class="menu-subtitle">
                                Press <strong>Enter</strong> to continue
                            </div>
                        </div>
                        <div style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em'
                        }}>
                            v0.0.2
                        </div>
                    </div>


                    <div class="menu-body">

                        <div class="menu-left">
                            <ul class="menu-items">
                                <MenuItem
                                    label="Continue"
                                    description="Jump back into your last session"
                                    keyBinding="Enter"
                                    onClick={handleContinue}
                                    action="continue"
                                    primary={hasSavedGame.value}
                                    disabled={!hasSavedGame.value}
                                />
                                <MenuItem
                                    label="New game"
                                    description="Start a fresh run with your name"
                                    keyBinding="N"
                                    onClick={handleNewGame}
                                    action="new-game"
                                />
                                <MenuItem
                                    label="Settings"
                                    description="Tweak visuals and performance"
                                    keyBinding="F10"
                                    onClick={handleSettings}
                                    action="settings"
                                />
                            </ul>

                            <div class="menu-footer">
                                <span>
                                    Profile: <strong>
                                        {savedGame?.name || 'Traveler_01'}
                                    </strong>
                                </span>
                                <span>
                                    Autosave: <strong>
                                        {savedGame?.date ? formatDate(savedGame.date) : 'Just now'}
                                    </strong>
                                </span>
                            </div>
                        </div>


                        <div class="menu-right">
                            {section === 'new-game' && <NewGameSection />}
                            {section === 'settings' && <SettingsSection />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface MenuItemProps {
    label: string;
    description: string;
    keyBinding: string;
    onClick: () => void;
    action: string;
    primary?: boolean;
    disabled?: boolean;
}

function MenuItem({ label, description, keyBinding, onClick, action, primary, disabled }: MenuItemProps) {
    const classes = ['menu-item'];
    if (primary) classes.push('primary');
    if (disabled) classes.push('disabled');

    return (
        <li class={classes.join(' ')} data-action={action}>
            <button class="primary-btn" onClick={onClick} disabled={disabled}>
                <div class="menu-item-main">
                    <span>{label}</span>
                    <span class="menu-item-desc">{description}</span>
                </div>
            </button>
            <span class="menu-item-key">{keyBinding}</span>
        </li>
    );
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    } catch {
        return 'Just now';
    }
}
