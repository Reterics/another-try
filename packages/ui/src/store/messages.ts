/**
 * Chat/messaging state signals
 */
import { signal } from '@preact/signals';

export interface ChatMessage {
    id: string;
    text: string;
    timestamp: number;
    author?: string;
    html?: string;
    status?: 'pending' | 'sent';
}

export const messages = signal<ChatMessage[]>([]);
export const messageInput = signal<string>('');
export const isChatActive = signal<boolean>(false);
export const cursorPosition = signal<number>(0);

export function addMessage(text: string, author?: string, status: 'pending' | 'sent' = 'sent', html?: string) {
    if (status === 'sent') {
        const idx = messages.value.findIndex((m) => m.status === 'pending' && m.text === text);
        if (idx !== -1) {
            const updated = [...messages.value];
            updated[idx] = {
                ...updated[idx],
                status: 'sent',
                author: author ?? updated[idx].author,
                html: html ?? updated[idx].html,
            };
            messages.value = updated;
            return;
        }
    }

    const message: ChatMessage = {
        id: `${Date.now()}-${Math.random()}`,
        text,
        timestamp: Date.now(),
        author,
        status,
        html,
    };
    messages.value = [...messages.value, message];
}

export function setChatState(text: string, cursor: number, active: boolean) {
    messageInput.value = text;
    const clampedCursor = Math.max(0, Math.min(text.length, cursor));
    cursorPosition.value = clampedCursor;
    isChatActive.value = active;
}

export function clearMessageInput() {
    messageInput.value = '';
    cursorPosition.value = 0;
}

export function toggleChat() {
    isChatActive.value = !isChatActive.value;
    if (!isChatActive.value) {
        clearMessageInput();
    }
}

export function typeCharacter(char: string) {
    const pos = cursorPosition.value;
    const current = messageInput.value;
    messageInput.value = current.slice(0, pos) + char + current.slice(pos);
    cursorPosition.value = pos + 1;
}

export function backspace() {
    const pos = cursorPosition.value;
    if (pos === 0) return;
    const current = messageInput.value;
    messageInput.value = current.slice(0, pos - 1) + current.slice(pos);
    cursorPosition.value = pos - 1;
}

export function deleteChar() {
    const pos = cursorPosition.value;
    const current = messageInput.value;
    if (pos >= current.length) return;
    messageInput.value = current.slice(0, pos) + current.slice(pos + 1);
}

export function moveCursor(delta: number) {
    const newPos = cursorPosition.value + delta;
    cursorPosition.value = Math.max(0, Math.min(messageInput.value.length, newPos));
}
