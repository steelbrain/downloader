/* @flow */

import FS from 'sb-fs'
import { createUnzip } from 'zlib'
import { CompositeDisposable, Emitter } from 'sb-event-kit'
import type { Disposable } from 'sb-event-kit'

import * as Helpers from './helpers'
import type { DownloadConfig } from '../types'

export default class Connection {
  worker: Object;
  emitter: Emitter;
  options: DownloadConfig;
  filePath: string;
  fileSize: number;
  complete: boolean;
  fileName: ?string;
  visitedUrls: Array<string>;
  subscriptions: CompositeDisposable;
  supportsResume: boolean;
  contentEncoding: ?string;
  constructor(worker: Object, options: DownloadConfig, filePath: string) {
    this.worker = worker
    this.emitter = new Emitter()
    this.options = options
    this.filePath = filePath
    this.fileSize = Infinity
    this.complete = false
    this.visitedUrls = []
    this.subscriptions = new CompositeDisposable()
    this.supportsResume = false
    this.contentEncoding = null

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise<void> {
    const headers: Object = {
      'User-Agent': 'sb-downloader for Node.js',
      'Accept-Encoding': 'gzip, deflate',
    }
    if (this.worker.getCurrentIndex() > 0) {
      headers.Range = `bytes=${this.worker.getCurrentIndex()}-${this.worker.getLimitIndex()}`
    }
    const { request, response, visitedUrls } = await Helpers.openConnection(this.options.url, {
      headers: Object.assign({}, this.options.headers, headers),
    })
    if (response.statusCode > 299 && response.statusCode < 200) {
      // Non 2xx status code
      throw new Error(`Received non-success http code '${response.statusCode}'`)
    }
    this.visitedUrls = visitedUrls
    this.fileSize = Helpers.getFileSize(response.headers)
    this.supportsResume = {}.hasOwnProperty.call(response.headers, 'accept-ranges') || {}.hasOwnProperty.call(response.headers, 'content-range')
    if ({}.hasOwnProperty.call(response.headers, 'content-encoding')) {
      this.contentEncoding = response.headers['content-encoding']
    }
    this.fileName = Helpers.guessFileName(this.visitedUrls.slice(), response.headers)

    let chain = request.pipe(Helpers.getTransform(this, request))
    if (this.contentEncoding === 'deflate' || this.contentEncoding === 'gzip') {
      chain = chain.pipe(createUnzip())
    }
    chain.on('data', () => {
      this.emitter.emit('did-progress')
    })
    chain = chain.pipe(FS.createWriteStream(this.filePath, {
      flags: this.worker.startIndex === this.worker.currentIndex ? 'w+' : 'a',
    }))
    chain.on('close', async () => {
      this.complete = true
      this.emitter.emit('did-complete')
    }).on('error', (error) => {
      console.log('error', error)
      this.emitter.emit('did-error', error)
    })
    this.emitter.emit('did-connect')
    this.subscriptions.add(function() {
      response.destroy()
    })
    response.resume()
  }
  onDidError(callback: ((error: Error) => any)): Disposable {
    return this.emitter.on('did-error', callback)
  }
  onDidConnect(callback: (() => any)): Disposable {
    return this.emitter.on('did-connect', callback)
  }
  onDidProgress(callback: (() => any)): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  onDidComplete(callback: (() => any)): Disposable {
    return this.emitter.on('did-complete', callback)
  }
  dispose() {
    this.subscriptions.dispose()
  }
}
