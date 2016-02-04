'use strict'

/* @flow */

import NativeFS from 'fs'
import request from 'request'
import promisify from 'sb-promisify'

export function promisedRequest(options: Object): Promise{
  return new Promise(function(resolve, reject) {
    const job = request(options)
    job.on('error', reject)
    job.on('response', resolve)
    job.pause()
  })
}

export const FS = {
  open: promisify(NativeFS.open),
  close: promisify(NativeFS.close),
  write: promisify(NativeFS.write)
}
