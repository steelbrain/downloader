'use strict'

/* @flow */

import Path from 'path'
import {Emitter, CompositeDisposable} from 'sb-event-kit'
import {RangePool} from 'range-pool'
import {Connection} from './connection'
import {fsOpen} from './helpers'
import type {Disposable} from 'sb-event-kit'
import type {Downloader$Job} from './types'

export class Download {
  options: Downloader$Job;
  subscriptions: CompositeDisposable;
  emitter: Emitter;
  connections: Set<Connection>;
  pool: RangePool;

  constructor(options: Downloader$Job) {
    this.subscriptions = new CompositeDisposable()
    this.emitter = new Emitter()
    this.connections = new Set()
    this.pool = new RangePool(1)
    this.options = options
  }
  async start(): Promise {
    const connection = await this.getConnection(0).activate()
    const fileInfo = {
      path: Path.join(this.options.target.directory, this.options.target.file || connection.getFileName()),
      size: connection.getFileSize()
    }
    const fd = await fsOpen(fileInfo.path, 'w')

    this.pool.limit = fileInfo.size
    connection.worker.limitIndex = fileInfo.size
    this.handleConnection(fd, 0, connection)

    const promises = []
    for (let i = 1; i < this.options.connections; ++i) {
      promises.push(this.handleConnection(fd, i, this.getConnection(i)))
    }

    await Promise.all(promises)

    this.emitter.emit('did-start', {fileSize: fileInfo.path, filePath: fileInfo.path, url: this.options.url})
  }
  onDidError(callback: ((error: Error) => void)): Disposable {
    return this.emitter.on('did-error', callback)
  }
  onDidProgress(callback: Function): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  onDidStart(callback: ((fileSize: number, filePath: string, url: string) => void)): Disposable {
    return this.emitter.on('did-start', callback)
  }
  onDidComplete(callback: Function): Disposable {
    return this.emitter.on('did-complete', callback)
  }
  dispose() {
    this.subscriptions.dispose()
  }
  getConnection(index: number): Connection {
    const connection = new Connection(this.options.url, this.pool)
    this.connections.add(connection)
    return connection
  }
  async handleConnection(fd: number, index: number, connection: Connection, keepRunning: boolean = true): Promise {
    if (!keepRunning || this.pool.hasCompleted()) {
      return ;
    }
    connection.onDidClose(() => {
      keepRunning = keepRunning && (connection.supportsResume ||  index === 0)

      connection.dispose()
      this.handleConnection(fd, index, connection, keepRunning)
    })
    connection.onDidError(e => {
      keepRunning = keepRunning && (connection.supportsResume ||  index === 0)

      this.emitter.emit('did-error', e)
      connection.dispose()
      this.handleConnection(fd, index, connection, keepRunning)
    })
    await connection.activate()
    connection.start(fd)
  }
}
