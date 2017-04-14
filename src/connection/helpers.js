/* @flow */

import got from 'got'
import { Transform } from 'stream'
import { posix as Path } from 'path'
import type Connection from './'

export function openConnection(url: string, options: Object): Promise<Object> {
  return new Promise(function(resolve, reject) {
    const request = got.stream(url, options)
    const visitedUrls = [url]
    request.on('error', reject)
    request.on('redirect', function(response) {
      visitedUrls.push(response.headers.location)
    })
    request.on('response', function(response) {
      resolve({ request, response, visitedUrls })
    })
    request.pause()
  })
}

export function getFileSize(headers: Object): number {
  let fileSize = Infinity
  if ({}.hasOwnProperty.call(headers, 'content-length')) {
    fileSize = parseInt(headers['content-length'], 10) || fileSize
  } else if ({}.hasOwnProperty.call(headers, 'content-range')) {
    const range = headers['content-range']
    const index = range.indexOf('/')
    if (range.substr(0, 5) === 'bytes' && index !== -1) {
      fileSize = parseInt(range.substr(index + 1), 10) || fileSize
    }
  }
  return fileSize
}

const FILENAME_HEADER_REGEX = /filename=("([^"; ]+)"|([^; ]+))/
export function guessFileName(visitedUrls: Array<string>, headers: Object): ?string {
  if ({}.hasOwnProperty.call(headers, 'content-disposition')) {
    const matches = FILENAME_HEADER_REGEX.exec(headers['content-disposition'])
    if (matches) {
      return matches[2] || matches[3]
    }
  }
  while (visitedUrls.length) {
    const entry = visitedUrls.pop()
    const baseName = Path.basename(entry.split('?')[0])
    if (Path.extname(baseName)) {
      return baseName
    }
  }
  return null
}

export function getTransform(connection: Connection): Object {
  const transform = new Transform()
  // $FlowIgnore: Some type merge issues with flow
  transform._transform = (givenChunk, encoding, callback) => { // eslint-disable-line no-underscore-dangle
    if (connection.subscriptions.disposed) {
      callback(null, null)
      return
    }
    const remaining = connection.worker.getRemaining()
    let chunk = givenChunk
    if (chunk.length > remaining) {
      chunk = chunk.slice(0, remaining)
    }
    if (chunk.length) {
      connection.worker.advance(chunk.length)
    }
    callback(null, chunk)
  }
  return transform
}
