import { findGroup, TapEvent } from './queue.js'
import { relayTiming, tapQueues } from './service.js'

export const tapButton = (pin, callback, delayed = false) => {
    const queueKey = findGroup(pin)
    tapQueues[queueKey].push(new TapEvent(pin, callback))

    if (tapQueues[queueKey].length > 1 || delayed) {
        return
    }

    solveQueue(tapQueues[queueKey])
}

export const tapGradualButton = (
    positiveButton,
    negativeButton,
    newStep,
    cachedStep,
    callback,
    delayed = false
) => {
    while (cachedStep !== newStep) {
        if (cachedStep < newStep) {
            tapButton(
                positiveButton,
                newStep - cachedStep === 1 ? callback : null,
                delayed
            )
            cachedStep++
        } else if (cachedStep > newStep) {
            tapButton(
                negativeButton,
                cachedStep - newStep === 1 ? callback : null,
                delayed
            )
            cachedStep--
        }
    }
}

export function solveQueue(queue) {
    const tick = setInterval(() => {
        if (queue.length < 1) {
            clearInterval(tick)
            return
        }
        const event = queue.pop()
        event.pin.high()
        setTimeout(() => {
            event.pin.low()
            if (typeof event.callback === 'function') {
                event.callback()
            }
        }, relayTiming.off)
    }, relayTiming.on + relayTiming.off)
}
