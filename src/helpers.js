/* @flow */

import FS from 'fs'
import Path from 'path'
import invariant from 'assert'
import requestVanilla from 'request'
import promisify from 'sb-promisify'
import type { RangeWorker } from 'range-pool'
import type { DownloadConfig, DownloadJob } from './types'

export function fillConfig(config: DownloadConfig): DownloadJob {
  const toReturn = {}
  invariant(typeof config.url === 'string' && config.url, 'config.url must be a string')
  toReturn.url = config.url

  if (typeof config.output === 'object' && config.output) {
    invariant(typeof config.output.directory === 'string' && config.output.directory, 'config.output.directory must be a string')
    if (config.output.file) {
      invariant(typeof config.output.file === 'string', 'config.output.file must be null or a string')
    }
    toReturn.output = {
      file: config.output.file || null,
      directory: config.output.directory,
    }
  } else if (typeof config.output === 'string' && config.output) {
    const filePath = Path.resolve(config.output)
    toReturn.output = {
      file: Path.basename(filePath),
      directory: Path.dirname(filePath),
    }
  } else {
    throw new TypeError('config.output must be valid')
  }

  toReturn.headers = {}
  if (config.headers) {
    invariant(typeof config.headers === 'object', 'config.headers must be an object')
    for (const key in config.headers) {
      if (!{}.hasOwnProperty.call(config.headers, key)) {
        continue
      }
      // $FlowIgnore: Stupid flow, I already did hasOwnProperty check
      const value = config.headers[key]
      if (value) {
        if (typeof value === 'number') {
          toReturn.headers[key] = value.toString()
        } else if (typeof value === 'string') {
          toReturn.headers[key] = value
        } else {
          throw new TypeError(`config.headers has non literal value in '${key}'`)
        }
      }
    }
  }

  if (config.connections) {
    invariant(typeof config.connections === 'number', 'config.connections must be a number')
    toReturn.connections = config.connections
  } else {
    toReturn.connections = 4
  }

  toReturn.range = null
  return toReturn
}

export function request(options: Object): Promise<Object> {
  return new Promise(function(resolve, reject) {
    const job = requestVanilla(options)
    job.on('error', reject)
    job.on('response', resolve)
    job.pause()
  })
}

export function getRangeHeader(worker: RangeWorker): ?string {
  let range = worker.getCurrentIndex() + '-'
  const limit = worker.getLimitIndex()
  if (limit !== Infinity) {
    range += limit
  }
  return `bytes=${range}`
}

export const open = promisify(FS.open)
