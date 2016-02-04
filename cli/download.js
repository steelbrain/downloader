#!/usr/bin/env node
// 'use strict'

const Downloader = require('../')
const minimist = require('minimist')
const fileSize = require('filesize')
const parameters = minimist(process.argv.slice(2))

if (parameters.v) {
  console.log('multi-connection-downloader: version', require('../package.json').version)
} else if (parameters.h || parameters['_'].length < 1 || parameters['_'].length > 2) {
  console.error('Usage:\n\t$ download url [filePath] [--max-connections=4]')
} else {
  const url = parameters['_'][0]
  const filePath = parameters['_'][1] || null
  const maxConnections = parseInt(parameters['max-connections']) || 4

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
    console.log('Download started:', info.url, 'to', info.filePath, '(' + fileSize(info.fileSize) + ')')
  })
  download.onDidComplete(function() {
    console.log('Download completed!')
  })
  download.start().catch(e => console.error(e.stack || e))
}
