import http from 'http'
import five from 'johnny-five'

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
            new: 0
        },
        locked: false,
    },
    Sensor: {
        temperature: 29,
        humidity: 40,
    },
    HallLightOn: false,
}

var board = new five.Board({
    repl: false,
})
var boardReady = false
var pinDefinitions = {
    on: undefined,
    off: undefined,
    brightnessIncrease: undefined,
    brightnessDecrease: undefined,
    temperatureColder: undefined,
    temperatureWarmer: undefined,
    IR: undefined,
}

const tapButton = (pin, callback) => {
    pin.high()
    setTimeout(() => {
        pin.low()
        if (callback) {
            callback()
        }
    }, relayTiming.off)
}
const tapGradualButton = (
    positiveButton,
    negativeButton,
    newStep,
    cachedStep,
    callback
) => {
    cachedConditions.URLight.locked = true
    const interval = setInterval(() => {
        if (cachedStep < newStep) {
            tapButton(positiveButton)
            cachedStep++
        } else if (cachedStep > newStep) {
            tapButton(negativeButton)
            cachedStep--
        } else {
            clearInterval(interval)
            cachedConditions.URLight.locked = false
            if (callback) {
                callback()
            }
        }
    }, relayTiming.off + relayTiming.on)
}

const resetLight = () => {
    if (boardReady) {
        tapButton(pinDefinitions.on)
        for (let i = 0; i < brightnessSteps; i++) {
            tapButton(pinDefinitions.brightnessIncrease)
        }
    }
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
        temperatureColder: new five.Pin(7),
        temperatureWarmer: new five.Pin(6),
        IR: new five.Pin(8),
    }
    const integratedSensor = new five.Multi({
        controller: 'BME280',
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
    if (requestPath[1] === 'light') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(lightResponder(requestPath[2], requestURL.search.substring(1)))
    } else if (requestPath[1] === 'sensor') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(sensorResponder())
    } else if (requestPath[1] === 'hallLight') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(IRResponder(requestURL.search.substring(1)))
    }
}).listen(8700)

const lightResponder = (type, value) => {
    if (type === 'on') {
        if (value.length > 0) {
            if (boardReady && !cachedConditions.URLight.locked) {
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
                            pinDefinitions.temperatureColder,
                            pinDefinitions.temperatureWarmer,
                            cachedConditions.URLight.temperaturePending.new,
                            cachedConditions.URLight.temperaturePending.cached,
                            () => {
                                cachedConditions.URLight.temperaturePending.enabled = false
                            }
                        )
                    }, relayTiming.on + relayTiming.off);
                }
            } else if (!boardReady) {
                // Dummy value
                cachedConditions.URLight.on =
                    value === 'on'
                        ? true
                        : value === 'off'
                        ? false
                        : cachedConditions.URLight.on
            }
            return 'OK'
        } else {
            return JSON.stringify(cachedConditions['URLight'].on ? 1 : 0)
        }
    }
    if (type === 'brightness') {
        if (value.length > 0) {
            var cachedBrightnessStep = Math.round(
                (brightnessSteps * cachedConditions.URLight.brightness) / 100
            )
            const newBrightnessStep = Math.round(
                (brightnessSteps * value) / 100
            )
            if (cachedConditions.URLight.locked) {
                return
            }
            if (boardReady) {
                console.log('should tap');
                tapGradualButton(
                    pinDefinitions.brightnessIncrease,
                    pinDefinitions.brightnessDecrease,
                    newBrightnessStep,
                    cachedBrightnessStep,
                    () => {
                        cachedConditions['URLight'].brightness = value
                    }
                )
            } else if (!boardReady) {
                // Dummy value
                cachedConditions.URLight.brightness = value
            }
            return 'OK'
        } else {
            return cachedConditions['URLight'].brightness.toString()
        }
    }
    if (type === 'temperature') {
        if (value.length > 0) {
            var cachedTemperatureStep = Math.round(
                (temperatureSteps * cachedConditions.URLight.temperature -
                    temperatureRange.min) /
                    (temperatureRange.max - temperatureRange.min)
            )
            const newTemperatureStep = Math.round(
                (temperatureSteps * value - temperatureRange.min) /
                    (temperatureRange.max - temperatureRange.min)
            )
            if (cachedConditions.URLight.locked) {
                return
            }
            if (boardReady) {
                if (cachedConditions.URLight.on) {
                    tapGradualButton(
                        pinDefinitions.temperatureColder,
                        pinDefinitions.temperatureWarmer,
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
                        new: newTemperatureStep
                    }
                    cachedConditions['URLight'].temperature = value
                }
            } else if (!boardReady) {
                // Dummy value
                cachedConditions.URLight.temperature = value
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
    console.log(request)
    if (request.length > 0) {
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
