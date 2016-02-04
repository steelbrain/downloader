'use strict'

/* @flow */

import URL from 'url'
import Path from 'path'
import {Emitter} from 'sb-event-kit'
import {promisedRequest, getRange} from './helpers'
import type {RangePool, PoolWorker} from 'range-pool'
import type {Readable} from 'stream'

export class Connection {
  emitter: Emitter;
  url: string;
  pool: RangePool;
  worker: PoolWorker;
  fileInfo: {
    size: number
  };
  response: Readable;

  constructor(url: string, pool: RangePool) {
    this.url = url
    this.pool = pool
  }
  async activate(): Promise {
    this.fileInfo = { size: 0 }
    this.worker = this.pool.createWorker()
    this.emitter = new Emitter()
    this.response = await promisedRequest({
      url: this.url,
      headers: {
        'User-Agent': 'sb-downloader for Node.js',
        'Range': getRange(this.worker)
      }
    })
    this.fileInfo.size = parseInt(this.response.headers['content-length']) || 0
  }
  start(fd: number) {
    this.response.resume()
  }
  getResponse(): Object {
    return this.response
  }
  getFileSize(): number {
    return this.fileInfo.size
  }
  getFileName(): string {
    const parsed = URL.parse(this.url, true)
    return Path.basename(parsed.pathname || '')
  }
  dispose() {
    this.worker.dispose()
    this.emitter.dispose()
  }
}
