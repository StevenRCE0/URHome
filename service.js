import http from 'http'
import five from 'johnny-five'

const serverConfiguration = {
    port: 8700,
}

const brightnessSteps = 15
const temperatureSteps = 15
const temperatureRange = {
    min: 50,
    max: 400,
}

const relayTiming = {
    on: 75,
    off: 50,
}

let cachedConditions = {
    URLight: {
        on: false,
        brightness: 0,
        temperature: temperatureRange.min,
        temperaturePending: {
            enabled: false,
            cached: 0,
            new: 0,
        },
    },
    Sensor: {
        temperature: 29,
        humidity: 40,
    },
    HallLightOn: false,
}

let board = new five.Board({
    repl: false,
})
let boardReady = false
let pinDefinitions = {
    on: undefined,
    off: undefined,
    brightnessIncrease: undefined,
    brightnessDecrease: undefined,
    temperatureColder: undefined,
    temperatureWarmer: undefined,
    IR: undefined,
}
const pinGroups = {
    on: 1,
    off: 1,
    brightnessIncrease: 1,
    brightnessDecrease: 1,
    temperatureColder: 1,
    temperatureWarmer: 1,
    IR: 2,
}
let buttonDefinitions = {
    clickButton: undefined,
}

class TapEvent {
    pin
    callback
    constructor(pin, callback) {
        this.pin = pin
        this.callback = callback
    }
}
let tapQueues = {}
Array.from(new Set(Object.values(pinGroups))).forEach((key) => {
    tapQueues[key] = []
})
function findGroup(pin) {
    const key = Object.keys(pinDefinitions).find(
        (key) => pinDefinitions[key] === pin
    )
    if (!key) {
        console.error('programmatic error: no queue found for ' + pin.pin)
        return
    }
    return pinGroups[key]
}

const tapButton = (pin, callback) => {
    const queueKey = findGroup(pin)
    tapQueues[queueKey].push(new TapEvent(pin, callback))

    if (tapQueues[queueKey].length > 1) {
        return
    }

    const tick = setInterval(() => {
        if (tapQueues[queueKey].length < 1) {
            clearInterval(tick)
            return
        }
        const event = tapQueues[queueKey].pop()
        event.pin.high()
        setTimeout(() => {
            event.pin.low()
            if (typeof event.callback === 'function') {
                event.callback()
            }
        }, relayTiming.off)
    }, relayTiming.on + relayTiming.off)
}
const tapGradualButton = (
    positiveButton,
    negativeButton,
    newStep,
    cachedStep,
    callback
) => {
    while (cachedStep !== newStep) {
        if (cachedStep < newStep) {
            tapButton(positiveButton, newStep - cachedStep === 1 ? callback : null)
            cachedStep++
        } else if (cachedStep > newStep) {
            tapButton(negativeButton, cachedStep - newStep === 1 ? callback : null)
            cachedStep--
        }
    }
}

const resetLight = () => {
    tapButton(pinDefinitions.on)
    for (let i = 0; i < brightnessSteps; i++) {
        tapButton(pinDefinitions.brightnessIncrease)
    }
    for (let i = 0; i < temperatureSteps; i++) {
        tapButton(pinDefinitions.temperatureColder)
    }
    cachedConditions.URLight.temperature = temperatureRange.min
    cachedConditions.URLight.brightness = 100
    cachedConditions.URLight.on = true
}

board.on('ready', () => {
    console.log('Board ready')
    pinDefinitions = {
        on: new five.Pin(2),
        off: new five.Pin(3),
        brightnessIncrease: new five.Pin(4),
        brightnessDecrease: new five.Pin(5),
        temperatureColder: new five.Pin(6),
        temperatureWarmer: new five.Pin(7),
        IR: new five.Pin(8),
    }
    buttonDefinitions = {
        clickButton: 9,
    }
    const integratedSensor = new five.Multi({
        controller: 'BME280',
    })
    const clickButton = new five.Button({
        pin: buttonDefinitions.clickButton,
        isPullup: true,
        holdtime: 2000,
    })
    debugLed = new five.Led(13)

    clickButton.on('press', function () {
        IRResponder(cachedConditions.HallLightOn ? 'off' : 'on')
    })
    clickButton.on('hold', function () {
        cachedConditions.HallLightOn = !cachedConditions.HallLightOn
    })
    integratedSensor.on('data', function () {
        cachedConditions.Sensor.temperature = this.thermometer.celsius
        cachedConditions.Sensor.humidity = this.hygrometer.relativeHumidity
    })
    boardReady = true
    Object.entries(pinDefinitions).forEach(([key, pin]) => {
        pin.low()
    })
})

http.createServer((req, res) => {
    const requestURL = new URL(req.url, `http://${req.headers.host}`)
    const requestPath = requestURL.pathname.split('/')
    if (!boardReady) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Board Not Ready')
        return
    }
    switch (requestPath[1]) {
        case 'light':
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end(
                lightResponder(requestPath[2], requestURL.search.substring(1))
            )
            break
        case 'sensor':
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end(sensorResponder())
            break
        case 'hallLight':
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end(IRResponder(requestURL.search.substring(1)))
            break
        default:
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('Insufficient Interface')
            break
    }
}).listen(serverConfiguration.port)

const lightResponder = (type, value) => {
    if (type === 'reset') {
        resetLight()
        return 'OK'
    }
    if (type === 'on') {
        if (value.length > 0) {
            if (value === 'on') {
                tapButton(pinDefinitions.on)
                cachedConditions.URLight.on = true
            } else if (value === 'off') {
                tapButton(pinDefinitions.off)
                cachedConditions.URLight.on = false
            }
            if (cachedConditions.URLight.temperaturePending.enabled) {
                setTimeout(() => {
                    tapGradualButton(
                        pinDefinitions.temperatureWarmer,
                        pinDefinitions.temperatureColder,
                        cachedConditions.URLight.temperaturePending.new,
                        cachedConditions.URLight.temperaturePending.cached,
                        () => {
                            cachedConditions.URLight.temperaturePending.enabled = false
                        }
                    )
                }, relayTiming.on + relayTiming.off)
            }
            return 'OK'
        } else {
            return JSON.stringify(cachedConditions['URLight'].on ? 1 : 0)
        }
    }
    if (type === 'brightness') {
        if (value.length > 0) {
            let cachedBrightnessStep = Math.round(
                (brightnessSteps * cachedConditions.URLight.brightness) / 100
            )
            const newBrightnessStep = Math.round(
                (brightnessSteps * value) / 100
            )
            tapGradualButton(
                pinDefinitions.brightnessIncrease,
                pinDefinitions.brightnessDecrease,
                newBrightnessStep,
                cachedBrightnessStep,
                () => {
                    cachedConditions['URLight'].brightness = value
                }
            )
            return 'OK'
        } else {
            return cachedConditions['URLight'].brightness.toString()
        }
    }
    if (type === 'temperature') {
        if (value.length > 0) {
            let cachedTemperatureStep = Math.round(
                (temperatureSteps * cachedConditions.URLight.temperature -
                    temperatureRange.min) /
                    (temperatureRange.max - temperatureRange.min)
            )
            const newTemperatureStep = Math.round(
                (temperatureSteps * value - temperatureRange.min) /
                    (temperatureRange.max - temperatureRange.min)
            )
            if (cachedConditions.URLight.on) {
                tapGradualButton(
                    pinDefinitions.temperatureWarmer,
                    pinDefinitions.temperatureColder,
                    newTemperatureStep,
                    cachedTemperatureStep,
                    () => {
                        cachedConditions['URLight'].temperature = value
                    }
                )
            } else {
                cachedConditions.URLight.temperaturePending = {
                    enabled: true,
                    cached: cachedTemperatureStep,
                    new: newTemperatureStep,
                }
                cachedConditions['URLight'].temperature = value
            }
            return 'OK'
        } else {
            return cachedConditions['URLight'].temperature.toString()
        }
    }
}

const sensorResponder = () => {
    return JSON.stringify(cachedConditions['Sensor'])
}

const IRResponder = (request) => {
    if (request.length > 0) {
        if (request === 'switch') {
            cachedConditions.HallLightOn = !cachedConditions.HallLightOn
            return 'OK'
        }
        if (request === (cachedConditions.HallLightOn ? 'on' : 'off')) {
            return 'OK'
        }
        cachedConditions.HallLightOn = !cachedConditions.HallLightOn
        tapButton(pinDefinitions.IR)
        return 'OK'
    } else {
        return (cachedConditions.HallLightOn ? 1 : 0).toString()
    }
}
