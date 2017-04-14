#!/usr/bin/env node

const ms = require('ms')
const bytes = require('bytes')
const minimist = require('minimist')
const manifest = require('../package.json')

require('process-bootstrap')('downloader')

const parameters = minimist(process.argv.slice(2))
const Downloader = require('../')

if (parameters.v) {
  console.log('sb-downloader: version', manifest.version)
} else if (parameters.h || parameters._.length < 1 || parameters._.length > 2) {
  console.error('Usage:\n\t$ download url [filePath] [--max-connections=4] [-H "Key: Value"]')
} else {
  const url = parameters._[0]
  const rawHeaders = [].concat(parameters.H || [])
  const headers = {}
  const filePath = parameters._[1] || null
  const maxConnections = parseInt(parameters['max-connections'], 10) || 4
  let downloadInfo = {}

  rawHeaders.forEach(function(header) {
    const index = header.indexOf(':')
    if (index !== -1) {
      headers[header.substr(0, index).trim()] = header.substr(index + 1).trim()
    }
  })
  const download = Downloader.download({
    url: url,
    output: {
      directory: process.cwd(),
      file: filePath,
    },
    connections: maxConnections,
    headers: headers,
  })
  download.onDidError(function(error) {
    console.error('Download Error', (error && error.stack) || error)
  })
  download.onDidStart(function(info) {
    downloadInfo = info
  })

  download.onDidProgress(function() {
    if (!downloadInfo.filePath) {
      return
    }
    process.stdout.write(`\rDownloaded: ${download.pool.getCompleted()} out of ${download.pool.length}`)
  })
  download.onDidComplete(function() {
    const timeTaken = process.uptime()
    const bytesPerSecond = Math.round(downloadInfo.fileSize / timeTaken)
    console.log(`\n  File saved to ${downloadInfo.filePath} in ${ms(timeTaken * 1000)} (${bytes(bytesPerSecond)}/s)`)
  })
  download.start().catch(e => console.error(e.stack || e))
}
