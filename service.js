import http from 'http'
import five from 'johnny-five'
import { saveConfiguration, readConfiguration } from './save.js'
import { solveQueue, tapButton, tapGradualButton } from './tapButton.js'

const serverConfiguration = {
    port: 8700,
}

const brightnessSteps = 15
const temperatureSteps = 15
const temperatureRange = {
    min: 50,
    max: 400,
}
export const relayTiming = {
    on: 75,
    off: 50,
    wait: 250,
}

let placeholderConditions = {
    URLight: {
        on: false,
        brightness: 0,
        temperature: temperatureRange.min,
        hold: undefined,
    },
    Sensor: {
        temperature: 29,
        humidity: 40,
    },
    HallLightOn: false,
}
let cachedConditions
const saveRead = readConfiguration()
let saving = false
let saveTimeout = 10000
if (saveRead) {
    saveRead
        .then((data) => {
            cachedConditions = data
        })
        .catch((err) => {
            console.error(err)
            cachedConditions = placeholderConditions
        })
} else {
    cachedConditions = placeholderConditions
}

let board = new five.Board({
    repl: false,
})
let boardReady = false

export let pinDefinitions = {
    on: undefined,
    off: undefined,
    brightnessIncrease: undefined,
    brightnessDecrease: undefined,
    temperatureColder: undefined,
    temperatureWarmer: undefined,
    IR: undefined,
}
let buttonDefinitions = {
    clickButton: undefined,
}
let debugLed

export const pinGroups = {
    on: 0,
    off: 0,
    brightnessIncrease: 0,
    brightnessDecrease: 0,
    temperatureColder: 0,
    temperatureWarmer: 0,
    IR: 2,
}

export let tapQueues = {}
Array.from(new Set(Object.values(pinGroups))).forEach((key) => {
    tapQueues[key] = []
})

const resetLight = () => {
    tapButton(pinDefinitions.on)
    const gradual = () => {
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
    setTimeout(() => {
        gradual()
    }, relayTiming.wait)
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
    if (!saving) {
        saving = true
        setTimeout(() => {
            saveConfiguration(cachedConditions)
            saving = false
        }, saveTimeout)
    }
}).listen(serverConfiguration.port)

class LightStrokers {
    brightness(value, cbe = true) {
        const cachedBrightnessStep =
            brightnessSteps *
            Math.round(cachedConditions.URLight.brightness / 100)

        const newBrightnessStep = brightnessSteps * Math.round(value / 100)

        tapGradualButton(
            pinDefinitions.brightnessIncrease,
            pinDefinitions.brightnessDecrease,
            newBrightnessStep,
            cachedBrightnessStep,
            cbe
                ? () => {
                      cachedConditions['URLight'].brightness = value
                  }
                : () => {},
            !cachedConditions['URLight'].on
        )
    }

    temperature(value, cbe = true) {
        let cachedTemperatureStep = Math.round(
            (temperatureSteps * cachedConditions.URLight.temperature -
                temperatureRange.min) /
                (temperatureRange.max - temperatureRange.min)
        )
        const newTemperatureStep = Math.round(
            (temperatureSteps * value - temperatureRange.min) /
                (temperatureRange.max - temperatureRange.min)
        )
        tapGradualButton(
            pinDefinitions.temperatureWarmer,
            pinDefinitions.temperatureColder,
            newTemperatureStep,
            cachedTemperatureStep,
            cbe
                ? () => {
                      cachedConditions['URLight'].temperature = value
                  }
                : () => {},
            !cachedConditions['URLight'].on
        )
    }
}
const lightStrokers = new LightStrokers()

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
                setTimeout(() => {
                    if (cachedConditions['URLight'].hold !== undefined) {
                        if (
                            cachedConditions['URLight'].hold.brightness !==
                            undefined
                        ) {
                            lightStrokers.brightness(
                                cachedConditions['URLight'].hold.brightness,
                                false
                            )
                            cachedConditions['URLight'].brightness =
                                cachedConditions['URLight'].hold.brightness
                        }
                        if (
                            cachedConditions['URLight'].hold.temperature !==
                            undefined
                        ) {
                            lightStrokers.temperature(
                                cachedConditions['URLight'].hold.temperature,
                                false
                            )
                            cachedConditions['URLight'].temperature =
                                cachedConditions['URLight'].hold.temperature
                        }
                        cachedConditions['URLight'].hold = undefined
                    }
                    solveQueue(tapQueues[pinGroups.brightnessIncrease])
                }, relayTiming.wait)
            } else if (value === 'off') {
                tapButton(pinDefinitions.off)
                cachedConditions.URLight.on = false
            }
            return 'OK'
        } else {
            return JSON.stringify(cachedConditions['URLight'].on ? 1 : 0)
        }
    }
    if (type === 'brightness') {
        if (value.length > 0) {
            if (!cachedConditions['URLight'].on) {
                cachedConditions['URLight']['hold'] = cachedConditions[
                    'URLight'
                ]['hold']
                    ? {
                          ...cachedConditions['URLight']['hold'],
                          brightness: value,
                      }
                    : {
                          brightness: value,
                      }
                return 'OK'
            }

            lightStrokers.brightness(value)

            return 'OK'
        } else {
            return cachedConditions['URLight'].brightness.toString()
        }
    }
    if (type === 'temperature') {
        if (value.length > 0) {
            if (!cachedConditions['URLight'].on) {
                cachedConditions['URLight']['hold'] = cachedConditions[
                    'URLight'
                ]['hold']
                    ? {
                          ...cachedConditions['URLight']['hold'],
                          temperature: value,
                      }
                    : {
                          temperature: value,
                      }
                return 'OK'
            }

            lightStrokers.temperature(value)

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
