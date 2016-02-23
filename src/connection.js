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
  url: string;
  worker: PoolWorker;
  headers: Object;
  emitter: Emitter;
  started: boolean;
  fileInfo: {
    size: number
  };
  response: Object;
  supportsResume: boolean;

  constructor(url: string, headers: Object, pool: RangePool) {
    this.url = url
    this.worker = pool.createWorker()
    this.headers = headers
    this.started = false
    this.emitter = new Emitter()
    this.fileInfo = { size: 0 }
    this.supportsResume = true
  }
  async activate(): Promise<Connection> {
    if (this.started) {
      return ;
    }

    this.started = true
    const range = getRange(this.worker)

    this.headers['User-Agent'] = 'sb-downloader for Node.js'
    this.headers['Range'] = range
    this.response = await promisedRequest({
      url: this.url,
      headers: this.headers
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
  }
}
