import { useEffect, useRef } from 'preact/hooks';
import { isChatActive, messageInput, messages } from '../../store/messages';

/**
 * Messages Panel - matches HudDom.ts structure exactly
 * Messages are rendered from the signals store, keeping HUDController and UI in sync.
 */
export function MessagesPanel() {
    const list = messages.value;
    const chatOpen = isChatActive.value;
    const inputValue = messageInput.value;
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = listRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [list.length]);

    return (
        <div class="message-panel">
            <div class="message-header">Messages</div>
            <div class="message-list" id="messageList" ref={listRef}>
                {list.map((msg) => (
                    <div
                        key={msg.id}
                        class={msg.status === 'pending' ? 'pending' : undefined}
                        dangerouslySetInnerHTML={{ __html: msg.html ?? msg.text }}
                    />
                ))}
            </div>
            <div id="typedMessage">
                <div
                    id="messageInput"
                    data-active={chatOpen}
                    style={{ display: chatOpen ? 'flex' : 'none' }}
                >
                    {inputValue || <span class="placeholder">Press T to chat</span>}
                </div>
            </div>
        </div>
    );
}
