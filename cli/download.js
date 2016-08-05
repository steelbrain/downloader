#!/usr/bin/env node
'use strict'

const ms = require('ms')
const chalk = require('chalk')
const minimist = require('minimist')
const manifest = require('../package')
const fileSize = require('filesize')
const ProgressBar = require('progress')
const Downloader = require('../')
const parameters = minimist(process.argv.slice(2))

process.on('uncaughtException', function(error) {
  console.error((error && error.stack) || error)
})
process.on('unhandledRejection', function(reason, promise) {
  console.error('Unhandled Rejection at: Promise ', promise, ' reason: ', reason)
})

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
    const chunks = header.split(':')
    if (chunks.length === 2) {
      headers[chunks[0].trim()] = chunks[1].trim()
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

  let progress = null
  let lastCompleted = 0
  download.onDidProgress(function() {
    if (!downloadInfo.filePath) {
      return
    }
    if (!progress) {
      progress = new ProgressBar(`  Downloading [:bar] ${chalk.blue(':percent')} ${chalk.yellow(':current KiB/:total KiB')}`, {
        complete: '=',
        incomplete: '_',
        width: 50,
        total: Math.ceil(download.pool.length / 1024),
      })
    }
    const newCompleted = Math.round(download.pool.getCompleted() / 1024)
    progress.tick(newCompleted - lastCompleted)
    lastCompleted = newCompleted
  })
  download.onDidComplete(function() {
    const timeTaken = process.uptime()
    const bytesPerSecond = Math.round(downloadInfo.fileSize / timeTaken)
    console.log(`\n  File saved to ${chalk.green(downloadInfo.filePath)} in ${ms(timeTaken * 1000)} (${fileSize(bytesPerSecond)}/s)`)
  })
  download.start().catch(e => console.error(e.stack || e))
}
