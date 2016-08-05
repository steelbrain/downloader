/* @flow */

import Path from 'path'
import { Emitter, CompositeDisposable } from 'sb-event-kit'
import RangePool from 'range-pool'
import type { Disposable } from 'sb-event-kit'
import Connection from './connection'
import { open, fillConfig } from './helpers'
import type { DownloadConfig, DownloadJob } from './types'

let downloadCount = 0

export default class Download {
  pool: RangePool;
  emitter: Emitter;
  options: DownloadJob;
  connections: Set<Connection>;
  subscriptions: CompositeDisposable;
  lastPercentage: number;

  constructor(options: DownloadConfig) {
    this.pool = new RangePool(Infinity)
    this.emitter = new Emitter()
    this.options = fillConfig(options)
    this.connections = new Set()
    this.subscriptions = new CompositeDisposable()
    this.lastPercentage = -1
  }
  async start(): Promise<void> {
    const connection = await this.getConnection().activate()
    const filePath = Path.isAbsolute(this.options.output.file || '') ?
      this.options.output.file :
      Path.join(this.options.output.directory, this.options.output.file || connection.getFileName() || 'download-' + (++downloadCount))
    const fileInfo = {
      path: filePath,
      size: connection.getFileSize(),
    }
    const fd = await open(fileInfo.path, 'w')

    this.pool.length = fileInfo.size
    connection.worker.limitIndex = fileInfo.size
    this.handleConnection(fd, 0, connection)

    const promises = []
    for (let i = 1; i < this.options.connections; ++i) {
      promises.push(this.handleConnection(fd, i, this.getConnection(i)))
    }

    await Promise.all(promises)

    this.emitter.emit('did-start', { fileSize: fileInfo.size, filePath: fileInfo.path, url: this.options.url })
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
  getConnection(): Connection {
    const connection = new Connection(this.options.url, this.options.headers, this.pool.getWorker())
    this.connections.add(connection)
    return connection
  }
  async handleConnection(fd: number, index: number, connection: Connection, givenKeepRunning: boolean = true): Promise<void> {
    let keepRunning = givenKeepRunning
    if (!keepRunning || this.pool.hasCompleted() || (this.pool.hasWorkingWorker() && this.pool.getRemaining() < 2 * 1024 * 1024)) {
      connection.dispose()
      return
    }
    connection.onDidClose(() => {
      keepRunning = keepRunning && (connection.supportsResume || index === 0)

      connection.dispose()
      if (!this.pool.hasCompleted()) {
        this.handleConnection(fd, index, this.getConnection(), keepRunning)
      }
    })
    connection.onDidError(e => {
      keepRunning = keepRunning && (connection.supportsResume || index === 0)

      this.emitter.emit('did-error', e)
      connection.dispose()
      if (!this.pool.hasCompleted()) {
        this.handleConnection(fd, index, this.getConnection(), keepRunning)
      }
    })
    connection.onDidProgress(() => {
      const percentage = Math.round((this.pool.getCompletedSteps() / this.pool.length) * 100)
      if (percentage !== this.lastPercentage) {
        this.lastPercentage = percentage
        this.emitter.emit('did-progress', { percentage, completed: this.pool.getCompletedSteps(), maximum: this.pool.length })
        if (percentage === 100) {
          this.emitter.emit('did-complete')
        }
      }
    })
    await connection.activate()
    connection.start(fd)
  }
}
