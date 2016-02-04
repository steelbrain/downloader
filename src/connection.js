'use strict'

/* @flow */

import FS from 'fs'
import URL from 'url'
import Path from 'path'
import {Emitter} from 'sb-event-kit'
import {promisedRequest, getRange} from './helpers'
import type {Disposable} from 'sb-event-kit'
import type {RangePool, PoolWorker} from 'range-pool'

export class Connection {
  emitter: Emitter;
  url: string;
  pool: RangePool;
  worker: PoolWorker;
  fileInfo: {
    size: number
  };
  response: Object;
  started: boolean;
  supportsResume: boolean;

  constructor(url: string, pool: RangePool) {
    this.emitter = new Emitter()
    this.url = url
    this.pool = pool
    this.started = false
    this.supportsResume = true
  }
  async activate(): Promise<Connection> {
    if (this.started) {
      return ;
    }

    this.started = true
    this.fileInfo = { size: 0 }
    this.worker = this.pool.createWorker()
    const range = getRange(this.worker)

    this.response = await promisedRequest({
      url: this.url,
      headers: {
        'User-Agent': 'sb-downloader for Node.js',
        'Range': range
      }
    })
    this.fileInfo.size = parseInt(this.response.headers['content-length']) || 0
    this.supportsResume = range === null || this.response.statusCode === 206
    return this
  }
  start(fd: number) {
    this.response.on('data', chunk => {
      const chunkLength = chunk.length
      const remaining = this.worker.getRemaining()
      const shouldClose = remaining <= chunkLength

      if (chunkLength > remaining) {
        chunk = chunk.slice(0, remaining)
      }

      FS.write(fd, chunk, 0, chunk.length, this.worker.getCurrentIndex(), error => {
        if (error) {
          this.emitter.emit('did-error', error)
        }
      })
      this.worker.advance(chunk.length)
      this.emitter.emit('did-progress', this.worker.getCompletionPercentage())
      if (shouldClose) {
        this.emitter.emit('did-close')
        this.dispose()
      }
    })
    this.response.resume()
  }
  getFileSize(): number {
    return this.fileInfo.size
  }
  getFileName(): string {
    const parsed = URL.parse(this.url, true)
    return Path.basename(parsed.pathname || '')
  }
  onDidClose(callback: Function): Disposable {
    return this.emitter.on('did-close', callback)
  }
  onDidProgress(callback: Function): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  onDidError(callback: Function): Disposable {
    return this.emitter.on('did-error', callback)
  }
  dispose() {
    this.emitter.dispose()
    this.worker.dispose()
    if (this.response) {
      this.response.destroy()
    }
    this.started = false
    this.pool = null
    this.response = null
  }
}
