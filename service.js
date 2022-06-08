import http from 'http'

let cachedConditions = {
    URLight: {
        on: false,
        brightness: 0,
        temperature: 0,
    },
}

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
                cachedConditions.URLight.on = true
            }
            if (value === 'off') {
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
