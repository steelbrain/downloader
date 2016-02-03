'use strict'

/* @flow */

import Path from 'path'
import {CompositeDisposable, Emitter, Disposable} from 'sb-event-kit'
import {RangePool} from 'range-pool'
import {Connection} from './connection'
import {FS} from './helpers'
import type {Downloader$Job} from './types'

export class Download {
  subscriptions: CompositeDisposable;
  emitter: Emitter;
  options: Downloader$Job;
  connections: Set<Connection>;
  fileSize: number;
  multipleAllowed: boolean;
  fd: number;
  rangePool: RangePool;

  constructor(options: Downloader$Job) {
    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()
    this.options = options
    this.connections = new Set()
    this.fileSize = Infinity
    this.multipleAllowed = true
    this.fd = 0
    this.rangePool = new RangePool(Infinity)

    this.subscriptions.add(this.emitter)
  }
  async download(): Promise {
    const connection = await this.spawnConnection()
    this.rangePool.length = connection.getFileSize()
    this.fileSize = connection.getFileSize()
    if (!this.options.target.file) {
      this.options.target.file = connection.getFileName()
    }

    this.fd = await FS.open(Path.join(this.options.target.directory, this.options.target.file), 'w')
    connection.pipe(this.fd)
  }
  getFileSize(): number {
    return this.fileSize
  }
  onError(callback: Function): Disposable {
    return this.emitter.on('error', callback)
  }
  dispose() {
    this.subscriptions.dispose()
    this.connections.forEach(connection => connection.dispose())
  }
  // Private method
  async spawnConnection(): Promise<Connection> {
    const worker = this.rangePool.createWorker()
    const connection = Connection.create(this.options.url, worker)
    connection.onDidClose(_ => {
      worker.dispose()
      this.connections.delete(connection)
      console.log('closed')
    })
    connection.onError(function(error) {
      console.log(error.stack || error)
    })
    this.connections.add(connection)
    await connection.activate()
    return connection
  }
}
