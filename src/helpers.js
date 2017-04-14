/* @flow */

import invariant from 'assert'
import cloneDeep from 'lodash.clonedeep'
import { RangePool } from 'range-pool'
import type { DownloadConfig } from './types'

/* eslint-disable prefer-const */
export function fillOptions(given: Object): DownloadConfig {
  invariant(given && typeof given === 'object', 'options must be a valid object')

  let { url, output, headers, connections } = cloneDeep(given)

  invariant(url && typeof url === 'string', 'options.url must be a valid string')
  invariant(output && typeof output === 'object', 'options.output must be a valid object')
  invariant(output.directory && typeof output.directory === 'string', 'options.output.directory must be a valid path')
  if (output.file) {
    invariant(typeof output.file === 'string', 'options.output.file must be a valid path')
  } else {
    output.file = null
  }

  if (headers) {
    invariant(typeof headers === 'object', 'options.headers must be an object')
  } else {
    headers = {}
  }
  if (connections) {
    invariant(typeof connections === 'number', 'options.connections must be a number')
  } else {
    connections = 4
  }

  return { url, output, headers, connections }
}
/* eslint-enable prefer-const */

export function getRandomString(): string {
  return Math.random().toString(36).substr(2, 10)
}

export function getLaziestWorker(pool: Object): ?Object {
  let lazyWorker = null
  for (const worker of pool.workers) {
    if (!worker.getStatus()) {
      continue
    }
    if (!lazyWorker || lazyWorker.getRemaining() < worker.getRemaining()) {
      lazyWorker = worker
    }
  }
  return lazyWorker
}

export function getRangePool(length: number, lastChunkId: number): Object {
  const pool = new RangePool(length)
  pool.setMetadata({
    lastChunkId,
  })
  return pool
}
