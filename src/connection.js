'use strict'

/* @flow */

import FS from 'fs'
import URL from 'url'
import Path from 'path'
import ZLIB from 'zlib'
import {Emitter} from 'sb-event-kit'
import promisify from 'sb-promisify'
import {promisedRequest, getRange} from './helpers'
import type {Disposable} from 'sb-event-kit'
import type {RangePool, PoolWorker} from 'range-pool'

const deflate = promisify(ZLIB.deflate)
const unzip = promisify(ZLIB.unzip)

export class Connection {
  url: string;
  pool: RangePool;
  worker: PoolWorker;
  headers: Object;
  emitter: Emitter;
  started: boolean;
  encoding: 'gzip' | 'deflate' | 'none';
  fileInfo: {
    size: number
  };
  response: Object;
  supportsResume: boolean;

  constructor(url: string, headers: Object, pool: RangePool) {
    this.url = url
    this.pool = pool
    this.headers = headers
    this.started = false
    this.emitter = new Emitter()
    this.encoding = 'none'
    this.fileInfo = { size: 0 }
    this.supportsResume = true
  }
  async activate(): Promise<Connection> {
    if (this.started) {
      return ;
    }

    this.worker = this.pool.createWorker()
    this.started = true
    const range = getRange(this.worker)

    this.headers['User-Agent'] = 'sb-downloader for Node.js'
    this.headers['Range'] = range
    this.headers['Accept-Encoding'] = 'gzip, deflate'
    this.response = await promisedRequest({
      url: this.url,
      headers: this.headers
    })
    this.fileInfo.size = parseInt(this.response.headers['content-length']) || 0
    this.supportsResume = range === null || this.response.statusCode === 206
    const encoding = (this.response.headers['content-encoding'] || '').toLowerCase()
    if (encoding == 'deflate' || encoding === 'gzip') {
      this.encoding = encoding
    }
    return this
  }
  start(fd: number) {
    const _this = this
    this.response.on('data', async function(chunkRaw) {
      const remaining = _this.worker.getRemaining()
      const shouldClose = remaining <= chunkRaw.length
      let chunkLength = chunkRaw.length
      if (chunkLength > remaining) {
        chunkRaw = chunkRaw.slice(0, remaining)
        chunkLength = chunkRaw.length
      }
      let chunk = chunkRaw
      if (_this.encoding === 'deflate') {
        chunk = await deflate(chunk)
      } else if (_this.encoding === 'gzip') {
        chunk = await unzip(chunk)
      }

      FS.write(fd, chunk, 0, chunk.length, _this.worker.getCurrentIndex(), function(error) {
        if (error) {
          _this.emitter.emit('did-error', error)
        }
      })
      _this.worker.advance(chunkLength)
      _this.emitter.emit('did-progress', _this.worker.getCompletionPercentage())
      if (shouldClose) {
        _this.emitter.emit('did-close')
        _this.dispose()
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
    if (this.worker) {
      this.worker.dispose()
    }
    if (this.response) {
      this.response.destroy()
    }
    this.started = false
  }
}
