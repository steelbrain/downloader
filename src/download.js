'use strict'

/* @flow */

import Path from 'path'
import {CompositeDisposable, Emitter, Disposable} from 'sb-event-kit'
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

  constructor(options: Downloader$Job) {
    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()
    this.options = options
    this.connections = new Set()
    this.fileSize = Infinity
    this.multipleAllowed = true
    this.fd = 0

    this.subscriptions.add(this.emitter)
  }
  async download(): Promise {
    const connection = await this.spawnConnection()
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
  async spawnConnection(startOffset: number = 0, limitOffset: number = Infinity): Promise<Connection> {
    const connection = Connection.create(this.options.url, startOffset, limitOffset)
    connection.onDidClose(_ => {
      // TODO: Mark this buffer range as advanced
      this.connections.delete(connection)
      console.log('close')
    })
    connection.onError(function(error) {
      console.log(error.stack || error)
    })
    this.connections.add(connection)
    await connection.activate()
    return connection
  }
}
