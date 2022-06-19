import http from 'http'
import five from 'johnny-five'

let cachedConditions = {
    URLight: {
        on: false,
        brightness: 0,
        temperature: 0,
        locked: false,
    },
    Sensor: {
        temperature: 29,
        humidity: 40,
    },
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
    // temperatureColder: undefined,
    // temperatureWarmer: undefined,
}
const brightnessSteps = 15
const temperatureSteps = 10

const relayTiming = {
    on: 75,
    off: 50
}

const tapButton = (pin) => {
    console.log('Tapped', pin.pin)
    pin.high()
    setTimeout(() => {
        pin.low()
    }, relayTiming.off)
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
        // mainPositive: new five.Pin(13),
        // mainNegative: new five.Pin(12),
        on: new five.Pin(2),
        off: new five.Pin(3),
        brightnessIncrease: new five.Pin(4),
        brightnessDecrease: new five.Pin(5),
        // temperatureColder: new five.Pin(6),
        // temperatureWarmer: new five.Pin(7),
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
        const result =
            lightResponder(requestPath[2], requestURL.search.substring(1)) ??
            'OK'
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(result)
    } else if (requestPath[1] === 'sensor') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(sensorResponder())
    }
}).listen(8700)

const lightResponder = (type, value) => {
    if (type === 'on') {
        if (value.length > 0) {
            if (boardReady && !cachedConditions.URLight.locked) {
                cachedConditions.URLight.locked = true
                if (value === 'on') {
                    tapButton(pinDefinitions.on)
                    cachedConditions.URLight.on = true
                } else if (value === 'off') {
                    tapButton(pinDefinitions.off)
                    cachedConditions.URLight.on = false
                }
                cachedConditions.URLight.locked = false
            } else if (!boardReady) {
                // Dummy value
                cachedConditions.URLight.on =
                    value === 'on'
                        ? true
                        : value === 'off'
                        ? false
                        : cachedConditions.URLight.on
            }
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
            if (cachedConditions.URLight.locked) {return}
            if (boardReady) {
                cachedConditions.URLight.locked = true
                const interval = setInterval(() => {
                    if (cachedBrightnessStep < newBrightnessStep) {
                        tapButton(pinDefinitions.brightnessIncrease)
                        cachedBrightnessStep++
                    } else if (cachedBrightnessStep > newBrightnessStep) {
                        tapButton(pinDefinitions.brightnessDecrease)
                        cachedBrightnessStep--
                    } else {
                        clearInterval(interval)
                    }
                }, relayTiming.off + relayTiming.on)
                cachedConditions.URLight.locked = false
                cachedConditions['URLight'].brightness = value
            } else if (!boardReady) {
                // Dummy value
                cachedConditions.URLight.brightness = value
            }
        } else {
            return cachedConditions['URLight'].brightness.toString()
        }
    }
}

const sensorResponder = () => {
    return JSON.stringify(cachedConditions['Sensor'])
}
