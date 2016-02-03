'use strict'

/* @flow */

import URL from 'url'
import Path from 'path'
import FS from 'fs'
import {CompositeDisposable, Emitter, Disposable} from 'sb-event-kit'
import {promisedRequest, DOWNLOAD_STATUS} from './helpers'

export class Connection {
  subscriptions: CompositeDisposable;
  emitter: Emitter;
  url: string;
  startOffset: number;
  currentOffset: number;
  limitOffset: number;
  fileSize: number;
  response: Object;

  constructor(url: string, startOffset: number, limitOffset: number) {
    this.url = url
    this.startOffset = startOffset
    this.currentOffset = startOffset
    this.limitOffset = limitOffset
    this.fileSize = 0;

    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise {
    let range = null
    if (this.startOffset !== 0) {
      range = this.startOffset + '-'
      if (this.limitOffset !== Infinity) {
        range += this.limitOffset
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
    this.response.on('close', () => this.emitter.emit('did-close'))

    this.fileSize = parseInt(this.response.headers['content-length']) || 0

    return {
      status: this.response.statusCode === 206 ? DOWNLOAD_STATUS.RESUMED : DOWNLOAD_STATUS.STARTED
    }
  }
  pipe(fd: number) {
    this.response.on('data', chunk => {
      FS.write(fd, chunk.toString(), this.currentOffset, 'utf8', error => {
        if (error) {
          this.emitter.emit('error', error)
        }
      })
      this.currentOffset += chunk.length
    })
  }
  onError(callback: Function): Disposable {
    return this.emitter.on('error', callback)
  }
  onDidClose(callback: Function): Disposable {
    return this.emitter.on('did-close', callback)
  }
  onDidGetResponse(callback: Function): Disposable {
    return this.emitter.on('did-get-response', callback)
  }
  getFileSize(): number {
    return this.fileSize
  }
  getFileName(): string {
    const parsed = URL.parse(this.url, true)
    return Path.basename(parsed.pathname || '')
  }
  dispose() {
    this.subscriptions.dispose()
  }
  static create(url: string, startOffset: number = 0, limitOffset: number = Infinity) {
    return new Connection(url, startOffset, limitOffset)
  }
}
