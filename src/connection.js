/* @flow */

import FS from 'fs'
import Path from 'path'
import zlib from 'zlib'
import { CompositeDisposable, Emitter } from 'sb-event-kit'
import type { Disposable } from 'sb-event-kit'
import type { RangeWorker } from 'range-pool'
import { request, getRangeHeader } from './helpers'

const FILENAME_HEADER_REGEX = /filename=("([\S ]+)"|([\S]+))/

export default class Connection {
  fd: Promise<number>;
  url: string;
  worker: RangeWorker;
  attach: ((fd: number) => void);
  socket: ?Object;
  emitter: Emitter;
  headers: Object;
  subscriptions: CompositeDisposable;

  constructor(url: string, headers: Object, worker: RangeWorker) {
    this.fd = new Promise(resolve => {
      this.attach = resolve
    })
    this.url = url
    this.worker = worker
    this.socket = null
    this.emitter = new Emitter()
    this.headers = headers
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
  }
  async request(): Promise<{ fileSize: number, fileName: string, supportsResume: boolean, contentEncoding: 'none' | 'deflate' | 'gzip' }> {
    if (this.socket) {
      this.socket.close()
    }

    const response = this.socket = await request({
      url: this.url,
      headers: Object.assign({}, this.headers, {
        'User-Agent': 'sb-downloader for Node.js',
        Range: getRangeHeader(this.worker),
        'Accept-Encoding': 'gzip, deflate',
      }),
    })
    if (response.statusCode > 299 && response.statusCode < 200) {
      // Non 2xx status code
      throw new Error(`Received non-success http code '${response.statusCode}'`)
    }

    let stream = response
    const fileSize = parseInt(response.headers['content-length'], 10) || 0
    const supportsResume = (response.headers['accept-ranges'] || '').toLowercase().indexOf('bytes') !== -1
    const contentEncoding = (response.headers['content-encoding'] || '').toLowerCase()
    const fileName = {}.hasOwnProperty.call(response.headers, 'content-disposition') && FILENAME_HEADER_REGEX.test(response.headers['content-disposition']) ?
      FILENAME_HEADER_REGEX.exec(response.headers['content-disposition'])[2] :
      Path.basename(response.req.path.split('?')[0])

    if (contentEncoding === 'deflate') {
      stream = stream.pipe(zlib.createInflate())
    } else if (contentEncoding === 'gzip') {
      stream = stream.pipe(zlib.createUnzip())
    }

    this.fd.then(fd => {
      let lastPercentage = -1
      stream.on('data', givenChunk => {
        let chunk = givenChunk
        const remaining = this.worker.getRemaining()
        if (remaining > chunk.length) {
          chunk = chunk.slice(0, remaining)
        }

        FS.write(fd, chunk, 0, chunk.length, this.worker.getCurrentIndex(), function(error) {
          this.emitter.emit('did-error', error)
        })
        this.worker.advance(chunk.length)
        const newPercentage = this.worker.getCompletionPercentage()
        if (newPercentage !== lastPercentage) {
          lastPercentage = newPercentage
          this.emitter.emit('did-progress', newPercentage)
        }
        if (remaining <= chunk.length) {
          this.emitter.emit('did-finish')
          this.dispose()
        }
      })
      stream.resume()
    })

    return {
      fileSize,
      fileName,
      supportsResume,
      contentEncoding,
    }
  }
  onDidError(callback: ((error: Error) => any)): Disposable {
    return this.emitter.on('did-error', callback)
  }
  onDidFinish(callback: (() => any)): Disposable {
    return this.emitter.on('did-finish', callback)
  }
  dispose() {
    if (this.socket) {
      this.socket.close()
    }
    this.worker.dispose()
    this.subscriptions.dispose()
  }
}
