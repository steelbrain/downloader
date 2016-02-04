#!/usr/bin/env node
'use strict'

const Downloader = require('../')
const ProgressBar = require('progress')
const minimist = require('minimist')
const fileSize = require('filesize')
const chalk = require('chalk')
const parameters = minimist(process.argv.slice(2))

if (parameters.v) {
  console.log('multi-connection-downloader: version', require('../package.json').version)
} else if (parameters.h || parameters['_'].length < 1 || parameters['_'].length > 2) {
  console.error('Usage:\n\t$ download url [filePath] [--max-connections=4]')
} else {
  const url = parameters['_'][0]
  const filePath = parameters['_'][1] || null
  const maxConnections = parseInt(parameters['max-connections']) || 4
  let downloadInfo = {}

  const download = Downloader.download({
    url: url,
    target: {
      directory: process.cwd(),
      file: filePath
    },
    connections: maxConnections
  })
  download.onDidError(function(error) {
    console.error('Download Error', error.stack || error)
  })
  download.onDidStart(function(info) {
    downloadInfo = info
  })

  let progress = null
  let lastCompleted = 0
  download.onDidProgress(function(info) {
    if (!downloadInfo.filePath) {
      return ;
    }
    if (!progress) {
      progress = new  ProgressBar(`  Downloading [:bar] ${chalk.yellow(':current kb/:total kb')}`, {
        complete: '=',
        incomplete: '_',
        width: 50,
        total: Math.round(info.maximum / 1024)
      })
    }
    info.completed = Math.round(info.completed / 1024)
    progress.tick(info.completed - lastCompleted)
    lastCompleted = info.completed
  })
  download.onDidComplete(function() {
    console.log(`\n  File saved to ${chalk.green(downloadInfo.filePath)} `)
  })
  download.start().catch(e => console.error(e.stack || e))
}
