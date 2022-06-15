import http from 'http'
import five from 'johnny-five'

let cachedConditions = {
    URLight: {
        on: false,
        brightness: 0,
        temperature: 0,
    },
}

var board = new five.Board()
var boardReady = false
var pinDefinitions = {
    mainPositive: undefined,
    mainNegative: undefined,
    on: undefined,
    off: undefined,
    brightnessIncrease: undefined,
    brightnessDecrease: undefined,
    temperatureColder: undefined,
    temperatureWarmer: undefined,
}
const brightnessSteps = 10
const temperatureSteps = 10

function tapButton(pin) {
    pin.high()
    setTimeout(() => {
        pin.low()
    }, 500)
}

function resetLight() {
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
        mainPositive: new five.Pin(13),
        mainNegative: new five.Pin(12),
        on: new five.Pin(2),
        off: new five.Pin(3),
        brightnessIncrease: new five.Pin(4),
        brightnessDecrease: new five.Pin(5),
        temperatureColder: new five.Pin(6),
        temperatureWarmer: new five.Pin(7),
    }
    boardReady = true
    Object.entries(pinDefinitions).forEach(([key, pin]) => {
        if (key === 'mainPositive') {
            pin.high()
        } else {
            pin.low()
        }
    })
})

http.createServer((req, res) => {
    const requestURL = new URL(req.url, `http://${req.headers.host}`)
    const requestPath = requestURL.pathname.split('/')
    console.log(pinDefinitions)
    if (requestPath[1] === 'light') {
        const result =
            lightResponder(requestPath[2], requestURL.search.substring(1)) ??
            'OK'
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(result)
    }
}).listen(8700)

const lightResponder = (type, value) => {
    console.log(type, typeof value, value.length)
    if (type === 'on') {
        if (value.length > 0) {
            if (value === 'on') {
                if (boardReady) {
                    tapButton(pinDefinitions.on)
                }
                cachedConditions.URLight.on = true
            }
            if (value === 'off') {
                if (boardReady) {
                    tapButton(pinDefinitions.off)
                }
                cachedConditions.URLight.on = false
            }
            console.log(cachedConditions)
        } else {
            return JSON.stringify(cachedConditions['URLight'].on)
        }
    }
    if (type === 'brightness') {
        if (value.length > 0) {
            const cachedBrightnessStep = Math.round(
                (brightnessSteps * cachedConditions.URLight.brightness) / 100
            )
            const newBrightnessStep = Math.round(
                (brightnessSteps * value) / 100
            )
            if (boardReady) {
                if (newBrightnessStep > cachedBrightnessStep) {
                    for (
                        let i = cachedBrightnessStep;
                        i < newBrightnessStep;
                        i++
                    ) {
                        tapButton(pinDefinitions.brightnessIncrease)
                        cachedConditions['URLight'].brightness = value
                    }
                } else if (newBrightnessStep < cachedBrightnessStep) {
                    for (
                        let i = cachedBrightnessStep;
                        i > newBrightnessStep;
                        i--
                    ) {
                        tapButton(pinDefinitions.brightnessDecrease)
                        cachedConditions['URLight'].brightness = value
                    }
                }
            } else {
                // Dummy value
                cachedConditions.URLight.brightness = value
            }
        } else {
            return JSON.stringify(cachedConditions['URLight'].brightness)
        }
    }
}
