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
  configFile: ConfigFile;
  connections: Set<Connection>
  subscriptions: CompositeDisposable;
  constructor(options: DownloadConfig) {
    this.pool = Helpers.getRangePool(Infinity, 0)
    this.emitter = new Emitter()
    this.options = Helpers.fillOptions(options)
    this.configFile = null
    this.connections = new Set()
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
  }
  async activate(): Promise<void> {
    const filenameIsTemporary = !this.options.output.file
    let filename = filenameIsTemporary ? Path.join(this.options.output.directory, `download-${Helpers.getRandomString()}`) : this.options.output.file
    invariant(filename)

    const firstConnection = this.getConnection(filename)
    invariant(firstConnection)
    try {
      await firstConnection.activate()
    } catch (error) {
      setImmediate(() => this.dispose())
      throw error
    }

    this.onDidComplete(() => {
      // Sort for pop so first id is at the end of array
      const files = Array.from(this.connections).sort(function(a, b) {
        return b.worker.getMetadata().id - a.worker.getMetadata().id
      }).map(entry => entry.filePath)
      async function mergeNextFile() {
        const entry = files.pop()
        if (!entry) {
          return
        }
        await new Promise(function(resolve, reject) {
          FS.createReadStream(entry)
            .pipe(FS.createWriteStream(filename, { flags: 'a' }))
            .on('error', reject)
            .on('close', resolve)
        })
        await FS.unlink(entry)
        await mergeNextFile()
      }
      mergeNextFile()
        .then(() => this.configFile && FS.unlink(this.configFile.filePath))
        .catch(e => this.emitter.emit('did-error', e))
    })

    if (filenameIsTemporary && firstConnection.fileName) {
      filename = Path.resolve(this.options.output.directory, firstConnection.fileName)
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
    const configFile = await ConfigFile.get(`${filename}.manifest`, { serialized: Helpers.getRangePool(firstConnection.fileSize, 1).serialize() })
    this.configFile = configFile
    this.pool = RangePool.unserialize(await configFile.get('serialized'))

    const promises = []
    for (let i = 0; i < this.options.connections; i++) {
      const connection = this.getConnection(filename)
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
  getConnection(filePath: string): ?Connection {
    if (this.pool.hasCompleted()) {
      return null
    }
    const laziestWorker = Helpers.getLaziestWorker(this.pool)
    if (laziestWorker && laziestWorker.getRemaining() < (1024 * 1024 * 2)) {
      return null
    }

    const poolWorker = this.pool.getWorker()
    const poolMetadata = this.pool.getMetadata()
    const poolWorkerId = ++poolMetadata.lastChunkId

    poolWorker.setMetadata({ id: poolWorkerId })
    this.pool.setMetadata(poolMetadata)

    const connection = new Connection(poolWorker, this.options, `${filePath}.part-${poolWorkerId}`)
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
    connection.onDidComplete(() => {
      const completed = Array.from(this.connections).every(i => i.complete)
      if (this.pool.length === Infinity || completed) {
        this.emitter.emit('did-complete')
        this.dispose()
        return
      }
      const newConnection = this.getConnection(filePath)
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
    if (this.configFile) {
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
