/* @flow */

import FS from 'sb-fs'
import Path from 'path'
import invariant from 'assert'
import ConfigFile from 'sb-config-file'
import { RangePool } from 'range-pool'
import { CompositeDisposable, Emitter } from 'sb-event-kit'
import type { Disposable } from 'sb-event-kit'

import Connection from './connection'
import * as Helpers from './helpers'
import type { DownloadConfig } from './types'

class Download {
  pool: RangePool;
  emitter: Emitter;
  options: DownloadConfig;
  filePath: string;
  configFile: ConfigFile;
  connections: Set<Connection>
  subscriptions: CompositeDisposable;
  constructor(options: DownloadConfig) {
    this.pool = Helpers.getRangePool(Infinity, 0)
    this.emitter = new Emitter()
    this.filePath = ''
    this.options = Helpers.fillOptions(options)
    this.configFile = null
    this.connections = new Set()
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise<void> {
    const filenameIsTemporary = !this.options.output.file
    this.filePath = this.options.output.file ? this.options.output.file : Path.join(this.options.output.directory, `download-${Helpers.getRandomString()}`)

    const firstConnection = this.getConnection()
    invariant(firstConnection)
    try {
      await firstConnection.activate()
    } catch (error) {
      setImmediate(() => this.dispose())
      throw error
    }

    this.onDidComplete(async () => {
      const filePath = this.filePath
      // Sort for pop so first id is at the end of array
      const files = Array.from(this.pool.workers).sort(function(a, b) {
        return b.startIndex - a.startIndex
      }).map(worker => `${filePath}.part-${worker.getMetadata().id}`)
      async function mergeNextFile() {
        const entry = files.pop()
        if (!entry) {
          return
        }
        await new Promise(function(resolve, reject) {
          FS.createReadStream(entry)
            .pipe(FS.createWriteStream(filePath, { flags: 'a' }))
            .on('error', reject)
            .on('close', resolve)
        })
        await FS.unlink(entry)
        await mergeNextFile()
      }
      if (!await FS.exists(filePath) || await FS.exists(files[0])) {
        await FS.unlink(filePath)
        await mergeNextFile()
      }
      if (await FS.exists(`${filePath}.manifest`)) {
        await FS.unlink(`${filePath}.manifest`)
      }
    })

    if (filenameIsTemporary && firstConnection.fileName) {
      this.filePath = Path.resolve(this.options.output.directory, firstConnection.fileName)
    }

    if (!firstConnection.supportsResume) {
      if (Number.isFinite(firstConnection.fileSize)) {
        this.pool.length = firstConnection.fileSize
        firstConnection.worker.limitIndex = firstConnection.fileSize
      }
      return
    }

    this.connections.delete(firstConnection)
    firstConnection.dispose()
    await FS.unlink(firstConnection.filePath)
    const configFile = await ConfigFile.get(`${this.filePath}.manifest`, { serialized: Helpers.getRangePool(firstConnection.fileSize, 1).serialize() })
    this.configFile = configFile
    this.pool = RangePool.unserialize(await configFile.get('serialized'))
    if (this.pool.hasCompleted()) {
      setImmediate(() => {
        this.emitter.emit('did-complete')
      })
      return
    }

    const promises = []
    for (let i = 0; i < this.options.connections; i++) {
      const connection = this.getConnection()
      if (connection) {
        promises.push(connection.activate())
      }
    }
    try {
      await Promise.all(promises)
    } catch (error) {
      setImmediate(() => this.dispose())
      throw error
    }
  }
  getConnection(): ?Connection {
    if (this.pool.hasCompleted()) {
      return null
    }
    const laziestWorker = Helpers.getLaziestWorker(this.pool)
    if (laziestWorker && laziestWorker.getRemaining() < (1024 * 1024 * 2)) {
      return null
    }

    const poolWorker = this.pool.getWorker()
    const poolMetadata = this.pool.getMetadata()
    const workerMetadata = poolWorker.getMetadata()

    if (typeof workerMetadata.id === 'undefined') {
      const poolWorkerId = ++poolMetadata.lastChunkId
      workerMetadata.id = poolWorkerId
      poolWorker.setMetadata(workerMetadata)
      this.pool.setMetadata(poolMetadata)
    }

    const connection = new Connection(poolWorker, this.options, `${this.filePath}.part-${workerMetadata.id}`)
    const errorCallback = (error) => {
      this.emitter.emit('did-error', error)
      if (!connection.worker.hasCompleted()) {
        connection.activate().catch(errorCallback)
      }
    }
    connection.onDidError(errorCallback)
    connection.onDidProgress(() => {
      this.emitter.emit('did-progress', this.pool.getCompletionPercentage())
    })
    connection.onDidConnect(() => {
      this.emitter.emit('did-establish-connection', connection)
    })
    connection.onDidComplete(async () => {
      const completed = Array.from(this.connections).every(i => i.complete)
      if (this.pool.length === Infinity || completed) {
        try {
          await this.emitter.emit('did-complete')
        } catch (error) {
          this.emitter.emit('did-error', error)
        }
        this.dispose()
        return
      }
      const newConnection = this.getConnection(this.filePath)
      if (newConnection) {
        newConnection.activate().catch(errorCallback)
      }
    })
    this.connections.add(connection)

    return connection
  }
  onDidError(callback: ((error: Error) => any)): Disposable {
    return this.emitter.on('did-error', callback)
  }
  onDidProgress(callback: ((percentage: number) => any)): Disposable {
    return this.emitter.on('did-progress', callback)
  }
  onDidEstablishConnection(callback: ((connection: Connection) => any)): Disposable {
    return this.emitter.on('did-establish-connection', callback)
  }
  onDidComplete(callback: (() => any)): Disposable {
    return this.emitter.on('did-complete', callback)
  }
  dispose() {
    this.connections.forEach(c => c.dispose())
    if (this.configFile && !this.pool.hasCompleted()) {
      this.configFile.setSync('serialized', this.pool.serialize())
    }
    this.subscriptions.dispose()
  }
}

function download(config: DownloadConfig): Download {
  return new Download(config)
}

export { Download, download }
export default download
