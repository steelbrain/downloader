/* @flow */

import NativeFS from 'fs'
import request from 'request'
import promisify from 'sb-promisify'
import type { PoolWorker } from 'range-pool'

export function promisedRequest(options: Object): Promise<Object> {
  return new Promise(function(resolve, reject) {
    const job = request(options)
    job.on('error', reject)
    job.on('response', resolve)
    job.pause()
  })
}

export function getRange(worker: PoolWorker): ?string {
  let range = null
  if (worker.getCurrentIndex() !== 0) {
    range = worker.getCurrentIndex() + '-'
    if (worker.getIndexLimit() !== Infinity) {
      range += worker.getIndexLimit()
    }
  }
  return range ? 'bytes=' + range : range
}

export const fsOpen = promisify(NativeFS.open)
