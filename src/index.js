/* @flow */

import Path from 'path'
import invariant from 'assert'
import { RangePool } from 'range-pool'
import { CompositeDisposable, Emitter } from 'sb-event-kit'

import Connection from './connection'
import * as Helpers from './helpers'
import type { DownloadConfig } from './types'

class Download {
  pool: RangePool;
  emitter: Emitter;
  options: DownloadConfig;
  connections: Set<Connection>
  subscriptions: CompositeDisposable;
  constructor(options: DownloadConfig) {
    this.pool = new RangePool(Infinity)
    this.emitter = new Emitter()
    this.options = Helpers.fillOptions(options)
    this.connections = new Set()
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.emitter)
    this.pool.setMetadata({
      lastChunkId: 0,
    })
  }
  async activate(): Promise<void> {
    const filenameIsTemporary = !this.options.output.file
    const filename = filenameIsTemporary ? Path.join(this.options.output.directory, `download-${Helpers.getRandomString()}`) : this.options.output.file
    invariant(filename)

    const firstConnection = this.getConnection(filename)

  }
  getConnection(filePath: string): Connection {
    const poolWorker = this.pool.getWorker()
    const poolMetadata = this.pool.getMetadata()
    const poolWorkerId = ++poolMetadata.lastChunkId

    poolWorker.setMetadata({ id: poolWorkerId })
    this.pool.setMetadata(poolMetadata)

    const connection = new Connection(this.options, poolWorker, `${filePath}.part-${poolWorkerId}`)
    this.connections.add(connection)

    return connection
  }
  dispose() {
    // TODO: Save state here
    this.subscriptions.dispose()
  }
}

function download(config: DownloadConfig): Download {
  return new Download(config)
}

export { Download, download }
export default download
