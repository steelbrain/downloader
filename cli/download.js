#!/usr/bin/env node

const ms = require('ms')
const ora = require('ora')
const Path = require('path')
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
  const spinner = ora('Downloading').start()
  let connection

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
  download.onDidEstablishConnection(function(_connection) {
    if (!connection) connection = _connection
  })
  download.onDidProgress(function() {
    if (!connection) {
      return
    }
    spinner.text = `Downloading: ${Path.basename(download.filePath)} (${bytes(download.pool.getCompleted())} / ${bytes(download.pool.length)})`
  })
  download.onDidComplete(function() {
    const timeTaken = process.uptime()
    const bytesPerSecond = connection.fileSize === Infinity ? '' : `(${bytes(Math.round(connection.fileSize / timeTaken))}/s)`
    spinner.stop()
    console.log(`\n  File saved to ${download.filePath} in ${ms(timeTaken * 1000)} ${bytesPerSecond}`)
  })
  download.activate().catch(e => console.error(e.stack || e))

  let downloadIsAlive = true
  const killDownload = function() {
    if (downloadIsAlive) {
      downloadIsAlive = false
      download.dispose()
    }
    process.exit()
  }

  process.on('SIGINT', killDownload)
  process.on('exit', killDownload)
}
