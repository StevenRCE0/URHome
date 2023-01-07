import { writeFile, readFile, existsSync } from 'fs'

const verifySavePath = process.env.SAVE && existsSync(process.env.SAVE)

export function saveConfiguration(object) {
    if (!verifySavePath) {
        return
    }
    return new Promise((resolve, reject) => {
        writeFile(
            `${process.env.SAVE}/save.json`,
            JSON.stringify(object),
            'utf8',
            (err) => {
                if (err) {
                    reject(err)
                } else {
                    console.log('Saved!')
                    resolve()
                }
            }
        )
    })
}

export function readConfiguration() {
    if (!verifySavePath) {
        return null
    }
    return new Promise((resolve, reject) => {
        readFile(`${process.env.SAVE}/save.json`, 'utf8', (err, data) => {
            if (err) {
                reject(err)
            } else {
                console.log('Read!')
                resolve(JSON.parse(data))
            }
        })
    })
}
