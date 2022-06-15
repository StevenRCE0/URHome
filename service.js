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
const pinDefinitions = {
    mainPositive: new five.Pin(13),
    mainNegative: new five.Pin(12),
    on: new five.Pin(2),
    off: new five.Pin(3),
    brightnessIncrease: new five.Pin(4),
    brightnessDecrease: new five.Pin(5),
    temperatureColder: new five.Pin(6),
    temperatureWarmer: new five.Pin(7),
}

function tapButton(pin) {
    pin.high()
    setTimeout(() => {
        pin.low()
    }, 500)
}

board.on('ready', () => {
    console.log('Board ready')
    Object.entries(pinDefinitions).forEach(([key, pin]) => {
        if (key === 'mainPositive') {
            pin.high()
        } else {
            pin.low()
        }
    })
    mainPositive.high()
    setTimeout(() => {
        off0.high()
        off1.low()
    }, 1000)
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
    }
}).listen(8700)

const lightResponder = (type, value) => {
    console.log(type, typeof value, value.length)
    if (type === 'on') {
        if (value.length > 0) {
            // TODO: Johnny here
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
            // TODO: Johnny here
            cachedConditions['URLight'].brightness = value
        } else {
            return JSON.stringify(cachedConditions['URLight'].brightness)
        }
    }
}
