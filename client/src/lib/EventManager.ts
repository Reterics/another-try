import {EventList} from "../types/main.ts";

export class EventManager {
    private readonly _events: EventList;
    private _maxListeners: number;

    constructor() {
        this._events = {};
        this._maxListeners = 10;
    }

    on (event: string, method: Function, preventAll = false) {
        if (!this._events[event]) {
            this._events[event] = [];
        }
        if (preventAll || !this._events[event].find(ev=>ev === method)) {
            this._events[event].push(method);
            if (this._events[event].length > this._maxListeners) {
                console.warn('More than ' + this._maxListeners + ' listeners added to this event');
            }
        }
        return this;
    }

    emit(event: string, arg?: any) {
        if (this._events[event]) {
            for (let i = 0; i < this._events[event].length; i++) {
                this._events[event][i](arg);
            }
        }
        return this;
    }

    removeListener(event: string, listener: Function) {
        if (this._events[event]) {
            const index = this._events[event].indexOf(listener);
            if (index !== -1) {
                this._events[event] =  this._events[event].splice(index, 1);
            }
        }
        return this;
    }

    off(event: string, listener: Function) {
        return this.removeListener(event, listener);
    }

    setMaxListeners(n: number) {
        this._maxListeners = n;
        return this;
    }

    rawListeners(event: string) {
        if (this._events[event]) {
            return this._events[event];
        }
        return [];
    }

    removeAllListeners(event: string) {
        if (this._events[event]) {
            this._events[event] = [];
        }
        return this;
    }
}