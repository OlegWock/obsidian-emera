import { EventEmitter } from 'eventemitter3';

export type EmeraEvents = {
    // name, args
    'onComponentsLoaded': [void],
    'onComponentsReloaded': [void],
}

export const eventBus = new EventEmitter<EmeraEvents>();
