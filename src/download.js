/* @flow */

import Path from 'path'
import { Emitter, CompositeDisposable, Disposable } from 'sb-event-kit'
import RangePool from 'range-pool'
import Manifest from './manifest'
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
    const connection = this.getConnection()
    const fileInfo = await connection.request()
    const filePath = this.options.output.file && Path.isAbsolute(this.options.output.file) ?
      this.options.output.file :
      Path.resolve(this.options.output.directory, this.options.output.file || fileInfo.fileName || 'download-' + (++downloadCount))

    let connections = 1
    const fdPromise = open(filePath, 'w')

    if (fileInfo.supportsResume && Number.isFinite(fileInfo.fileSize)) {
      // Clear previous connection
      this.connections.delete(connection)
      connection.dispose()

      const fd = await fdPromise
      const manifest = await Manifest.create(this.options.url, filePath, fileInfo.fileSize)
      const promises = []

      this.pool = manifest.data.pool
      for (let i = 0; i < this.options.connections; ++i) {
        const entry = this.getConnection()
        entry.attach(fd)
        promises.push(entry.request())
        connections++
      }

      await Promise.all(promises)
      this.onDidComplete(async function() {
        await manifest.unlink()
      })
      const updateInterval = setInterval(function() {
        manifest.write()
      }, 5000)
      this.subscriptions.add(new Disposable(function() {
        clearInterval(updateInterval)
      }))
    } else {
      this.pool.length = fileInfo.fileName
      connection.worker.limitIndex = fileInfo.fileSize
      connection.attach(await fdPromise)
    }

    this.emitter.emit('did-start', { fileSize: fileInfo.fileSize, filePath, url: this.options.url, connections })
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
    this.connections.forEach(connection => {
      connection.dispose()
    })
    this.subscriptions.dispose()
  }
  getConnection(): Connection {
    let errorCount = 0

    const connection = new Connection(this.options.url, this.options.headers, this.pool.getWorker())
    const onError = error => {
      errorCount++
      this.emitter.emit('did-error', error)
      if (errorCount >= 20) {
        // Abort entire download after 20 errors
        this.dispose()
      }
      if (!connection.worker.hasCompleted()) {
        connection.request().catch(onError)
      }
    }
    connection.onDidError(onError)
    connection.onDidProgress(() => {
      this.emitter.emit('did-progress', this.pool.getCompletionPercentage())
    })
    connection.onDidFinish(() => {
      if (this.pool.hasCompleted()) {
        this.emitter.emit('did-complete')
      } else if (!this.pool.hasAliveWorker() || this.pool.getRemaining() < 1024) {
        this.getConnection().attach(connection.fd)
      }
    })
    this.connections.add(connection)
    return connection
  }
}
