'use strict'

/* @flow */

import URL from 'url'
import Path from 'path'
import FS from 'fs'
import request from 'request'
import {promisedRequest} from './helpers'
import {CompositeDisposable, Emitter, Disposable} from 'sb-event-kit'
import type {PoolWorker} from 'range-pool'

export class Connection {
  subscriptions: CompositeDisposable;
  emitter: Emitter;
  url: string;
  fileSize: number;
  response: Object;
  worker: PoolWorker;

  constructor(url: string, worker: PoolWorker) {
    this.url = url
    this.worker = worker
    this.fileSize = 0

    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise {
    let range = null
    if (this.worker.getCurrentIndex() !== 0) {
      range = this.worker.getCurrentIndex() + '-'
      if (this.worker.getIndexLimit() !== Infinity) {
        range += this.worker.getIndexLimit()
      }
    }

    this.response = await promisedRequest({
      url: this.url,
      headers: {
        'User-Agent': 'sb-downloader for Node.js',
        'Range': range === null ? null : 'bytes=' + range
      }
    })

    this.response.on('error', e => this.emitter.emit('error', e))
    this.response.on('close', () => this.dispose())

    this.fileSize = parseInt(this.response.headers['content-length']) || 0
    return range === null || this.response.statusCode === 206
  }
  pipe(fd: number) {
    this.response.on('data', chunk => {
      const chunkLength = chunk.length
      const remaining = this.worker.getRemaining()
      const shouldClose = remaining <= chunkLength

      if (chunkLength > remaining) {
        chunk = chunk.slice(0, remaining)
      }

      FS.write(fd, chunk, 0, chunk.length, this.worker.getCurrentIndex(), error => {
        if (error) {
          this.emitter.emit('error', error)
        }
      })
      this.worker.advance(chunk.length)
      if (shouldClose) {
        this.dispose()
      }
    })
    this.response.resume()
  }
  onError(callback: Function): Disposable {
    return this.emitter.on('error', callback)
  }
  onDidClose(callback: Function): Disposable {
    return this.emitter.on('did-close', callback)
  }
  getFileSize(): number {
    return this.fileSize
  }
  getFileName(): string {
    const parsed = URL.parse(this.url, true)
    return Path.basename(parsed.pathname || '')
  }
  dispose() {
    this.emitter.emit('did-close')
    this.subscriptions.dispose()
    if (this.response) {
      this.response.destroy()
    }
  }
  static create(url: string, worker: PoolWorker) {
    return new Connection(url, worker)
  }
}
