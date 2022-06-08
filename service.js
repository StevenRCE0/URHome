import http from "http"

cachedConditions = {
  URLight: {
    on: false,
    brightness: 0,
    temperature: 0,
  },
}

http
  .createServer((req, res) => {
    requestURL = new URL(req.url)
    requestPath = requestURL.pathname.split("/")
    if (requestPath[0] === "light") {
      result =
        lightResponder(
          requestPath[1],
          requestURL.search
        ) ?? "OK"
      res.writeHead(200, { "Content-Type": "text/plain" })
      res.end(result)
    }
  })
  .listen(8700)

const lightResponder = (type, value) => {
  console.log(type, value)
  if (type === "on") {
    if (value !== undefined) {
      // TODO: Johnny here
      cachedConditions["URLight"].on = value
    } else {
      return cachedConditions["URLight"].on
    }
  }
  if (type === "brightness") {
    if (value !== undefined) {
      // TODO: Johnny here
      cachedConditions["URLight"].brightness = value
    } else {
      return cachedConditions["URLight"].brightness
    }
  }
}
