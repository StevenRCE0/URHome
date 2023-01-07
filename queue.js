import { pinGroups, pinDefinitions } from './service.js'

export class TapEvent {
    pin
    callback
    block
    constructor(pin, callback, block) {
        this.pin = pin
        this.callback = callback
    }
}
export function findGroup(pin) {
    const key = Object.keys(pinDefinitions).find(
        (key) => pinDefinitions[key] === pin
    )
    if (!key) {
        console.error('Programmatic error: no queue found for ' + pin.pin)
        return
    }
    return pinGroups[key]
}
