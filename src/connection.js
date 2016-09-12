/* @flow */

import FS from 'fs'
import Path from 'path'
import ZLIB from 'zlib'
import promisify from 'sb-promisify'
import { CompositeDisposable, Emitter } from 'sb-event-kit'
import type { Disposable } from 'sb-event-kit'
import type { RangeWorker } from 'range-pool'
import { request, getRangeHeader } from './helpers'

const unzip = promisify(ZLIB.unzip)
const deflate = promisify(ZLIB.deflate)
const FILENAME_HEADER_REGEX = /filename=("([\S ]+)"|([\S]+))/

export default class Connection {
  fd: Promise<number>;
  url: string;
  worker: RangeWorker;
  attach: ((fd: number | Promise<number>) => void);
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
  async request(): Promise<{ fileSize: number, fileName: ?string, supportsResume: boolean, contentEncoding: 'none' | 'deflate' | 'gzip' }> {
    if (this.socket) {
      this.socket.destroy()
    }

    const { response, job } = await request(this.url, {
      headers: Object.assign({}, this.headers, {
        'User-Agent': 'sb-downloader for Node.js',
        'Accept-Encoding': 'gzip, deflate',
        Range: getRangeHeader(this.worker),
      }),
    })
    this.socket = response
    if (response.statusCode > 299 && response.statusCode < 200) {
      // Non 2xx status code
      throw new Error(`Received non-success http code '${response.statusCode}'`)
    }

    let fileSize = Infinity
    if ({}.hasOwnProperty.call(response.headers, 'content-length')) {
      fileSize = parseInt(response.headers['content-length'], 10) || fileSize
    } else if ({}.hasOwnProperty.call(response.headers, 'content-range')) {
      const range = response.headers['content-range']
      const index = range.indexOf('/')
      if (range.substr(0, 5) === 'bytes' && index !== -1) {
        fileSize = parseInt(range.substr(index + 1), 10) || fileSize
      }
    }
    const supportsResume = (response.headers['accept-ranges'] || '').toLowerCase().indexOf('bytes') !== -1 || {}.hasOwnProperty.call(response.headers, 'content-range')
    const contentEncoding = (response.headers['content-encoding'] || '').toLowerCase()
    let fileName = null
    if ({}.hasOwnProperty.call(response.headers, 'content-disposition') && FILENAME_HEADER_REGEX.test(response.headers['content-disposition'])) {
      const matches = FILENAME_HEADER_REGEX.exec(response.headers['content-disposition'])
      fileName = matches[2] || matches[3]
    } else {
      const baseName = Path.basename(response.req.path.split('?')[0])
      if (Path.extname(baseName)) {
        fileName = baseName
      }
    }

    this.fd.then(fd => {
      const that = this
      job.on('data', async givenChunk => {
        let chunk = givenChunk
        const remaining = this.worker.getRemaining()
        if (chunk.length > remaining) {
          chunk = chunk.slice(0, remaining)
        }
        const chunkLength = chunk.length
        try {
          // NOTE: Writing these here instead of piping streams so we get correct chunkLength
          if (contentEncoding === 'deflate') {
            chunk = await deflate(chunk)
          } else if (contentEncoding === 'gzip') {
            chunk = await unzip(chunk)
          }
        } catch (error) {
          this.emitter.emit('did-error', error)
          this.dispose()
        }
        FS.write(fd, chunk, 0, chunk.length, this.worker.getCurrentIndex(), function(error) {
          if (error) {
            that.emitter.emit('did-error', error)
          }
        })
        this.worker.advance(chunkLength)
        this.emitter.emit('did-progress', this.worker.getCompletionPercentage())
        if (remaining <= chunkLength) {
          this.emitter.emit('did-finish')
          this.dispose()
        }
      })
      job.resume()
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
  onDidProgress(callback: (() => any)): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  dispose() {
    if (this.socket) {
      this.socket.destroy()
    }
    this.worker.dispose()
    this.subscriptions.dispose()
  }
}
